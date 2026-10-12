import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {latestTaken, nextSlot} from '../scripts/lib/schedule.mjs';

const slots = ['09:00', '21:00'];
const now = new Date('2026-10-12T14:00:00Z');

describe('publishing cadence', () => {
  it('takes the first slot after everything already on the channel', () => {
    assert.equal(nextSlot(slots, {after: '2026-10-22T21:00:00Z', now}), '2026-10-23T09:00:00Z');
    assert.equal(nextSlot(slots, {after: '2026-10-22T09:00:00Z', now}), '2026-10-22T21:00:00Z');
  });

  it('never schedules sooner than the lead time from now', () => {
    assert.equal(nextSlot(slots, {now}), '2026-10-12T21:00:00Z');
    assert.equal(nextSlot(slots, {now: new Date('2026-10-12T20:45:00Z')}), '2026-10-13T09:00:00Z');
  });

  it('reads the latest taken time from scheduled and published videos', () => {
    assert.equal(latestTaken([{publishedAt: '2026-10-12T09:00:01Z'}, {publishAt: '2026-10-17T21:00:00Z', publishedAt: '2026-10-11T18:00:00Z'}]), '2026-10-17T21:00:00Z');
    assert.equal(latestTaken([]), undefined);
  });
});
