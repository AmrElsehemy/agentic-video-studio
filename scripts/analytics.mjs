// Published-episode performance (#25).
//   npm run analytics -- link <id> <video id or URL> [--published-at=<ISO>]   connect an episode to its upload
//   npm run analytics -- record <id> --views=N [--avg-seconds=S --avg-percent=P --likes=N --comments=N --shares=N --subs=N]
//                                                                                add numbers from YouTube Studio by hand
//   npm run analytics -- fetch <id>        pull the numbers and retention curve from the YouTube Analytics API
//   npm run analytics -- report            every published episode, its numbers and how it was built
//   npm run analytics -- link-channel <show> [--dry-run]   link every upload on the show's channel to its episode, by title
// Files live in analytics/<show>/<id>.json and are committed, so the history is kept.
import fs from 'node:fs';
import path from 'node:path';
import {findManifest, listManifests, repoRoot as root, resolveEpisodeId} from './catalog.mjs';
import {addSnapshot, analyticsPath, buildReport, fetchYouTubeSnapshot, linkVideo, MIN_EPISODES_FOR_TRENDS, readAnalytics, writeAnalytics} from './lib/analytics.mjs';
import {readProduction, summarizeProduction} from './lib/production.mjs';
import {loadShow} from './lib/shows.mjs';
import {assertShowChannel, channelOf, getAccessToken, listUploads, matchUploads} from './lib/youtube.mjs';

const [command, target, ...rest] = process.argv.slice(2);
const option = (name) => rest.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const usage = () => {
  console.error('Usage: npm run analytics -- link <id> <video> [--published-at=<ISO>] | record <id> --views=N [...] | fetch <id> | report | link-channel <show> [--dry-run]');
  process.exit(1);
};

