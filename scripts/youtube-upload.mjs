import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {addToPlaylist, findOrCreatePlaylist, getAccessToken, listScheduledPublishTimes, nextReleaseSlot, youtubeMetadata} from './lib/youtube.mjs';
import {loadShow} from './lib/shows.mjs';
import {analyticsPath, linkVideo, readAnalytics, writeAnalytics} from './lib/analytics.mjs';

const args = process.argv.slice(2);
const episodeId = resolveEpisodeId(args.find((arg) => !arg.startsWith('--')));
if (!episodeId) throw new Error('Usage: npm run youtube:upload -- <episode-id> [--privacy=private|unlisted|public] [--publish-at=<ISO>|--schedule=next] [--playlist=<title>|none] [--made-for-kids=true|false] [--notify-subscribers=true|false] [--dry-run]');

const valueOf = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name) => args.includes(`--${name}`);
const boolArg = (name) => {
  const value = valueOf(name);
  if (value === undefined) return undefined;
  if (!['true', 'false'].includes(value)) throw new Error(`--${name} must be true or false`);
  return value === 'true';
};

const privacy = valueOf('privacy') ?? 'private';
if (!['private', 'unlisted', 'public'].includes(privacy)) throw new Error(`Unsupported privacy: ${privacy}`);
const scheduleArg = valueOf('schedule');
if (scheduleArg !== undefined && scheduleArg !== 'next') throw new Error('--schedule only supports "next": the next free daily slot. Use --publish-at=<ISO> for an exact time.');
if (scheduleArg && valueOf('publish-at')) throw new Error('Use either --schedule=next or --publish-at, not both.');
const notifySubscribers = boolArg('notify-subscribers') ?? false;
const dryRun = has('dry-run');

const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const presets = loadShow(manifest.show.id).youtube;
const madeForKids = boolArg('made-for-kids') ?? presets?.madeForKids;
const playlistArg = valueOf('playlist');
const playlistTitle = playlistArg === 'none' ? undefined : playlistArg ?? presets?.playlist;
const videoPath = path.join(root, 'out', `${episodeId}.mp4`);
if (!fs.existsSync(videoPath)) throw new Error(`Missing rendered video: ${path.relative(root, videoPath)}. Render it first.`);

let accessToken;
let publishAt = valueOf('publish-at');
if (scheduleArg) {
  if (!presets) throw new Error(`shows/${manifest.show.id}.json has no "youtube" block with a schedule; add one or use --publish-at.`);
  let taken = [];
  try {
    accessToken = await getAccessToken(root);
    taken = await listScheduledPublishTimes(accessToken);
  } catch (error) {
    if (!dryRun) throw error;
    console.warn(`⚠ could not read the channel's scheduled videos (${error instanceof Error ? error.message : error}); the slot below assumes nothing is scheduled.`);
  }
  publishAt = nextReleaseSlot(presets.schedule, taken).toISOString();
  console.log(`▶ next free slot: ${publishAt} (${presets.schedule.time} ${presets.schedule.timeZone}; ${taken.length} already scheduled)`);
}

const requiresPublicReleaseClearance = privacy !== 'private' || Boolean(publishAt);
if (requiresPublicReleaseClearance) {
  const preflight = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/preflight-publish.ts', episodeId], {cwd: root, stdio: 'inherit'});
  if (preflight.status !== 0) process.exit(preflight.status ?? 1);
}

const metadata = youtubeMetadata(manifest, {
  privacy,
  publishAt,
  madeForKids,
  categoryId: presets?.categoryId,
  alteredContent: presets?.alteredContent,
  paidPromotion: presets?.paidPromotion,
});
const preview = {
  episodeId,
  file: path.relative(root, videoPath),
  notifySubscribers,
  playlist: playlistTitle ?? null,
  ...metadata,
};

if (dryRun) {
  console.log(JSON.stringify(preview, null, 2));
  process.exit(0);
}

accessToken ??= await getAccessToken(root);
const stat = fs.statSync(videoPath);
const initUrl = new URL('https://www.googleapis.com/upload/youtube/v3/videos');
initUrl.searchParams.set('uploadType', 'resumable');
initUrl.searchParams.set('part', Object.keys(metadata).join(','));
initUrl.searchParams.set('notifySubscribers', String(notifySubscribers));

const initResponse = await fetch(initUrl, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json; charset=UTF-8',
    'x-upload-content-length': String(stat.size),
    'x-upload-content-type': 'video/mp4',
  },
  body: JSON.stringify(metadata),
});

if (!initResponse.ok) {
  const body = await initResponse.text();
  throw new Error(`YouTube upload session failed (${initResponse.status}): ${body}`);
}
const uploadUrl = initResponse.headers.get('location');
if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL.');

console.log(`▶ uploading ${episodeId} (${(stat.size / 1024 / 1024).toFixed(1)} MB) to YouTube as ${metadata.status.privacyStatus}${publishAt ? `, scheduled ${metadata.status.publishAt}` : ''}`);
const uploadResponse = await fetch(uploadUrl, {
  method: 'PUT',
  headers: {'content-type': 'video/mp4', 'content-length': String(stat.size)},
  body: fs.createReadStream(videoPath),
  duplex: 'half',
});
const body = await uploadResponse.text();
if (!uploadResponse.ok) throw new Error(`YouTube upload failed (${uploadResponse.status}): ${body}`);
const video = JSON.parse(body);

const receipt = {
  episodeId,
  youtubeId: video.id,
  url: `https://www.youtube.com/watch?v=${video.id}`,
  uploadedAt: new Date().toISOString(),
  requestedPrivacy: privacy,
  scheduledPublishAt: metadata.status.publishAt ?? null,
  notifySubscribers,
  title: metadata.snippet.title,
  playlist: null,
};
// The upload has succeeded, so a playlist problem only warns; the receipt keeps the video id to retry by hand.
if (playlistTitle) {
  try {
    const playlist = await findOrCreatePlaylist(accessToken, playlistTitle);
    await addToPlaylist(accessToken, playlist.id, video.id);
    receipt.playlist = {title: playlistTitle, id: playlist.id};
    console.log(`✓ added to playlist "${playlistTitle}"${playlist.created ? ' (created)' : ''}`);
  } catch (error) {
    receipt.playlistError = error instanceof Error ? error.message : String(error);
    console.warn(`⚠ uploaded, but not added to playlist "${playlistTitle}": ${receipt.playlistError}`);
  }
}
const receiptPath = path.join(root, 'out', `${episodeId}-youtube.json`);
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
// Link the episode to its video for npm run analytics (committed, unlike the receipt in out/).
// The upload has already succeeded, so a problem here only warns.
const analyticsFile = analyticsPath(root, manifest.show.id, episodeId);
try {
  writeAnalytics(analyticsFile, linkVideo(readAnalytics(analyticsFile), {episodeId, video: video.id, publishedAt: metadata.status.publishAt}));
} catch (error) {
  console.warn(`⚠ not linked for analytics: ${error instanceof Error ? error.message : error} Keep the existing link, or remove ${path.relative(root, analyticsFile)} and run: npm run analytics -- link ${episodeId} ${video.id}`);
}
console.log(`✓ YouTube upload complete: ${receipt.url}`);
console.log(`✓ receipt: ${path.relative(root, receiptPath)}`);
