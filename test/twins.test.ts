import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {paletteProblems} from '../scripts/lib/palette.mjs';
import {loadShow} from '../scripts/lib/shows.mjs';
import {twinPairs, twinProblems} from '../scripts/lib/twins.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const manifest = (id: string) => read(`videos/geographica/${id}/video.json`);

describe('palette variants', () => {
  it('gives every show palette and variant readable text and accents', () => {
    for (const id of ['pokepulses', 'geographica']) {
      const show = loadShow(id);
      for (const [name, palette] of Object.entries({default: show.palette, ...(show.paletteVariants ?? {})})) {
        assert.deepEqual(paletteProblems(palette), [], `${id} ${name}`);
      }
    }
  });

  it('compiles a draft that names a variant with the show\'s palette for it', () => {
    const {manifest: compiled} = compileEpisode(read('drafts/geographica/lesotho-enclave-light.json'), {showId: 'geographica'});
    assert.deepEqual(compiled.palette, loadShow('geographica').paletteVariants!.light);
    assert.equal(compiled.twinOf, 'lesotho-enclave');
  });

  it('refuses a variant the show does not define, or one alongside a palette', () => {
    const draft = read('drafts/geographica/lesotho-enclave-light.json');
    assert.throws(() => compileEpisode({...draft, paletteVariant: 'sepia'}, {showId: 'geographica'}), /"sepia" palette, which shows\/geographica.json doesn't define. Defined: light/);
    assert.throws(() => compileEpisode({...draft, palette: loadShow('geographica').palette}, {showId: 'geographica'}), /both a palette and paletteVariant/);
  });
});

describe('palette twins', () => {
  for (const [id, original] of [['silk-road-light', 'silk-road'], ['lesotho-enclave-light', 'lesotho-enclave']]) {
    it(`${id} is a usable twin of ${original} that plays its narration`, () => {
      const twin = manifest(id);
      assert.equal(twin.twinOf, original);
      assert.deepEqual(twinProblems(twin, manifest(original)), []);
      assert.equal(twin.audio.voice.output, `generated/${original}-voice.wav`);
    });
  }

  it('names what makes a twin unusable', () => {
    const [twin, original] = [manifest('lesotho-enclave-light'), manifest('lesotho-enclave')];
    assert.match(twinProblems(twin, undefined).join(), /isn't in the catalog/);
    assert.match(twinProblems(twin, {...original, palette: twin.palette}).join(), /both have a light palette/);
    assert.match(twinProblems(twin, {...original, title: twin.title.toUpperCase()}).join(), /same title/);
    const retold = {...original, scenes: original.scenes.map((scene: any, index: number) => (index ? scene : {...scene, narration: 'Something else.'}))};
    assert.match(twinProblems(twin, retold).join(), /narration differs/);
    const slower = {...original, audio: {...original.audio, voice: {...original.audio.voice, speed: 0.9}}};
    assert.match(twinProblems(twin, slower).join(), /voice settings or scene timing differ/);
    assert.match(twinProblems(twin, {...original, twinOf: 'silk-road'}).join(), /point both at the original/);
    assert.deepEqual(twinProblems(original, twin), []);
  });

  it('pairs twins in the report, with how far apart they went out', () => {
    const row = (episodeId: string, extra: object) => ({episodeId, topic: 'Lesotho', paletteMode: 'dark', ...extra});
    const pairs = twinPairs([
      row('lesotho-enclave', {publishedAt: '2026-10-01T12:00:00Z', snapshot: {views: 400, averageViewPercent: 71}}),
      row('lesotho-enclave-light', {paletteMode: 'light', twinOf: 'lesotho-enclave', publishedAt: '2026-10-04T00:00:00Z', snapshot: {views: 0, averageViewPercent: 0}}),
      row('silk-road-light', {paletteMode: 'light', twinOf: 'silk-road'}),
    ] as any);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].daysApart, 2.5);
    assert.deepEqual(pairs[0].original, {episodeId: 'lesotho-enclave', paletteMode: 'dark', publishedAt: '2026-10-01T12:00:00Z', views: 400, averageViewPercent: 71});
    // No views yet: no average to compare.
    assert.equal(pairs[0].twin.averageViewPercent, undefined);
  });
});
