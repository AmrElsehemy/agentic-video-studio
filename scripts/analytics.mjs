// Published-episode performance (#25).
//   npm run analytics -- link <id> <video id or URL> [--published-at=<ISO>]   connect an episode to its upload
//   npm run analytics -- record <id> --views=N [--avg-seconds=S --avg-percent=P --likes=N --comments=N --shares=N --subs=N]
//                                                                                add numbers from YouTube Studio by hand
//   npm run analytics -- fetch <id>        pull the numbers and retention curve from the YouTube Analytics API
//   npm run analytics -- report            every published episode, its numbers and how it was built
// Files live in analytics/<show>/<id>.json and are committed, so the history is kept.
import fs from 'node:fs';
import path from 'node:path';
import {findManifest, repoRoot as root, resolveEpisodeId} from './catalog.mjs';
import {addSnapshot, analyticsPath, buildReport, fetchYouTubeSnapshot, linkVideo, MIN_EPISODES_FOR_TRENDS, readAnalytics, writeAnalytics} from './lib/analytics.mjs';
import {getAccessToken} from './lib/youtube.mjs';

const [command, target, ...rest] = process.argv.slice(2);
const option = (name) => rest.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const usage = () => {
  console.error('Usage: npm run analytics -- link <id> <video> [--published-at=<ISO>] | record <id> --views=N [...] | fetch <id> | report');
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
  const parsed = Number(value.replace(/[,%s]/g, ''));
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
  const {episodeId, file} = episode(target);
  const record = linked(file, episodeId);
  const startDate = (record.publishedAt ?? '2020-01-01').slice(0, 10);
  const snapshot = await fetchYouTubeSnapshot({videoId: record.videoId, accessToken: await getAccessToken(root), startDate});
  writeAnalytics(file, addSnapshot(record, snapshot));
  console.log(`✓ ${episodeId}: ${snapshot.views} views, ${snapshot.averageViewPercent?.toFixed(1)}% average viewed${snapshot.retention ? `, retention curve (${snapshot.retention.length} points)` : ''}`);
} else if (command === 'report') {
  const base = path.join(root, 'analytics');
  const files = fs.existsSync(base) ? fs.readdirSync(base).flatMap((show) => fs.readdirSync(path.join(base, show)).filter((name) => name.endsWith('.json')).map((name) => path.join(base, show, name))) : [];
  const entries = files.map((file) => {
    const analytics = readAnalytics(file);
    return {analytics, manifest: JSON.parse(fs.readFileSync(findManifest(analytics.episodeId).manifestPath, 'utf8'))};
  });
  const report = buildReport(entries);
  // Hook hold and engagement are fractions; YouTube reports average % viewed as a percentage already.
  const percent = (value) => (value === undefined ? '–' : `${(value * 100).toFixed(0)}%`);
  console.log(`${report.rows.length} published episode${report.rows.length === 1 ? '' : 's'}, ${report.measured} with numbers\n`);
  console.log('| episode | shape | hook | length | audit | views | avg viewed | hook hold | engagement |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const row of report.rows) {
    const s = row.snapshot;
    console.log(`| ${row.episodeId} | ${row.storyPattern} | ${row.hookSeconds}s | ${row.totalSeconds}s | ${row.auditScore} | ${s?.views ?? '–'} | ${s?.averageViewPercent === undefined ? '–' : `${s.averageViewPercent.toFixed(0)}%`} | ${percent(s?.hookHold)} | ${percent(s?.engagementRate)} |`);
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
} else {
  usage();
}
