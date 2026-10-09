import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {loadShow} from './lib/shows.mjs';
import {addToPlaylist, assertShowChannel, channelOf, getAccessToken, youtubeMetadata} from './lib/youtube.mjs';
import {analyticsPath, linkVideo, readAnalytics, writeAnalytics} from './lib/analytics.mjs';
import {episodeOutPath} from './lib/out.mjs';

const args = process.argv.slice(2);
const episodeId = resolveEpisodeId(args.find((arg) => !arg.startsWith('--')));
if (!episodeId) throw new Error('Usage: npm run youtube:upload -- <episode-id> [--privacy=private|unlisted|public] [--publish-at=<ISO>] [--made-for-kids=true|false] [--notify-subscribers=true|false] [--dry-run]');

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
const publishAt = valueOf('publish-at');
const madeForKids = boolArg('made-for-kids');
const notifySubscribers = boolArg('notify-subscribers') ?? false;
const dryRun = has('dry-run');

const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const videoPath = episodeOutPath(root, episodeId, `${episodeId}.mp4`);
if (!fs.existsSync(videoPath)) throw new Error(`Missing rendered video: ${path.relative(root, videoPath)}. Render it first.`);

const requiresPublicReleaseClearance = privacy !== 'private' || Boolean(publishAt);
if (requiresPublicReleaseClearance) {
  const preflight = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/preflight-publish.ts', episodeId], {cwd: root, stdio: 'inherit'});
  if (preflight.status !== 0) process.exit(preflight.status ?? 1);
}

const show = loadShow(manifest.show.id);
const metadata = youtubeMetadata(manifest, {privacy, publishAt, madeForKids, show});
const preview = {
  episodeId,
  file: path.relative(root, videoPath),
  notifySubscribers,
  ...metadata,
};

if (dryRun) {
  console.log(JSON.stringify(preview, null, 2));
  process.exit(0);
}

// The show's own login, and only onto the show's own channel.
const accessToken = await getAccessToken(root, {show: show.id});
const channel = await channelOf(accessToken);
assertShowChannel(show, channel);
console.log(`▶ uploading to ${channel.title} (${channel.id})`);
const stat = fs.statSync(videoPath);
const initUrl = new URL('https://www.googleapis.com/upload/youtube/v3/videos');
initUrl.searchParams.set('uploadType', 'resumable');
initUrl.searchParams.set('part', 'snippet,status');
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
};
const receiptPath = episodeOutPath(root, episodeId, `${episodeId}-youtube.json`);
fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
// Link the episode to its video for npm run analytics (committed, unlike the receipt in out/).
// The upload has already succeeded, so a problem here only warns.
const analyticsFile = analyticsPath(root, manifest.show.id, episodeId);
try {
  writeAnalytics(analyticsFile, linkVideo(readAnalytics(analyticsFile), {episodeId, video: video.id, publishedAt: metadata.status.publishAt}));
} catch (error) {
  console.warn(`⚠ not linked for analytics: ${error instanceof Error ? error.message : error} Keep the existing link, or remove ${path.relative(root, analyticsFile)} and run: npm run analytics -- link ${episodeId} ${video.id}`);
}
// Add it to the show's playlist. The upload has already succeeded, so a problem here only warns:
// add it later with npm run youtube:playlist -- <id>.
const playlistId = show.publishing?.playlistId;
if (playlistId) {
  try {
    await addToPlaylist(accessToken, playlistId, video.id);
    console.log(`✓ added to playlist ${playlistId}`);
  } catch (error) {
    console.warn(`⚠ not added to the playlist: ${error instanceof Error ? error.message : error}\n  Add it later with: npm run youtube:playlist -- ${episodeId}`);
  }
}
console.log(`✓ YouTube upload complete: ${receipt.url}`);
console.log(`✓ receipt: ${path.relative(root, receiptPath)}`);
