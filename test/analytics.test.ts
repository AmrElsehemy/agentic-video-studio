import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {addSnapshot, buildReport, byPaletteMode, correlation, costPerThousandViews, episodeFeatures, fetchYouTubeSnapshot, linkVideo, MIN_EPISODES_FOR_TRENDS, watchingAt, youtubeVideoId} from '../scripts/lib/analytics.mjs';
import {episodeAnalyticsSchema} from '../scripts/analytics-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestOf = (show: string, id: string) => JSON.parse(fs.readFileSync(path.join(root, 'videos', show, id, 'video.json'), 'utf8'));

describe('episode analytics', () => {
  it('reads video ids from ids and every URL form', () => {
    for (const value of ['mjQ2YcEQ3B4', 'https://youtube.com/shorts/mjQ2YcEQ3B4?feature=share', 'https://www.youtube.com/watch?v=mjQ2YcEQ3B4&t=3', 'https://youtu.be/mjQ2YcEQ3B4']) assert.equal(youtubeVideoId(value), 'mjQ2YcEQ3B4');
    assert.throws(() => youtubeVideoId('https://example.com/video'), /Not a YouTube video/);
  });

  it('links an episode once, keeps its snapshots, and refuses to switch videos', () => {
    let record = linkVideo(undefined, {episodeId: 'bulbasaur-001', video: 'https://youtube.com/shorts/mjQ2YcEQ3B4'});
    record = addSnapshot(record, {capturedAt: '2026-10-01T15:00:00Z', source: 'manual', views: 1200, averageViewPercent: 74});
    record = linkVideo(record, {episodeId: 'bulbasaur-001', video: 'mjQ2YcEQ3B4', publishedAt: '2026-09-30T15:00:00Z'});
    assert.equal(record.snapshots.length, 1);
    assert.equal(record.publishedAt, '2026-09-30T15:00:00Z');
    assert.throws(() => linkVideo(record, {episodeId: 'bulbasaur-001', video: 'AAAAAAAAAAA'}), /already linked/);
  });

  it('keeps the committed Bulbasaur record valid', () => {
    const record = episodeAnalyticsSchema.parse(JSON.parse(fs.readFileSync(path.join(root, 'analytics/pokepulses/bulbasaur-001.json'), 'utf8')));
    assert.equal(record.videoId, 'mjQ2YcEQ3B4');
  });

  it('pulls totals and the retention curve from YouTube Analytics', async () => {
    const requests: URL[] = [];
    const fetchImpl = (async (url: URL) => {
      requests.push(url);
      const curve = url.searchParams.get('dimensions') === 'elapsedVideoTimeRatio';
      return new Response(JSON.stringify(curve ? {rows: [[0.01, 1.1], [0.15, 0.82], [1, 0.4]]} : {rows: [[1500, 23.4, 75.2, 90, 12, 7, 3]]}), {status: 200});
    }) as unknown as typeof fetch;
    const snapshot = await fetchYouTubeSnapshot({videoId: 'mjQ2YcEQ3B4', accessToken: 't', startDate: '2026-09-30', now: new Date('2026-10-01T15:00:00Z'), fetchImpl});
    assert.equal(requests[0].searchParams.get('filters'), 'video==mjQ2YcEQ3B4');
    assert.equal(requests[0].searchParams.get('endDate'), '2026-10-01');
    assert.ok(snapshot);
    assert.deepEqual({views: snapshot.views, avg: snapshot.averageViewPercent, shares: snapshot.shares, subs: snapshot.subscribersGained}, {views: 1500, avg: 75.2, shares: 7, subs: 3});
    assert.equal(snapshot.retention?.length, 3);
  });

  it('returns nothing while YouTube Analytics has no views yet, instead of zeros', async () => {
    const zeros = (async () => new Response(JSON.stringify({rows: [[0, 0, 0, 0, 0, 0, 0]]}), {status: 200})) as unknown as typeof fetch;
    assert.equal(await fetchYouTubeSnapshot({videoId: 'mjQ2YcEQ3B4', accessToken: 't', startDate: '2026-10-05', fetchImpl: zeros}), undefined);
    const fetchImpl = (async () => new Response(JSON.stringify({columnHeaders: []}), {status: 200})) as unknown as typeof fetch;
    assert.equal(await fetchYouTubeSnapshot({videoId: 'mjQ2YcEQ3B4', accessToken: 't', startDate: '2026-10-05', fetchImpl}), undefined);
  });

  it('explains a missing analytics scope', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({error: {message: 'Insufficient permission'}}), {status: 403})) as unknown as typeof fetch;
    await assert.rejects(fetchYouTubeSnapshot({videoId: 'mjQ2YcEQ3B4', accessToken: 't', startDate: '2026-09-30', fetchImpl}), /run npm run youtube:auth again/);
  });

  it('reads the hook hold from the retention curve', () => {
    const curve = [{at: 0, watching: 1}, {at: .2, watching: .8}, {at: 1, watching: .4}];
    assert.equal(watchingAt(curve, .1), .9);
    assert.equal(watchingAt(curve, 1), .4);
    assert.equal(watchingAt(undefined, .1), undefined);
  });

  it('describes how an episode was built', () => {
    const features = episodeFeatures(manifestOf('pokepulses', 'bulbasaur-001'));
    assert.equal(features.storyPattern, 'profile');
    assert.equal(features.hookSeconds, manifestOf('pokepulses', 'bulbasaur-001').scenes[0].durationSeconds);
    assert.ok(features.auditScore >= 80);
  });

  it('joins numbers with structure, and only reports trends with enough episodes', () => {
    const ids = [['pokepulses', 'bulbasaur-001'], ['pokepulses', 'mew-151'], ['pokepulses', 'swablu-333'], ['pokepulses', 'darmanitan-555'], ['geographica', 'georgia-wine']];
    const entries = ids.map(([show, id], index) => ({
      manifest: manifestOf(show, id),
      analytics: addSnapshot(linkVideo(undefined, {episodeId: id, video: `vid${index}AAAAAAA`.slice(0, 11)}), {capturedAt: '2026-10-01T00:00:00Z', source: 'manual', views: 100 * (index + 1), averageViewPercent: 50 + index * 5, likes: 10, retention: [{at: 0, watching: 1}, {at: 1, watching: .5}]}),
    }));
    const few = buildReport(entries.slice(0, 2));
    assert.equal(few.trends, undefined);
    assert.ok(few.rows[0].snapshot?.hookHold && few.rows[0].snapshot.hookHold < 1);
    assert.equal(few.rows[0].snapshot?.engagementRate, 0.1);
    const enough = buildReport(entries);
    assert.equal(enough.measured, MIN_EPISODES_FOR_TRENDS);
    assert.ok(enough.trends && 'hookSeconds' in enough.trends);
  });

  it('puts what an episode cost to make next to its views', () => {
    const analytics = addSnapshot(linkVideo(undefined, {episodeId: 'silk-road', video: 'vidSILKROAD'}), {capturedAt: '2026-10-01T00:00:00Z', source: 'manual', views: 2000});
    const [row] = buildReport([{manifest: manifestOf('geographica', 'silk-road'), analytics, cost: .5}]).rows;
    assert.equal(row.cost, .5);
    // $0.50 over 2,000 views is $0.25 per thousand.
    assert.equal(row.snapshot?.costPerThousandViews, .25);
    assert.equal(costPerThousandViews(.5, 0), undefined);
    assert.equal(costPerThousandViews(null, 100), undefined);
    const [unknown] = buildReport([{manifest: manifestOf('geographica', 'silk-road'), analytics}]).rows;
    assert.equal(unknown.cost, undefined);
    assert.equal(unknown.snapshot?.costPerThousandViews, undefined);
  });

  it('groups episodes by palette mode, with what the comparison can\'t control for', () => {
    const snapshot = (views: number, averageViewPercent: number) => ({capturedAt: '2026-10-02T00:00:00Z', source: 'manual' as const, views, averageViewPercent});
    const entries = [['geographica', 'silk-road', 400, 60], ['geographica', 'silk-road-light', 600, 70], ['geographica', 'georgia-wine', 0, 0]].map(([show, id, views, percent]) => ({
      manifest: manifestOf(show as string, id as string),
      analytics: addSnapshot(linkVideo(undefined, {episodeId: id as string, video: `${id}AAAAAAAAAAA`.replace(/-/g, '').slice(0, 11), publishedAt: '2026-10-01T17:00:00Z'}), snapshot(views as number, percent as number)),
    }));
    const {byPalette, measured} = buildReport(entries);
    // The 0-view snapshot isn't counted as measured.
    assert.equal(measured, 2);
    assert.equal(byPalette.dark.episodes, 2);
    assert.equal(byPalette.dark.measured, 1);
    assert.equal(byPalette.dark.averageViewPercent, 60);
    assert.equal(byPalette.light.averageViewPercent, 70);
    assert.deepEqual(byPalette.light.confounders, [{episodeId: 'silk-road-light', topic: 'Silk Road', publishedAt: '2026-10-01T17:00:00Z'}]);
    assert.deepEqual(byPaletteMode([]).light, {episodes: 0, measured: 0, averageViewPercent: undefined, views: undefined, confounders: []});
  });

  it('reads performance files only, not the production logs beside them', () => {
    // analytics/geographica/silk-road.production.json is committed (#89); the report must not parse it as performance.
    assert.ok(fs.existsSync(path.join(root, 'analytics', 'geographica', 'silk-road.production.json')));
    const run = spawnSync(process.execPath, ['scripts/analytics.mjs', 'report'], {cwd: root, encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /per 1k views/);
  });

  it('computes correlation only when it means something', () => {
    assert.equal(correlation([1, 2], [1, 2]), undefined);
    assert.equal(correlation([1, 1, 1], [1, 2, 3]), undefined);
    assert.ok(Math.abs((correlation([1, 2, 3], [2, 4, 6]) ?? 0) - 1) < 1e-9);
  });
});