const episode = (id) => {
  const episodeId = resolveEpisodeId(id);
  const {manifestPath} = findManifest(episodeId);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return {episodeId, manifest, file: analyticsPath(root, manifest.show.id, episodeId)};
};
const linked = (file, episodeId) => {
  const record = readAnalytics(file);
  if (!record) throw new Error(`${episodeId} isn't linked to a video yet. Run: npm run analytics -- link ${episodeId} <video id or URL>`);
  return record;
};
const number = (name) => {
  const value = option(name);
  if (value === undefined) return undefined;
  const parsed = Number(value.replace(/[,%\s]/g, ''));
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number (got ${value})`);
  return parsed;
};

if (command === 'link') {
  if (!target || !rest[0] || rest[0].startsWith('--')) usage();
  const {episodeId, file} = episode(target);
  const record = linkVideo(readAnalytics(file), {episodeId, video: rest[0], publishedAt: option('published-at')});
  writeAnalytics(file, record);
  console.log(`✓ ${episodeId} → ${record.url} (${path.relative(root, file)})`);
} else if (command === 'record') {
  if (!target) usage();
  const {episodeId, file} = episode(target);
  const views = number('views');
  if (views === undefined) usage();
  const snapshot = Object.fromEntries(Object.entries({
    capturedAt: option('at') ?? new Date().toISOString(),
    source: 'manual',
    views,
    averageViewSeconds: number('avg-seconds'),
    averageViewPercent: number('avg-percent'),
    likes: number('likes'),
    comments: number('comments'),
    shares: number('shares'),
    subscribersGained: number('subs'),
  }).filter(([, value]) => value !== undefined));
  writeAnalytics(file, addSnapshot(linked(file, episodeId), snapshot));
  console.log(`✓ recorded ${views} views for ${episodeId}`);
} else if (command === 'fetch') {
  if (!target) usage();
  const {episodeId, file, manifest} = episode(target);
  const record = linked(file, episodeId);
  const startDate = (record.publishedAt ?? '2020-01-01').slice(0, 10);
  const snapshot = await fetchYouTubeSnapshot({videoId: record.videoId, accessToken: await getAccessToken(root, {show: manifest.show.id}), startDate});
  writeAnalytics(file, addSnapshot(record, snapshot));
  console.log(`✓ ${episodeId}: ${snapshot.views} views, ${snapshot.averageViewPercent?.toFixed(1)}% average viewed${snapshot.retention ? `, retention curve (${snapshot.retention.length} points)` : ''}`);
} else if (command === 'report') {
  const base = path.join(root, 'analytics');
  // Performance files only; each episode's production log (#89) sits beside its own.
  const files = fs.existsSync(base) ? fs.readdirSync(base).flatMap((show) => fs.readdirSync(path.join(base, show)).filter((name) => name.endsWith('.json') && !name.endsWith('.production.json')).map((name) => path.join(base, show, name))) : [];
  const entries = files.map((file) => {
    const analytics = readAnalytics(file);
    const manifest = JSON.parse(fs.readFileSync(findManifest(analytics.episodeId).manifestPath, 'utf8'));
    const log = readProduction(root, manifest.show.id, analytics.episodeId);
    // No log yet means the cost is unknown, not zero.
    return {analytics, manifest, cost: log.entries.length ? summarizeProduction(log, {manifest}).cost : undefined};
  });
  const report = buildReport(entries);
  // Hook hold and engagement are fractions; YouTube reports average % viewed as a percentage already.
  const percent = (value) => (value === undefined ? '–' : `${(value * 100).toFixed(0)}%`);
  console.log(`${report.rows.length} published episode${report.rows.length === 1 ? '' : 's'}, ${report.measured} with numbers\n`);
  const dollars = (value) => (value === undefined ? '–' : `$${value.toFixed(value < 1 ? 3 : 2)}`);
  console.log('| episode | shape | hook | length | audit | views | avg viewed | hook hold | engagement | cost | per 1k views |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const row of report.rows) {
    const s = row.snapshot;
    console.log(`| ${row.episodeId} | ${row.storyPattern} | ${row.hookSeconds}s | ${row.totalSeconds}s | ${row.auditScore} | ${s?.views ?? '–'} | ${s?.averageViewPercent === undefined ? '–' : `${s.averageViewPercent.toFixed(0)}%`} | ${percent(s?.hookHold)} | ${percent(s?.engagementRate)} | ${dollars(row.cost)} | ${dollars(s?.costPerThousandViews)} |`);
  }
  console.log('\nBy palette (topic and posting time differ between episodes; see out/analytics-report.json):');
  for (const [mode, group] of Object.entries(report.byPalette)) {
    console.log(`  ${mode}: ${group.episodes} episode${group.episodes === 1 ? '' : 's'}, ${group.measured} with numbers${group.averageViewPercent === undefined ? '' : `, ${group.averageViewPercent.toFixed(0)}% average viewed`}${group.views === undefined ? '' : `, ${Math.round(group.views)} views on average`}`);
  }
  if (report.trends) {
    console.log('\nCorrelation with average % viewed (−1…1):');
    for (const [feature, r] of Object.entries(report.trends)) console.log(`  ${feature}: ${r === undefined ? 'no spread' : r.toFixed(2)}`);
  } else {
    console.log(`\nTrends need at least ${MIN_EPISODES_FOR_TRENDS} episodes with numbers; until then, compare episodes by eye.`);
  }
  fs.mkdirSync(path.join(root, 'out'), {recursive: true});
  fs.writeFileSync(path.join(root, 'out', 'analytics-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('\n✓ out/analytics-report.json');
} else if (command === 'link-channel') {
  // Videos uploaded by hand: find each on the show's channel and link it to its episode by title.
  if (!target) usage();
  const show = loadShow(target);
  const accessToken = await getAccessToken(root, {show: show.id});
  const channel = await channelOf(accessToken);
  assertShowChannel(show, channel);
  const episodes = listManifests().map((file) => JSON.parse(fs.readFileSync(file, 'utf8'))).filter((manifest) => manifest.show.id === show.id).map((manifest) => ({episodeId: manifest.id, title: manifest.title}));
  const {matched, unmatched} = matchUploads(await listUploads(accessToken, channel.uploads), episodes);
  console.log(`${channel.title} (${channel.id}): ${matched.length} upload(s) match an episode, ${unmatched.length} don't`);
  for (const {episodeId, video} of matched) {
    const file = analyticsPath(root, show.id, episodeId);
    const existing = readAnalytics(file);
    if (existing?.videoId === video.videoId) { console.log(`  = ${episodeId} already linked to ${existing.url}`); continue; }
    if (existing && existing.videoId !== video.videoId) { console.warn(`  ! ${episodeId} is linked to ${existing.url}, not ${video.videoId}; left as it is (use link to change it)`); continue; }
    const record = linkVideo(undefined, {episodeId, video: video.videoId, publishedAt: video.publishedAt});
    if (!rest.includes('--dry-run')) writeAnalytics(file, record);
    console.log(`  ✓ ${episodeId} → ${record.url}${rest.includes('--dry-run') ? ' (dry run)' : ''}`);
  }
  for (const video of unmatched) console.log(`  ? "${video.title}" (${video.videoId}) matches no episode title; link it by hand if it's one: npm run analytics -- link <id> ${video.videoId}`);
} else {
  usage();
}
