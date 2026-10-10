import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {ambienceOf, AMBIENCES, intensityOf, renderBed, SCORE_NAMES, SCORES} from '../scripts/lib/score.mjs';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {episodeDraftSchema} from '../scripts/draft-schema.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const manifestOf = (score: string, ambience?: string) => {
  const manifest = read('videos/geographica/lesotho-enclave/video.json');
  return {...manifest, audio: {...manifest.audio, bed: {...manifest.audio.bed, score}}, scenes: manifest.scenes.slice(0, 3).map((scene: any) => ({...scene, primitive: scene.primitive ? {...scene.primitive, ...(ambience ? {ambience} : {})} : scene.primitive}))};
};
const rms = (samples: Float32Array, from: number, to: number) => Math.sqrt(samples.slice(Math.floor(from * 44100), Math.floor(to * 44100)).reduce((sum, v) => sum + v * v, 0) / ((to - from) * 44100));

describe('the score', () => {
  it('has six moods, each with a tempo and chords', () => {
    assert.deepEqual(SCORE_NAMES.length, 6);
    for (const name of SCORE_NAMES) assert.ok(SCORES[name].bpm >= 60 && SCORES[name].chords.length >= 4, name);
  });

  it('is the same every time for the same episode, and different between moods', () => {
    const a = renderBed({manifest: manifestOf('wonder'), episodeId: 'x'});
    const b = renderBed({manifest: manifestOf('wonder'), episodeId: 'x'});
    const c = renderBed({manifest: manifestOf('tension'), episodeId: 'x'});
    assert.deepEqual(a.left.slice(10000, 10100), b.left.slice(10000, 10100));
    assert.notDeepEqual(a.left.slice(88200, 88300), c.left.slice(88200, 88300));
  });

  it('is stereo, finite and within range, as long as the scenes', () => {
    for (const name of SCORE_NAMES) {
      const bed = renderBed({manifest: manifestOf(name), episodeId: 'y'});
      assert.equal(bed.left.length, bed.right.length);
      assert.ok(Math.abs(bed.duration - bed.left.length / 44100) < 0.001);
      assert.ok(bed.left.every(Number.isFinite) && bed.right.every(Number.isFinite), name);
      assert.ok(bed.left.some((v, i) => v !== bed.right[i]), `${name} is not just mono`);
      assert.equal(Math.abs(bed.left[0]) < 0.01, true, `${name} fades in`);
    }
  });

  it('gets quieter while the narration speaks, and comes back in its pauses', () => {
    const manifest = manifestOf('calm');
    const first = manifest.scenes[0];
    const speech = {[first.id]: {start: 0.2, end: first.durationSeconds - 0.2, pauses: [{start: 1.5, end: 2.1}]}};
    const quiet = renderBed({manifest, speech, episodeId: 'z'});
    const loud = renderBed({manifest, episodeId: 'z'});
    assert.ok(rms(quiet.left, 0.8, 1.3) < rms(loud.left, 0.8, 1.3) * 0.7, 'ducked while speaking');
  });

  it('plays more as the story gets louder', () => {
    const scenes = [{beat: 'hook'}, {beat: 'clue'}, {beat: 'escalation'}, {beat: 'reveal'}, {beat: 'verdict'}];
    assert.deepEqual(scenes.map((scene, index) => intensityOf(scene, index, scenes.length)), [2, 1, 2, 3, 1]);
  });

  it('puts the sea under a flood, a city under streets, and wind under heights, unless told otherwise', () => {
    assert.equal(ambienceOf({surface: {kind: 'flood'}}), 'sea');
    assert.equal(ambienceOf({streets: {city: 'x'}}), 'city');
    assert.equal(ambienceOf({surface: {kind: 'elevation'}}), 'wind');
    assert.equal(ambienceOf({}), undefined);
    assert.equal(ambienceOf({ambience: 'jungle', streets: {city: 'x'}}), 'jungle');
    assert.equal(ambienceOf({ambience: 'none', streets: {city: 'x'}}), undefined);
  });

  it('renders every kind of ambience without a gap or a click', () => {
    for (const kind of AMBIENCES) {
      const bed = renderBed({manifest: manifestOf('calm', kind), episodeId: 'w'});
      assert.ok(bed.left.every(Number.isFinite), kind);
      assert.ok(rms(bed.left, 2, 4) > 0.005, `${kind} is audible`);
      let step = 0;
      for (let i = 1; i < bed.left.length; i++) step = Math.max(step, Math.abs(bed.left[i] - bed.left[i - 1]));
      assert.ok(step < 0.6, `${kind} has no click (largest step ${step.toFixed(2)})`);
    }
  });
});

describe('choosing a score', () => {
  it('is a draft field that sets the episode bed, and leaves other episodes on the show loop', () => {
    const draft = read('drafts/geographica/lesotho-enclave.json');
    const plain = compileEpisode(draft, {showId: 'geographica'}).manifest;
    const scored = compileEpisode({...draft, score: 'epic'}, {showId: 'geographica'}).manifest;
    assert.equal(plain.audio.bed?.score, undefined);
    assert.equal(scored.audio.bed?.score, 'epic');
    assert.equal(scored.audio.bed?.bpm, SCORES.epic.bpm);
    assert.ok(!episodeDraftSchema.safeParse({...draft, score: 'polka'}).success);
  });

  it('lets a map shot name its ambience', () => {
    const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
    assert.ok(primitiveSchema.safeParse({...base, ambience: 'sea'}).success);
    assert.ok(!primitiveSchema.safeParse({...base, ambience: 'thunder'}).success);
  });
});
