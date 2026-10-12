import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import fs from 'node:fs';
import {appendHistory, compareByTag, MIN_GROUP, viewsAtAge} from '../scripts/lib/compare.mjs';
import {featureTags} from '../scripts/lib/feature-tags.mjs';

const manifest = (id: string) => JSON.parse(fs.readFileSync(`videos/geographica/${id}/video.json`, 'utf8'));
const now = new Date('2026-10-12T00:00:00Z');
const row = (n: number, tags: string[], views: number, days = 5) => ({episodeId: `e${n}`, videoId: `v${n}`, publishedAt: new Date(now.getTime() - days * 86_400_000).toISOString(), views, likes: Math.round(views / 50), tags});

describe('feature tags and comparison', () => {
  it('reads what the viewer sees from the manifest', () => {
    const tags = featureTags(manifest('india-passes-china'));
    assert.ok(tags.includes('chart-race') && tags.includes('chart-line'));
    assert.ok(tags.some((tag) => tag.startsWith('story-')));
  });

  it('ranks a feature only when enough episodes sit on both sides', () => {
    const few = compareByTag([row(1, ['a'], 500), row(2, [], 100), row(3, [], 100)], {now});
    assert.equal(few.groups.find((g) => g.tag === 'a')?.readable, false);
    const rows = Array.from({length: MIN_GROUP * 2}, (_, i) => row(i, i < MIN_GROUP ? ['a'] : [], i < MIN_GROUP ? 500 : 100));
    const group = compareByTag(rows, {now}).groups.find((g) => g.tag === 'a');
    assert.equal(group?.readable, true);
    assert.equal(group?.ratio, 5);
  });

  it('leaves out episodes under two days old', () => {
    assert.equal(compareByTag([row(1, ['a'], 900, 1)], {now}).episodes, 0);
  });

  it('reads views at the same age from saved counts, and says when history is too short', () => {
    const history = [{capturedAt: '2026-10-03T00:00:00Z', videos: {v: {views: 200}}}, {capturedAt: '2026-10-05T00:00:00Z', videos: {v: {views: 400}}}];
    assert.equal(viewsAtAge(history, 'v', '2026-10-01T00:00:00Z', 4), 400);
    assert.equal(viewsAtAge(history, 'v', '2026-10-01T00:00:00Z', 3), 300);
    assert.equal(viewsAtAge(history, 'v', '2026-10-01T00:00:00Z', 9), undefined);
  });

  it('keeps one history entry per hour', () => {
    const a = {capturedAt: '2026-10-01T10:00:00Z', videos: {}};
    assert.equal(appendHistory(appendHistory([], a), {...a, capturedAt: '2026-10-01T10:20:00Z'}).length, 1);
  });
});
