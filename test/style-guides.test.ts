import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {buildGeoDirectorPrompt} from '../scripts/lib/geo-director.mjs';
import {loadStyleGuide, styleGuideSection} from '../scripts/lib/shows.mjs';
import {buildDirectorPrompt} from '../scripts/lib/visual-director.mjs';
import {buildWriterPrompt} from '../scripts/lib/writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

describe('show style guides', () => {
  for (const show of ['pokepulses', 'geographica']) {
    it(`${show} has a guide with each section`, () => {
      const guide = loadStyleGuide(show);
      for (const heading of ['## Story', '## Voice and tone', '## Visuals', '## Motion', '## Never']) assert.ok(guide.includes(heading), `${show} guide lacks ${heading}`);
    });
  }

  it('is absent, not an error, for a show without one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shows-'));
    assert.equal(loadStyleGuide('newshow', {dir}), '');
    assert.equal(styleGuideSection('newshow', {dir}), '');
  });

  it("is in the writer's instructions", () => {
    const research = read('research/pokepulses/bulbasaur-001.json');
    const {system} = buildWriterPrompt({research, directing: ''});
    assert.ok(system.includes('# Show style guide (shows/pokepulses.style.md)'));
    assert.ok(system.includes(loadStyleGuide('pokepulses')));
  });

  it("is in the visual director's instructions", () => {
    const draft = read('drafts/pokepulses/bulbasaur-001.json');
    const manifest = read('videos/pokepulses/bulbasaur-001/video.json');
    const {system} = buildDirectorPrompt({draft, manifest, research: read('research/pokepulses/bulbasaur-001.json')});
    assert.ok(system.includes(loadStyleGuide('pokepulses')));
  });

  it("is in the map director's instructions, the show's own", () => {
    const draft = read('drafts/geographica/silk-road.json');
    const {system} = buildGeoDirectorPrompt({draft, research: read('research/geographica/silk-road.json'), places: new Map(), datasets: new Map()});
    assert.ok(system.includes('# Show style guide (shows/geographica.style.md)'));
    assert.ok(system.includes(loadStyleGuide('geographica')));
    assert.ok(!system.includes(loadStyleGuide('pokepulses')));
  });
});
