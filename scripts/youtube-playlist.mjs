// Add already-uploaded episodes to the show's YouTube playlist, in order.
// Usage: npm run youtube:playlist -- <id|number|first-last>... [--dry-run]
// Uploads add themselves to publishing.playlistId (shows/<show>.json); this is for episodes uploaded
// before it was set, or when that step failed. Episodes already in the playlist are skipped.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {loadShow} from './lib/shows.mjs';
import {analyticsPath, readAnalytics} from './lib/analytics.mjs';
import {addToPlaylist, assertShowChannel, channelOf, getAccessToken, playlistVideoIds} from './lib/youtube.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targets = args.filter((arg) => !arg.startsWith('--')).flatMap((arg) => {
  const range = arg.match(/^(\d+)-(\d+)$/);
  if (!range) return [arg];
  const [from, to] = [Number(range[1]), Number(range[2])];
  return Array.from({length: Math.max(0, to - from + 1)}, (_, index) => String(from + index));
});
if (!targets.length) throw new Error('Usage: npm run youtube:playlist -- <id|number|first-last>... [--dry-run]   e.g. 10-20');

const episodes = targets.map((target) => {
  const episodeId = resolveEpisodeId(target);
  if (!episodeId) throw new Error(`No episode matches "${target}".`);
  const {manifestPath} = findManifest(episodeId);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const receiptPath = path.join(root, 'out', `${episodeId}-youtube.json`);
  const videoId = (fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')).youtubeId : undefined)
    ?? readAnalytics(analyticsPath(root, manifest.show.id, episodeId))?.videoId;
  return {episodeId, show: loadShow(manifest.show.id), videoId};
});
const shows = new Set(episodes.map((episode) => episode.show.id));
if (shows.size > 1) throw new Error(`Those episodes belong to different shows (${[...shows].join(', ')}); run them separately.`);
const show = episodes[0].show;
const playlistId = show.publishing?.playlistId;
if (!playlistId) throw new Error(`shows/${show.id}.json has no publishing.playlistId.`);

const accessToken = await getAccessToken(root, {show: show.id});
assertShowChannel(show, await channelOf(accessToken));
const present = await playlistVideoIds(accessToken, playlistId);
for (const {episodeId, videoId} of episodes) {
  if (!videoId) { console.log(`  ? ${episodeId} has no upload receipt or analytics link; upload it first`); continue; }
  if (present.has(videoId)) { console.log(`  = ${episodeId} already in the playlist`); continue; }
  if (dryRun) { console.log(`  + ${episodeId} (${videoId}) would be added`); continue; }
  await addToPlaylist(accessToken, playlistId, videoId);
  console.log(`  ✓ ${episodeId} (${videoId}) added`);
}
