import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {selectEpisodes} from '../scripts/lib/ci-select.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = ['bulbasaur-001', 'darmanitan-555', 'gimmighoul-999', 'mew-151', 'swablu-333', 'terapagos-1024', 'zacian-888'];
const golden = ['bulbasaur-001', 'gimmighoul-999', 'swablu-333', 'mew-151'];
const select = (changedFiles: string[], full = false) => selectEpisodes({changedFiles, catalog, golden, full}).episodes;

describe('CI episode selection', () => {
  it('renders nothing for docs, tests and creative references', () => {
    assert.deepEqual(select(['README.md', 'docs/episode-compiler.md', 'DIRECTING.md', 'test/compiler.test.ts', 'creative-references/gimmighoul-999.json']), []);
  });

  it('renders only the episode whose draft, manifest or research changed', () => {
    assert.deepEqual(select(['drafts/pokepulses/zacian-888.json']), ['zacian-888']);
    assert.deepEqual(select(['videos/pokepulses/terapagos-1024/video.json']), ['terapagos-1024']);
    assert.deepEqual(select(['research/pokepulses/mew-151.json', 'drafts/pokepulses/zacian-888.json']), ['mew-151', 'zacian-888']);
  });

  it('renders the golden set when shared code changes', () => {
    for (const file of ['src/video/shots.tsx', 'scripts/lib/compiler.mjs', 'archetypes/mystery.json', 'package-lock.json', '.github/workflows/quality.yml']) {
      assert.deepEqual(select([file]), [...golden].sort(), file);
    }
  });

  it('adds changed episodes to the golden set', () => {
    assert.deepEqual(select(['src/video/shots.tsx', 'drafts/pokepulses/zacian-888.json']), [...golden, 'zacian-888'].sort());
  });

  it('skips episodes that no longer exist', () => {
    assert.deepEqual(select(['drafts/pokepulses/deleted-999.json']), []);
  });

  it('renders every episode on a full run', () => {
    assert.deepEqual(select([], true), [...catalog].sort());
  });

  it('keeps the golden set to real episodes covering each rendering path', () => {
    const {episodes} = JSON.parse(fs.readFileSync(path.join(root, '.github/golden-episodes.json'), 'utf8')) as {episodes: string[]};
    assert.ok(episodes.length >= 3 && episodes.length <= 5);
    for (const id of episodes) assert.ok(fs.existsSync(path.join(root, 'videos/pokepulses', id, 'video.json')), id);
  });
});
