import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {creditLine, episodeDescription} from '../scripts/lib/description.mjs';
import {loadShow} from '../scripts/lib/shows.mjs';
import {addToPlaylist, youtubeMetadata} from '../scripts/lib/youtube.mjs';

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
    const undeclared = {...loadShow('pokepulses'), publishing: {...loadShow('pokepulses').publishing!, madeForKids: undefined}};
    const unspecified = youtubeMetadata(manifest, {privacy: 'private', show: undeclared});
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

test('made-for-kids declaration', async (t) => {
  const show = (madeForKids?: boolean) => ({...loadShow('pokepulses'), publishing: {...loadShow('pokepulses').publishing!, madeForKids}});
  await t.test('uses the show profile unless the flag overrides it', () => {
    assert.equal(youtubeMetadata(manifest, {show: show(false)}).status.selfDeclaredMadeForKids, false);
    assert.equal(youtubeMetadata(manifest, {show: show(false), madeForKids: true}).status.selfDeclaredMadeForKids, true);
  });
  await t.test('leaves it undeclared when neither says', () => {
    assert.equal('selfDeclaredMadeForKids' in youtubeMetadata(manifest, {show: show(undefined)}).status, false);
  });
});

test('adding an upload to a playlist', async (t) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});

  await t.test('inserts the video and sends the playlist and video ids', async () => {
    const calls: {url: string; body?: any}[] = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls.push({url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined});
      return init?.method === 'POST' ? json({id: 'item'}) : json({items: [{contentDetails: {videoId: 'other'}}]});
    }) as typeof fetch;
    assert.equal(await addToPlaylist('token', 'PLabc1234567', 'vid1', {fetchImpl}), true);
    const insert = calls.find((call) => call.body);
    assert.deepEqual(insert?.body, {snippet: {playlistId: 'PLabc1234567', resourceId: {kind: 'youtube#video', videoId: 'vid1'}}});
  });

  await t.test('skips a video that is already in the playlist', async () => {
    let posted = false;
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST') posted = true;
      return json({items: [{contentDetails: {videoId: 'vid1'}}]});
    }) as typeof fetch;
    assert.equal(await addToPlaylist('token', 'PLabc1234567', 'vid1', {fetchImpl}), false);
    assert.equal(posted, false);
  });

  await t.test('explains a refused insert as a missing permission', async () => {
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => (init?.method === 'POST' ? json({error: 'insufficientPermissions'}, 403) : json({items: []}))) as typeof fetch;
    await assert.rejects(addToPlaylist('token', 'PLabc1234567', 'vid1', {fetchImpl}), /youtube:auth again/);
  });
});
