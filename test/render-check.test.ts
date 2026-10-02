import assert from 'node:assert/strict';
import fs from 'node:fs';
import {describe, it} from 'node:test';
import {findManifest} from '../scripts/catalog.mjs';
import {busiestWindow, determinismFrames, findJumps, renderDifference, STRIP_LENGTH, suddenWindows} from '../scripts/lib/render-check.mjs';
import {intendedCuts} from '../scripts/lib/reveals.mjs';

const manifest = (id: string) => JSON.parse(fs.readFileSync(findManifest(id).manifestPath, 'utf8'));
/** A flat grey frame of 100 pixels at one brightness. */
const flat = (value: number) => new Uint8Array(100).fill(value);
/** A scan sample every 8 frames whose brightness follows `levels`. */
const scanOf = (levels: number[]) => levels.map((level, index) => ({frame: index * 8, gray: flat(level)}));
const twoScenes = {format: {fps: 30}, scenes: [{durationSeconds: 4}, {durationSeconds: 4}]};

describe('render check (#88): motion between neighbouring frames', () => {
  it('passes smooth motion, even a fast burst (Bulbasaur scene 3, measured)', () => {
    assert.deepEqual(findJumps([0.19, 1.29, 3.46, 6.06, 7.89, 8.2, 5.07, 2.8, 0.6, 1.63, 2.08, 2.09, 1.86, 1.31]), []);
    assert.deepEqual(findJumps([1.92, 2.18, 3.31, 4.38, 5.17, 6.03, 6.61, 7.14, 7.37, 7.46, 7.61, 7.46, 7.16]), []);
  });

  it('fails a camera snap: one step far larger than the steps either side (measured on an injected snap)', () => {
    const jumps = findJumps([0.1, 0.08, 0.05, 9.95, 0.08, 0.1, 0.07]);
    assert.deepEqual(jumps.map(({at, kind}) => ({at, kind})), [{at: 3, kind: 'snap'}]);
  });

  it('fails a one-frame flicker: a frame that appears and disappears', () => {
    const jumps = findJumps([0.4, 0.5, 6.2, 6.0, 0.5, 0.4]);
    assert.deepEqual(jumps.map(({at, kind}) => ({at, kind})), [{at: 2, kind: 'flicker'}]);
  });

  it('ignores changes too small to see', () => {
    assert.deepEqual(findJumps([0.01, 0.02, 1.5, 0.02, 0.01]), []);
  });
});

describe('render check: where to look', () => {
  it('finds the busiest stretch inside one scene, not across a scene change', () => {
    // Scene 1 is frames 0–119; motion ramps up in the middle of scene 1 and a cut sits at frame 120.
    const scan = scanOf([0, 0, 0, 10, 30, 60, 90, 95, 95, 95, 95, 95, 95, 95, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200]);
    const window = busiestWindow(twoScenes, scan);
    assert.ok(window.start >= 8 && window.start + STRIP_LENGTH <= 120, `window at ${window.start}`);
  });

  it('flags a sudden step even where the busiest stretch is elsewhere, and skips exit fades and intended cuts', () => {
    // A snap between frames 40 and 48 of scene 1; the scene's exit fade (frames 112–119) is planned.
    const levels: number[] = Array.from({length: 30}, (_, index) => (index < 6 ? 20 : 40));
    levels[14] = 0; // frame 112, inside scene 1’s exit fade
    const windows = suddenWindows(twoScenes, scanOf(levels));
    assert.ok(windows.some((item) => item.start <= 40 && item.start + STRIP_LENGTH >= 48), JSON.stringify(windows));
    assert.ok(windows.every((item) => item.start + STRIP_LENGTH <= 104 || item.start >= 120), 'the exit fade is not a candidate');
    assert.deepEqual(suddenWindows(twoScenes, scanOf(levels.map((level, index) => (index < 6 ? 20 : 40))), {cuts: [44]}).filter((item) => item.start <= 40 && item.start + STRIP_LENGTH >= 48), []);
  });

  it('knows where the hook reveals land (Bulbasaur and Mew, measured jumps at 60→61 and 58→59)', () => {
    assert.ok(intendedCuts(manifest('bulbasaur-001')).includes(61));
    assert.ok(intendedCuts(manifest('mew-151')).includes(59));
    assert.deepEqual(intendedCuts(manifest('lesotho-enclave')), [], 'map scenes have no reveal cut');
  });

  it('re-renders frames from the window and from the first and last scenes', () => {
    const frames = determinismFrames(twoScenes, 30);
    assert.deepEqual(frames, [30, 42, 53, 60, 180]);
  });
});

describe('render check: determinism', () => {
  it('accepts anti-aliasing noise and rejects moved content', () => {
    const base = new Uint8Array(540 * 960).map((_, index) => (index % 960 < 480 ? 40 : 200));
    const noisy = base.slice();
    for (let index = 0; index < 60; index++) noisy[index * 997] += 3;
    assert.equal(renderDifference(base, noisy).alike, true);
    // Math.random in a scene: the same shape, 20 pixels to the side.
    const moved = base.map((_, index) => base[index - 20] ?? base[index]);
    assert.equal(renderDifference(base, moved).alike, false);
  });
});
