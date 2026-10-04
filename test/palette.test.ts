import assert from 'node:assert/strict';
import fs from 'node:fs';
import {describe, it} from 'node:test';
import {listManifests} from '../scripts/catalog.mjs';
import {contrastRatio, luminance, MIN_CONTRAST, paletteMode, paletteProblems} from '../scripts/lib/palette.mjs';

const dark = {background: '#0b1a2a', surface: '#23473d', primary: '#e4b363', secondary: '#8c2f39', ink: '#f6f1e7'};
const light = {background: '#cfdde6', surface: '#f3ede0', primary: '#b4561f', secondary: '#2c5d7f', ink: '#1b2730'};

describe('palette contrast', () => {
  it('measures contrast the WCAG way', () => {
    assert.equal(luminance('#000000'), 0);
    assert.equal(luminance('#ffffff'), 1);
    assert.equal(contrastRatio('#000000', '#ffffff'), 21);
    assert.equal(contrastRatio('#777777', '#777777'), 1);
    assert.equal(contrastRatio('#ffffff', '#000000'), contrastRatio('#000000', '#ffffff'));
  });

  it("tells a light palette from a dark one", () => {
    assert.equal(paletteMode(dark), 'dark');
    assert.equal(paletteMode(light), 'light');
  });

  it("passes Geographica's dark and light palettes", () => {
    assert.deepEqual(paletteProblems(dark), []);
    assert.deepEqual(paletteProblems(light), []);
  });

  it('names what is too faint', () => {
    const faint = paletteProblems({...light, ink: '#9aa4aa', primary: '#e0c9a0'});
    assert.equal(faint.length, 3);
    assert.match(faint[0], /text \(ink #9aa4aa\) on background #cfdde6 is .*below 4.5:1/);
    assert.match(faint[2], /the accent .* below 3:1/);
  });

  it('passes every committed episode, light or dark', () => {
    for (const file of listManifests()) {
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.deepEqual(paletteProblems(manifest.palette), [], manifest.id);
    }
    assert.ok(MIN_CONTRAST.ink >= 4.5 && MIN_CONTRAST.accent >= 3);
  });

  it('has the light Silk Road as a light episode', () => {
    const file = listManifests().find((path) => path.includes('silk-road-light'))!;
    assert.equal(paletteMode(JSON.parse(fs.readFileSync(file, 'utf8')).palette), 'light');
  });
});
