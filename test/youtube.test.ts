import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {creditLine, episodeDescription} from '../scripts/lib/description.mjs';
import {loadShow} from '../scripts/lib/shows.mjs';
import {youtubeMetadata} from '../scripts/lib/youtube.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

test('youtube description', async (t) => {
  const read = (show: string, id: string) => JSON.parse(fs.readFileSync(path.join(root, 'videos', show, id, 'video.json'), 'utf8'));

  await t.test('credits how a map episode was made, without model names', () => {
    const silkRoad = read('geographica', 'silk-road');
    assert.equal(creditLine(silkRoad), 'Animated in code · Narration: AI-generated voice (OpenAI TTS) · Map data: Natural Earth');
    const {snippet} = youtubeMetadata(silkRoad, {show: loadShow('geographica')});
    assert.match(snippet.description, /Animated in code · Narration: AI-generated voice \(OpenAI TTS\) · Map data: Natural Earth/);
    assert.match(snippet.description, /Made with Natural Earth/);
    assert.doesNotMatch(snippet.description, /gpt-|claude-|tts-1|gpt-4o/i);
  });

  await t.test("uses the show's own hashtags and tags, so a Geographica upload isn't tagged as Pokémon", () => {
    const {snippet} = youtubeMetadata(read('geographica', 'silk-road'), {show: loadShow('geographica')});
    assert.match(snippet.description, /#Geography #Maps #Geographica #Shorts$/);
    assert.doesNotMatch(snippet.description, /#Pokemon/);
    assert.ok(snippet.tags.includes('Geography') && snippet.tags.includes('Silk Road'));
    assert.ok(!snippet.tags.includes('Pokemon'));
  });

  await t.test('credits a Pokémon episode without map data', () => {
    const bulbasaur = read('pokepulses', 'bulbasaur-001');
    assert.equal(creditLine(bulbasaur), 'Animated in code · Narration: AI-generated voice (OpenAI TTS)');
    assert.match(youtubeMetadata(bulbasaur).snippet.description, /#Pokemon #PokePulses #Shorts$/);
  });

  await t.test('is the same text the description file shows', () => {
    const silkRoad = read('geographica', 'silk-road');
    assert.equal(youtubeMetadata(silkRoad, {show: loadShow('geographica')}).snippet.description, episodeDescription(silkRoad, loadShow('geographica')));
  });
});
