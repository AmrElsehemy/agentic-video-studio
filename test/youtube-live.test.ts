import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {liveStats} from '../scripts/lib/youtube.mjs';

const reply = (items: object[]) => async () => ({status: 200, ok: true, json: async () => ({items}), text: async () => ''}) as never;
const item = (id: string, views: string | undefined, privacyStatus = 'public', extra: object = {}) => ({id, snippet: {title: `Title ${id}`, publishedAt: '2026-10-09T10:00:00Z'}, statistics: views === undefined ? {} : {viewCount: views, likeCount: '3', commentCount: '1'}, status: {privacyStatus, ...extra}});

describe('live YouTube counts', () => {
  it('reads views, likes and comments as numbers, in the order asked', async () => {
    const stats = await liveStats('token', ['b', 'a'], {fetchImpl: reply([item('a', '10'), item('b', '2000')])});
    assert.deepEqual(stats.map((s: {videoId: string}) => s.videoId), ['b', 'a']);
    assert.deepEqual([stats[0].views, stats[0].likes, stats[0].comments], [2000, 3, 1]);
  });

  it('reports a scheduled video as private with its publish time, and a missing count as zero', async () => {
    const [scheduled] = await liveStats('token', ['c'], {fetchImpl: reply([item('c', undefined, 'private', {publishAt: '2026-10-12T04:00:00Z'})])});
    assert.equal(scheduled.status, 'private');
    assert.equal(scheduled.publishAt, '2026-10-12T04:00:00Z');
    assert.equal(scheduled.views, 0);
  });

  it('leaves out a video YouTube did not return, and asks for at most 50 at a time', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: URL) => {
      calls.push(url.searchParams.get('id')!);
      return {status: 200, ok: true, json: async () => ({items: []}), text: async () => ''};
    }) as never;
    const ids = Array.from({length: 120}, (_, i) => `v${i}`);
    assert.deepEqual(await liveStats('token', ids, {fetchImpl}), []);
    assert.deepEqual(calls.map((call) => call.split(',').length), [50, 50, 20]);
  });
});
