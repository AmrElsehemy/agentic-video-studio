import assert from 'node:assert/strict';
import test from 'node:test';
import {youtubeMetadata} from '../scripts/lib/youtube.mjs';

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
});
