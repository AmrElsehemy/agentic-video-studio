import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {loadShow, parseShow} from '../scripts/lib/shows.mjs';
import {showNotices} from '../scripts/lib/writer.mjs';
import {videoSchema} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pokepulses = () => JSON.parse(fs.readFileSync(path.join(root, 'shows/pokepulses.json'), 'utf8'));
const mewDraft = () => JSON.parse(fs.readFileSync(path.join(root, 'drafts/pokepulses/mew-151.json'), 'utf8'));
/** Mew's six scenes, untagged, fill the profile beats in order; AutoDex allows profile. */
const asProfile = (draft: {scenes: {beat?: string}[]}) => ({...draft, storyPattern: 'profile', scenes: draft.scenes.map(({beat, ...scene}) => scene)});

/** A second show that shares nothing with PokePulses but the story shapes. */
const autodex = () => parseShow({
  id: 'autodex',
  name: 'AutoDex',
  handle: '@AutoDex',
  description: 'a vertical short-form video series about cars',
  wordmark: {lead: 'AUTO', accent: 'DEX'},
  fonts: {display: 'Anton', body: 'Inter'},
  palette: {background: '#101010', surface: '#262626', primary: '#ffcc00', secondary: '#ff4d00', ink: '#ffffff'},
  music: {bpm: 100, notes: [82.41, 98, 110], volume: 0.12},
  voice: {voice: 'onyx', speed: 1, instructions: 'Calm, confident motoring narrator. Never imitate a known person.'},
  notices: {ownership: 'Car names are trademarks of their owners.', nonAffiliation: 'AutoDex is independent.'},
  archetypes: ['profile', 'mechanic'],
});

describe('show profiles', () => {
  it('loads and validates shows/pokepulses.json', () => {
    const show = loadShow('pokepulses');
    assert.equal(show.name, 'PokePulses');
    assert.deepEqual(show.wordmark, {lead: 'POKE', accent: 'PULSES'});
    assert.equal(show.voice.model, 'gpt-4o-mini-tts');
  });

  it('rejects unknown fonts, unknown story shapes and unexpected fields', () => {
    assert.throws(() => parseShow({...pokepulses(), fonts: {display: 'Comic Sans'}}), /fonts\.display/);
    assert.throws(() => parseShow({...pokepulses(), archetypes: ['profile', 'documentary']}), /unknown story shape documentary/);
    assert.throws(() => parseShow({...pokepulses(), logo: 'x.png'}), /Unrecognized key/i);
  });

  it('requires the file name and id to match', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shows-'));
    fs.writeFileSync(path.join(dir, 'other.json'), JSON.stringify(pokepulses()));
    assert.throws(() => loadShow('other', {dir}), /shows\/other\.json has id "pokepulses"/);
  });

  it("writes the show's notices into drafts", () => {
    assert.match(showNotices('pokepulses').nonAffiliationNotice, /^PokePulses is an unofficial fan-made/);
  });
});

describe('compiling for a show', () => {
  it("embeds the show's branding, music and voice defaults in the manifest", () => {
    const draft = asProfile(mewDraft()) as Record<string, unknown>;
    delete draft.palette;
    delete draft.voice;
    const {manifest} = compileEpisode(draft, {showId: 'autodex', show: autodex()});
    assert.deepEqual(manifest.show, {id: 'autodex', name: 'AutoDex', handle: '@AutoDex', wordmark: {lead: 'AUTO', accent: 'DEX'}, fonts: {display: 'Anton', body: 'Inter'}});
    assert.equal(manifest.palette.primary, '#ffcc00');
    assert.deepEqual(manifest.audio.bed, {bpm: 100, notes: [82.41, 98, 110]});
    assert.equal(manifest.audio.musicVolume, 0.12);
    assert.deepEqual([manifest.audio.voice!.voice, manifest.audio.voice!.speed], ['onyx', 1]);
    assert.ok(videoSchema.safeParse(manifest).success);
  });

  it("lets the draft override the show's defaults", () => {
    const draft = {...asProfile(mewDraft()), show: {handle: '@AutoDexClassics', fonts: {display: 'Oswald', body: 'system'}}, musicVolume: 0.2};
    const {manifest} = compileEpisode(draft, {showId: 'autodex', show: autodex()});
    assert.equal(manifest.show.handle, '@AutoDexClassics');
    assert.equal(manifest.show.fonts!.display, 'Oswald');
    assert.equal(manifest.palette.primary, mewDraft().palette.primary, 'the draft palette wins');
    assert.equal(manifest.audio.musicVolume, 0.2);
  });

  it('rejects story shapes the show does not use, and a draft claiming another show', () => {
    assert.throws(() => compileEpisode(mewDraft(), {showId: 'autodex', show: autodex()}), /AutoDex doesn't use the "mystery" story shape\. Allowed in shows\/autodex\.json: profile, mechanic/);
    assert.throws(() => compileEpisode({...mewDraft(), show: {id: 'autodex'}}, {showId: 'pokepulses'}), /sets show id "autodex" but is compiled for the pokepulses show/);
  });
});
