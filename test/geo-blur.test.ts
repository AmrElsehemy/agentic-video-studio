import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BLUR_FROM, blurSamples, MAX_GAP, SAMPLES, SHUTTER, shutterFor, viewShift} from '../src/video/geo/blur';
import {MAP_SIZE} from '../src/video/geo/camera';

const view = {lon: 40, lat: 40, scale: 2000};

describe('camera speed', () => {
  it('is zero for a camera that holds still', () => {
    assert.equal(viewShift(view, view, MAP_SIZE), 0);
  });

  it('measures a pan in pixels on screen', () => {
    // One degree east at scale 2000 moves the picture 2000 × π/180 ≈ 34.9 px.
    assert.ok(Math.abs(viewShift(view, {...view, lon: 41}, MAP_SIZE) - 2000 * Math.PI / 180) < 1e-6);
  });

  it('counts a zoom by how far the corners travel', () => {
    const corner = Math.hypot(MAP_SIZE.width, MAP_SIZE.height) / 2;
    assert.ok(Math.abs(viewShift(view, {...view, scale: 4000}, MAP_SIZE) - corner) < 1e-6);
  });

  it('pans the short way across the antimeridian', () => {
    assert.ok(viewShift({...view, lon: 179.5}, {...view, lon: -179.5}, MAP_SIZE) < 40);
  });
});

describe('motion blur', () => {
  it('leaves slow moves as a single render', () => {
    for (const speed of [0, 10, BLUR_FROM]) assert.deepEqual(blurSamples(50, shutterFor(speed), 100), [50]);
  });

  it('opens the shutter gradually, never with a jump', () => {
    let previous = 0;
    for (let speed = 0; speed <= 800; speed += 1) {
      const shutter = shutterFor(speed);
      assert.ok(shutter >= 0 && shutter <= SHUTTER);
      assert.ok(Math.abs(shutter - previous) < .02, `shutter jumps at ${speed} px/frame`);
      previous = shutter;
    }
  });

  it('keeps renders close enough to smear rather than ghost', () => {
    for (let speed = BLUR_FROM; speed <= 1000; speed += 7) {
      assert.ok(shutterFor(speed) * speed / (SAMPLES - 1) <= MAX_GAP + 1e-9, `renders ${(shutterFor(speed) * speed / (SAMPLES - 1)).toFixed(1)} px apart at ${speed} px/frame`);
    }
  });

  it('spreads renders evenly, centred on the frame and inside the scene', () => {
    const samples = blurSamples(50, .4, 100);
    assert.equal(samples.length, SAMPLES);
    assert.ok(Math.abs(samples.reduce((sum, at) => sum + at, 0) / SAMPLES - 50) < 1e-9);
    assert.ok(Math.abs(samples.at(-1)! - samples[0] - .4) < 1e-9);
    assert.ok(blurSamples(0, .4, 100).every((at) => at >= 0));
    assert.ok(blurSamples(100, .4, 100).every((at) => at <= 100));
  });
});
