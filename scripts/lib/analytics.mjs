// Close the loop (#25): record how published episodes perform, and line the
// numbers up against how each episode was built (story shape, hook, length,
// engagement-audit score) so the director's defaults can be recalibrated from
// evidence rather than taste.
import fs from 'node:fs';
import path from 'node:path';
import {episodeAnalyticsSchema, snapshotSchema} from '../analytics-schema.mjs';
import {scoreEpisode} from './engagement.mjs';

export const analyticsPath = (root, showId, episodeId) => path.join(root, 'analytics', showId, `${episodeId}.json`);

/** A YouTube video id from an id or any watch/shorts/youtu.be URL. */
export const youtubeVideoId = (value) => {
  const text = String(value ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  const match = text.match(/(?:youtu\.be\/|\/shorts\/|[?&]v=|\/embed\/)([A-Za-z0-9_-]{11})/);
  if (!match) throw new Error(`Not a YouTube video id or URL: ${value}`);
  return match[1];
};

export const readAnalytics = (file) => (fs.existsSync(file) ? episodeAnalyticsSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : undefined);

export const writeAnalytics = (file, record) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(episodeAnalyticsSchema.parse(record), null, 2)}\n`);
};

/** Start or update an episode's record with its video; existing snapshots are kept. */
export const linkVideo = (existing, {episodeId, video, publishedAt}) => {
  const videoId = youtubeVideoId(video);
  if (existing && existing.videoId !== videoId) throw new Error(`${episodeId} is already linked to video ${existing.videoId}; refusing to switch it to ${videoId}.`);
  return episodeAnalyticsSchema.parse({
    schemaVersion: 1,
    episodeId,
    platform: 'youtube',
    videoId,
    url: `https://youtube.com/shorts/${videoId}`,
    ...(existing ?? {}),
    ...(publishedAt ? {publishedAt} : {}),
    snapshots: existing?.snapshots ?? [],
  });
};

export const addSnapshot = (record, snapshot) => ({...record, snapshots: [...record.snapshots, snapshotSchema.parse(snapshot)].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))});

const ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
const METRICS = ['views', 'averageViewDuration', 'averageViewPercentage', 'likes', 'comments', 'shares', 'subscribersGained'];

/**
 * The video's lifetime numbers and retention curve from the YouTube Analytics
 * API (needs the yt-analytics.readonly scope: run npm run youtube:auth again).
 */
export const fetchYouTubeSnapshot = async ({videoId, accessToken, startDate, now = new Date(), fetchImpl = fetch}) => {
  const endDate = now.toISOString().slice(0, 10);
  const query = async (params) => {
    const url = new URL(ANALYTICS_URL);
    url.search = new URLSearchParams({ids: 'channel==MINE', startDate, endDate, filters: `video==${videoId}`, ...params}).toString();
    const response = await fetchImpl(url, {headers: {authorization: `Bearer ${accessToken}`}});
    const body = await response.json();
    if (!response.ok) {
      const message = body?.error?.message ?? JSON.stringify(body);
      const scope = response.status === 403 ? ' The token may lack the analytics scope: run npm run youtube:auth again.' : '';
      throw new Error(`YouTube Analytics request failed (${response.status}): ${message}.${scope}`);
    }
    return body;
  };
  const totals = await query({metrics: METRICS.join(',')});
  const row = totals.rows?.[0] ?? METRICS.map(() => 0);
  const value = (name) => Number(row[METRICS.indexOf(name)] ?? 0);
  const curve = await query({metrics: 'audienceWatchRatio', dimensions: 'elapsedVideoTimeRatio'});
  return snapshotSchema.parse({
    capturedAt: now.toISOString(),
    source: 'youtube-analytics',
    views: value('views'),
    averageViewSeconds: value('averageViewDuration'),
    averageViewPercent: value('averageViewPercentage'),
    likes: value('likes'),
    comments: value('comments'),
    shares: value('shares'),
    subscribersGained: value('subscribersGained'),
    ...(curve.rows?.length ? {retention: curve.rows.map(([at, watching]) => ({at: Number(at), watching: Number(watching)}))} : {}),
  });
};

