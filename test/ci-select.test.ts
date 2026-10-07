import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {MAX_SHARDS, selectEpisodes, toShards} from '../scripts/lib/ci-select.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = ['bulbasaur-001', 'darmanitan-555', 'gimmighoul-999', 'mew-151', 'swablu-333', 'terapagos-1024', 'zacian-888'];
const golden = ['bulbasaur-001', 'gimmighoul-999', 'swablu-333', 'mew-151'];
const plan = (changedFiles: string[], full = false) => selectEpisodes({changedFiles, catalog, golden, full});
const select = (changedFiles: string[], full = false) => plan(changedFiles, full).episodes;

describe('CI episode selection', () => {
  it('renders nothing for docs, tests and creative references', () => {
    assert.deepEqual(select(['README.md', 'docs/episode-compiler.md', 'DIRECTING.md', 'test/compiler.test.ts', 'creative-references/gimmighoul-999.json']), []);
  });

  it('renders only the episode whose draft, manifest or research changed', () => {
    assert.deepEqual(select(['drafts/pokepulses/zacian-888.json']), ['zacian-888']);
    assert.deepEqual(select(['videos/pokepulses/terapagos-1024/video.json']), ['terapagos-1024']);
    assert.deepEqual(select(['research/pokepulses/mew-151.json', 'drafts/pokepulses/zacian-888.json']), ['mew-151', 'zacian-888']);
    assert.deepEqual(select(['research/pokepulses/zacian-888.verification.json']), ['zacian-888']);
  });

  it('frame-checks the golden set, without full renders, when shared visual code changes', () => {
    for (const file of ['src/video/shots.tsx', 'src/video/primitives/counter.tsx', 'scripts/lib/compiler.mjs', 'archetypes/mystery.json']) {
      assert.deepEqual(plan([file]).episodes, [], file);
      assert.deepEqual(plan([file]).frames, [...golden].sort(), file);
    }
  });

  it('adds one full golden render as a smoke test when audio or encoding may have changed', () => {
    for (const file of ['scripts/render.mjs', 'scripts/generate-audio.mjs', 'scripts/lib/sound-design.mjs', 'src/video/VerticalEpisode.tsx', 'shows/pokepulses.json', 'package-lock.json', '.github/workflows/quality.yml']) {
      assert.deepEqual(plan([file]).episodes, ['bulbasaur-001'], file);
      assert.deepEqual(plan([file]).frames, ['gimmighoul-999', 'mew-151', 'swablu-333'], file);
    }
  });

  it('fully renders changed episodes, frame-checks the rest of the golden set, and needs no extra smoke render', () => {
    assert.deepEqual(plan(['src/video/shots.tsx', 'drafts/pokepulses/zacian-888.json']), {
      episodes: ['zacian-888'],
      frames: [...golden].sort(),
      geo: false,
      diagram: false,
      reason: 'full render of changed episodes: zacian-888; frame check of the golden set, because shared code changed (e.g. src/video/shots.tsx)',
    });
    assert.deepEqual(plan(['package.json', 'drafts/pokepulses/mew-151.json']).episodes, ['mew-151']);
    assert.deepEqual(plan(['package.json', 'drafts/pokepulses/mew-151.json']).frames, ['bulbasaur-001', 'gimmighoul-999', 'swablu-333'], 'a golden episode is never both rendered and frame-checked');
  });

  it('skips episodes that no longer exist', () => {
    assert.deepEqual(select(['drafts/pokepulses/deleted-999.json']), []);
  });

  it('frame-checks the golden set when the golden set itself changes', () => {
    assert.deepEqual(plan(['.github/golden-episodes.json']).frames, [...golden].sort());
  });

  it('gives each episode its own job when the selection is small', () => {
    assert.deepEqual(toShards(['a', 'b', 'c']), ['a', 'b', 'c']);
    assert.deepEqual(toShards([]), []);
  });

  it('spreads a large catalog evenly across a bounded number of jobs', () => {
    const catalogOf1025 = Array.from({length: 1025}, (_, index) => `pokemon-${index + 1}`);
    const shards = toShards(catalogOf1025);
    assert.equal(shards.length, MAX_SHARDS);
    assert.ok(MAX_SHARDS < 256, 'below the GitHub Actions matrix limit');
    const sizes = shards.map((shard) => shard.split(' ').length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'balanced');
    assert.equal(shards.flatMap((shard) => shard.split(' ')).length, 1025, 'every episode rendered once');
  });

  it('checks the diagram golden frames when diagram rendering changes', () => {
    for (const file of ['src/video/arch/ArchScene.tsx', 'src/video/canvas/emphasis.ts', 'scripts/diagram-schema.mjs', 'scripts/lib/diagram-timing.mjs', 'scripts/diagram-golden.mjs', 'test/golden/diagram/dim-clean.png', 'test/fixtures/diagram-verbs.json', 'scripts/primitive-schema.mjs']) {
      assert.equal(plan([file]).diagram, true, file);
    }
    assert.equal(plan(['src/video/geo/GeoMap.tsx']).diagram, false);
    assert.equal(plan(['README.md']).diagram, false);
  });

  it('checks only the geo golden frames when map-only code changes', () => {
    for (const file of ['public/geo/countries.geojson', 'src/video/geo/GeoMap.tsx', 'scripts/geo-data.mjs', 'scripts/lib/geo-primitives.mjs', 'scripts/geo-golden.mjs', 'test/golden/geo/fly-to-georgia-end.png', 'test/fixtures/geo-georgia-shots.json']) {
      assert.deepEqual({...plan([file]), reason: ''}, {episodes: [], frames: [], geo: true, diagram: false, reason: ''}, file);
    }
    assert.equal(plan(['README.md']).geo, false);
    assert.equal(plan(['drafts/pokepulses/zacian-888.json']).geo, false);
  });

  it('checks the geo golden frames too when shared code that shapes maps changes', () => {
    for (const file of ['scripts/primitive-schema.mjs', 'src/video/primitives.tsx', 'src/video/CompiledEpisodeScene.tsx', 'package-lock.json']) {
      assert.equal(plan([file]).geo, true, file);
      assert.ok(plan([file]).frames.length + plan([file]).episodes.length > 0, `${file} still checks PokePulses`);
    }
  });

  it('renders every episode in full on a full run', () => {
    assert.deepEqual(plan([], true), {episodes: [...catalog].sort(), frames: [], geo: true, diagram: true, reason: 'full catalog run'});
  });

  it('keeps the golden set to real episodes covering each rendering path', () => {
    const {episodes} = JSON.parse(fs.readFileSync(path.join(root, '.github/golden-episodes.json'), 'utf8')) as {episodes: string[]};
    assert.ok(episodes.length >= 3 && episodes.length <= 5);
    for (const id of episodes) assert.ok(fs.existsSync(path.join(root, 'videos/pokepulses', id, 'video.json')), id);
  });
});
