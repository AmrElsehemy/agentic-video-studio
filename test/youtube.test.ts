import assert from 'node:assert/strict';
import test from 'node:test';
import {loadShow} from '../scripts/lib/shows.mjs';
import {localDay, nextReleaseSlot, youtubeMetadata, zonedInstant} from '../scripts/lib/youtube.mjs';

const manifest = {
  title: 'Charmander Can Do More Than Breathe Fire',
  subject: {name: 'Charmander', identifier: '#004'},
  sources: [{label: 'PokéAPI', url: 'https://pokeapi.co/'}],
  audio: {voice: {model: 'gpt-4o-mini-tts'}},
  rights: {
    nonAffiliationNotice: 'Unofficial fan-made educational project.',
    ownershipNotice: 'Pokémon IP belongs to its respective owners.',
  },
};

test('youtube metadata', async (t) => {
  await t.test('builds Shorts metadata for a private review upload', () => {
    const metadata = youtubeMetadata(manifest, {privacy: 'private'});
    assert.equal(metadata.status.privacyStatus, 'private');
    assert.match(metadata.snippet.title, /#Shorts$/);
    assert.ok(metadata.snippet.title.length <= 100);
    assert.ok(metadata.snippet.tags.includes('Charmander'));
    assert.match(metadata.snippet.description, /Narration: AI-generated voice/);
    assert.match(metadata.snippet.description, /#Pokemon #PokePulses #Shorts/);
  });

  await t.test('uses private plus publishAt for scheduled releases', () => {
    const metadata = youtubeMetadata(manifest, {privacy: 'public', publishAt: '2026-10-01T17:00:00Z'});
    assert.equal(metadata.status.privacyStatus, 'private');
    assert.equal(metadata.status.publishAt, '2026-10-01T17:00:00.000Z');
  });

  await t.test('does not guess made-for-kids status', () => {
    const unspecified = youtubeMetadata(manifest, {privacy: 'private'});
    assert.equal('selfDeclaredMadeForKids' in unspecified.status, false);
    const explicit = youtubeMetadata(manifest, {privacy: 'private', madeForKids: false});
    assert.equal(explicit.status.selfDeclaredMadeForKids, false);
  });

  await t.test('applies the Studio presets', () => {
    const metadata = youtubeMetadata(manifest, {privacy: 'private', madeForKids: true, categoryId: '24', alteredContent: false, paidPromotion: false});
    assert.equal(metadata.snippet.categoryId, '24');
    assert.equal(metadata.status.selfDeclaredMadeForKids, true);
    assert.equal(metadata.status.containsSyntheticMedia, false);
    assert.equal('paidProductPlacementDetails' in metadata, false);
    assert.deepEqual(youtubeMetadata(manifest, {paidPromotion: true}).paidProductPlacementDetails, {hasPaidProductPlacement: true});
  });

  await t.test('PokePulses presets: Entertainment, not paid, no AI disclosure, made for kids, Pokemon Fun Facts', () => {
    assert.deepEqual(loadShow('pokepulses').youtube, {
      categoryId: '24', paidPromotion: false, alteredContent: false, madeForKids: true, playlist: 'Pokemon Fun Facts',
      schedule: {time: '07:00', timeZone: 'Africa/Cairo'},
    });
  });
});

test('daily release slots', async (t) => {
  const schedule = {time: '07:00', timeZone: 'Africa/Cairo'};

  await t.test('converts a local wall-clock time to UTC, across daylight saving', () => {
    assert.equal(zonedInstant('2026-01-15', '07:00', 'Africa/Cairo').toISOString(), '2026-01-15T05:00:00.000Z');
    assert.equal(zonedInstant('2026-10-08', '07:00', 'America/New_York').toISOString(), '2026-10-08T11:00:00.000Z');
    assert.equal(zonedInstant('2026-12-08', '07:00', 'America/New_York').toISOString(), '2026-12-08T12:00:00.000Z');
  });

  await t.test('takes the day after the last scheduled release', () => {
    const taken = ['2026-10-02', '2026-10-03', '2026-10-04'].map((day) => zonedInstant(day, '07:00', schedule.timeZone).toISOString());
    const slot = nextReleaseSlot(schedule, taken, {now: new Date('2026-10-01T12:00:00Z')});
    assert.equal(localDay(slot, schedule.timeZone), '2026-10-05');
    assert.equal(slot.toISOString(), zonedInstant('2026-10-05', '07:00', schedule.timeZone).toISOString());
  });

  await t.test('fills a gap before extending the end', () => {
    const taken = ['2026-10-02', '2026-10-04'].map((day) => zonedInstant(day, '07:00', schedule.timeZone).toISOString());
    assert.equal(localDay(nextReleaseSlot(schedule, taken, {now: new Date('2026-10-01T12:00:00Z')}), schedule.timeZone), '2026-10-03');
  });

  await t.test("uses today when today's slot is still ahead, tomorrow once it is too close", () => {
    assert.equal(localDay(nextReleaseSlot(schedule, [], {now: new Date('2026-10-01T01:00:00Z')}), schedule.timeZone), '2026-10-01');
    assert.equal(localDay(nextReleaseSlot(schedule, [], {now: new Date('2026-10-01T04:50:00Z')}), schedule.timeZone), '2026-10-02');
  });
});