/** Share of viewers still watching at a point of the video, interpolated from the retention curve. */
export const watchingAt = (retention, at) => {
  if (!retention?.length) return undefined;
  const points = [...retention].sort((a, b) => a.at - b.at);
  if (at <= points[0].at) return points[0].watching;
  for (let index = 1; index < points.length; index++) {
    const [a, b] = [points[index - 1], points[index]];
    if (at <= b.at) return a.watching + (b.watching - a.watching) * ((at - a.at) / (b.at - a.at || 1));
  }
  return points.at(-1).watching;
};

/** How an episode was built: the levers the director controls. */
export const episodeFeatures = (manifest) => {
  const total = manifest.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const hook = manifest.scenes[0];
  return {
    storyPattern: manifest.direction.storyPattern,
    hookHeadline: hook.headline,
    hookSeconds: hook.durationSeconds,
    totalSeconds: Math.round(total * 10) / 10,
    scenes: manifest.scenes.length,
    primitives: manifest.scenes.filter((scene) => scene.primitive).length,
    auditScore: scoreEpisode(manifest).score,
  };
};

/** Pearson correlation, or undefined when there are too few points or no spread. */
export const correlation = (xs, ys) => {
  const n = xs.length;
  if (n < 3) return undefined;
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / n;
  const [mx, my] = [mean(xs), mean(ys)];
  const cov = xs.reduce((sum, x, index) => sum + (x - mx) * (ys[index] - my), 0);
  const sx = Math.sqrt(xs.reduce((sum, x) => sum + (x - mx) ** 2, 0));
  const sy = Math.sqrt(ys.reduce((sum, y) => sum + (y - my) ** 2, 0));
  return sx && sy ? cov / (sx * sy) : undefined;
};

/** Episodes needed before the report reads anything into the numbers. */
export const MIN_EPISODES_FOR_TRENDS = 5;

/** Dollars per 1,000 views, or undefined before an episode has views or a known cost (#89). */
export const costPerThousandViews = (cost, views) => (cost == null || !views ? undefined : (cost / views) * 1000);

/**
 * One row per published episode (its latest snapshot joined with how it was
 * built and what it cost to make), plus correlations between the levers and
 * completion once enough episodes have data. `entries` is
 * [{manifest, analytics, cost?}], cost being the production log's estimate in dollars.
 */
export const buildReport = (entries) => {
  const rows = entries.map(({manifest, analytics, cost}) => {
    const latest = analytics.snapshots.at(-1);
    const features = episodeFeatures(manifest);
    return {
      episodeId: manifest.id,
      show: manifest.show.id,
      url: analytics.url,
      ...features,
      ...(cost == null ? {} : {cost}),
      snapshot: latest ? {
        capturedAt: latest.capturedAt,
        views: latest.views,
        averageViewPercent: latest.averageViewPercent,
        averageViewSeconds: latest.averageViewSeconds,
        // Viewers still there when the hook ends: how well the opening holds.
        hookHold: watchingAt(latest.retention, features.hookSeconds / features.totalSeconds),
        engagementRate: latest.views ? ((latest.likes ?? 0) + (latest.comments ?? 0) + (latest.shares ?? 0)) / latest.views : undefined,
        costPerThousandViews: costPerThousandViews(cost, latest.views),
      } : undefined,
    };
  });
  const measured = rows.filter((row) => row.snapshot?.averageViewPercent !== undefined);
  const trends = measured.length >= MIN_EPISODES_FOR_TRENDS
    ? Object.fromEntries(['hookSeconds', 'totalSeconds', 'scenes', 'primitives', 'auditScore'].map((feature) => [feature, correlation(measured.map((row) => row[feature]), measured.map((row) => row.snapshot.averageViewPercent))]))
    : undefined;
  return {rows, measured: measured.length, trends};
};
