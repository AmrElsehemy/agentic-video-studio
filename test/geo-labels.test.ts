import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {fitInside, labelBox, overlapShare, resolveLabels, type Box} from '../src/video/geo/labels';

const bounds = {width: 1000, height: 1200, safe: 48};
const edges = (box: Box) => [box.x - box.halfWidth, box.y - box.halfHeight, box.x + box.halfWidth, box.y + box.halfHeight];

describe('label placement', () => {
  it('sizes a label by its text', () => {
    const short = labelBox(0, 0, 'GEORGIA', 38);
    const long = labelBox(0, 0, 'CONSTANTINOPLE', 38);
    assert.ok(long.halfWidth > short.halfWidth * 1.8);
    assert.equal(short.halfHeight, long.halfHeight);
  });

  it('keeps a whole label inside the frame, wherever its anchor is', () => {
    for (const [x, y] of [[0, 0], [-300, 600], [1000, 600], [1400, 1500], [500, -50]]) {
      const [left, top, right, bottom] = edges(fitInside(labelBox(x, y, 'CONSTANTINOPLE', 38), bounds));
      assert.ok(left >= 48 - 1e-9 && top >= 48 - 1e-9 && right <= 952 + 1e-9 && bottom <= 1152 + 1e-9, `label at ${x},${y} pokes out`);
    }
  });

  it('leaves a label that already fits where it is', () => {
    const box = labelBox(500, 600, 'SAMARKAND', 38);
    assert.deepEqual(fitInside(box, bounds), box);
  });

  it('slides along the edge as its anchor moves, without jumping', () => {
    const xs = Array.from({length: 40}, (_, step) => fitInside(labelBox(1100 - step * 10, 600, 'SAMARKAND', 38), bounds).x);
    for (let index = 1; index < xs.length; index++) assert.ok(Math.abs(xs[index] - xs[index - 1]) <= 10 + 1e-9);
  });

  it('measures overlap as a share of the smaller label', () => {
    const a = labelBox(500, 600, 'CONSTANTINOPLE', 38);
    assert.equal(overlapShare(a, labelBox(500, 900, 'SAMARKAND', 38)), 0);
    assert.equal(overlapShare(a, labelBox(500, 600, 'XI\'AN', 38)), 1);
    const partial = overlapShare(a, labelBox(a.x + a.halfWidth, 600, 'SAMARKAND', 38));
    assert.ok(partial > 0 && partial < 1);
  });
});

describe('overlapping labels', () => {
  const box = (x: number, y = 600): Box => ({x, y, halfWidth: 50, halfHeight: 20});
  const free = {width: 1000, height: 1200, safe: 0};

  it('moves the weaker of two overlapping labels aside, towards its own place', () => {
    // The weaker label's place is north of the stronger one's, so it moves up until clear.
    const {boxes, fades} = resolveLabels([{box: box(500, 600), anchorY: 590, priority: 0, opacity: 1}, {box: box(530, 610), anchorY: 610, priority: 1, opacity: 1}], free);
    assert.equal(boxes[1].y, 610);
    assert.ok(boxes[0].y <= 610 - 50 + 1e-9);
    assert.deepEqual(fades, [1, 1]);
    // South of it: down.
    assert.ok(resolveLabels([{box: box(500, 600), anchorY: 640, priority: 0, opacity: 1}, {box: box(530, 610), anchorY: 610, priority: 1, opacity: 1}], free).boxes[0].y >= 610 + 50 - 1e-9);
  });

  it('leaves labels that do not overlap where they are', () => {
    const labels = [{box: box(100), priority: 0, opacity: 1}, {box: box(400), priority: 1, opacity: 1}];
    assert.deepEqual(resolveLabels(labels, free), {boxes: labels.map((label) => label.box), fades: [1, 1]});
  });

  it('fades the weaker label when it cannot move clear, at the pace the stronger one appears', () => {
    // At the top edge the weaker label cannot move up.
    const fade = (opacity: number) => resolveLabels([{box: box(500, 20), anchorY: 0, priority: 0, opacity: 1}, {box: box(510, 25), anchorY: 25, priority: 1, opacity}], free).fades[0];
    assert.equal(fade(0), 1);
    assert.ok(fade(.5) > .3 && fade(.5) < 1);
    assert.equal(fade(1), 0);
  });

  it('moves and fades smoothly as two labels slide into each other, never in one step', () => {
    const steps = Array.from({length: 80}, (_, step) => resolveLabels([{box: box(500, 600), anchorY: 600, priority: 0, opacity: 1}, {box: box(700 - step * 3, 605), anchorY: 605, priority: 1, opacity: 1}], free));
    for (let index = 1; index < steps.length; index++) {
      assert.ok(Math.abs(steps[index].boxes[0].y - steps[index - 1].boxes[0].y) < 12, `step ${index} jumps`);
      assert.ok(Math.abs(steps[index].fades[0] - steps[index - 1].fades[0]) < .25, `step ${index} flickers`);
    }
    assert.ok(steps.at(-1)!.boxes[0].y <= 605 - 50 + 1e-9);
  });

  it('lets a label that has itself faded stop covering others', () => {
    // The legend (strongest, at the edge so nothing can move past it) hides the middle label, which then no longer pushes the first.
    const labels = [{box: box(0, 20), anchorY: 20, priority: 0, opacity: 1}, {box: box(80, 20), anchorY: 20, priority: 1, opacity: 1}, {box: box(160, 20), anchorY: 100, priority: Infinity, opacity: 1}];
    const {boxes, fades} = resolveLabels(labels, free);
    assert.equal(fades[1], 0);
    assert.equal(fades[0], 1);
    assert.equal(boxes[0].y, 20);
  });
});

describe('label and marker end times', () => {
  const map = (annotation: object) => primitiveSchema.safeParse({kind: 'geo-map', camera: [{target: 'world', at: 0}], annotations: [annotation]});

  it('accepts an until after the label appears', () => {
    assert.equal(map({type: 'marker', anchor: 'country:GEO', text: 'GEORGIA', at: .2, until: .8}).success, true);
    assert.equal(map({type: 'label', anchor: 'country:GEO', text: 'GEORGIA', at: .2}).success, true);
  });

  it('rejects an until that is not after at', () => {
    const result = map({type: 'label', anchor: 'country:GEO', text: 'GEORGIA', at: .5, until: .5});
    assert.equal(result.success, false);
    assert.match(JSON.stringify(result.error?.issues), /must leave after it appears/);
  });
});
