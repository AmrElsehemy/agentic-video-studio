import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {validateCatalog} from '../scripts/validate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A catalog with one real episode and one manifest that isn't even valid JSON. */
const catalogWithBrokenSibling = () => {
  const videosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-'));
  fs.mkdirSync(path.join(videosDir, 'pokepulses', 'mew-151'), {recursive: true});
  fs.copyFileSync(path.join(root, 'videos/pokepulses/mew-151/video.json'), path.join(videosDir, 'pokepulses', 'mew-151', 'video.json'));
  fs.mkdirSync(path.join(videosDir, 'pokepulses', 'broken-000'), {recursive: true});
  fs.writeFileSync(path.join(videosDir, 'pokepulses', 'broken-000', 'video.json'), '{"id": "broken-000", ');
  return videosDir;
};

describe('manifest validation', () => {
  it('validates one episode without reading any other manifest', () => {
    const videosDir = catalogWithBrokenSibling();
    const logs: string[] = [];
    assert.equal(validateCatalog({videosDir, requested: 'mew-151', log: (line) => logs.push(line)}), 1);
    assert.match(logs[0], /✓ mew-151: 6 scenes/);
  });

  it('still reports the broken manifest when the whole catalog is validated', () => {
    assert.throws(() => validateCatalog({videosDir: catalogWithBrokenSibling(), log: () => {}}), SyntaxError);
  });

  it('rejects an unknown episode and a manifest whose id does not match its folder', () => {
    const videosDir = catalogWithBrokenSibling();
    assert.throws(() => validateCatalog({videosDir, requested: 'zacian-888'}), /Unknown episode: zacian-888/);
    const manifestPath = path.join(videosDir, 'pokepulses', 'mew-151', 'video.json');
    fs.writeFileSync(manifestPath, JSON.stringify({...JSON.parse(fs.readFileSync(manifestPath, 'utf8')), id: 'mew-152'}));
    assert.throws(() => validateCatalog({videosDir, requested: 'mew-151'}), /has id "mew-152", expected "mew-151"/);
  });

  it('passes on the real catalog', () => {
    assert.ok(validateCatalog({videosDir: path.join(root, 'videos'), log: () => {}}) >= 6);
  });
});
