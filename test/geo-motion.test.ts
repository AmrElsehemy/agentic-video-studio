import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {LABEL_FROM, labelScale, pop} from '../src/video/geo/motion';

const curve = Array.from({length: 40}, (_, frame) => pop(frame, 0, 30));

describe('spring entrances', () => {
  it('stays hidden until its start', () => {
    assert.equal(pop(9, 10, 30), 0);
    assert.equal(pop(-5, 0, 30), 0);
  });

  it('overshoots only a little', () => {
    const peak = Math.max(...curve);
    assert.ok(peak > 1.02 && peak < 1.08, `peak ${peak}`);
  });

  it('settles within 12 frames (0.4 s at 30 fps)', () => {
    assert.ok(curve.slice(12).every((value) => Math.abs(value - 1) < .01));
  });

  it('arrives over several frames rather than popping in', () => {
    // At least 4 frames to reach 95%, and no single step covers a third of the move.
    assert.ok(curve.findIndex((value) => value >= .95) >= 4);
    for (let frame = 1; frame < curve.length; frame++) assert.ok(Math.abs(curve[frame] - curve[frame - 1]) < 1 / 3);
  });

  it('grows a label from LABEL_FROM to full size', () => {
    assert.equal(labelScale(0), LABEL_FROM);
    assert.equal(labelScale(1), 1);
    assert.ok(labelScale(Math.max(...curve)) < 1.04);
  });

  it('is the same every time', () => {
    assert.deepEqual(curve, Array.from({length: 40}, (_, frame) => pop(frame, 0, 30)));
  });
});
