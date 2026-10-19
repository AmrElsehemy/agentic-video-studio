import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {featureTags} from '../scripts/lib/feature-tags.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {discRadius, relax, worstOverlap, type Disc} from '../src/video/geo/dorling';

const camera = [{target: 'world', at: 0, padding: 0.1, ease: 'in-out'}];
const shot = (series: object, extra: object = {}) => ({kind: 'geo-map', camera, highlights: [], annotations: [], dataset: 'natural-earth', series, ...extra});
const cartogram = {indicator: 'population', view: 'cartogram', from: 1960, to: 2023};

describe('Dorling layout', () => {
  it('gives each circle an area in proportion to its value', () => {
    const [big, small] = [discRadius(1400, 1400, 200), discRadius(350, 1400, 200)];
    assert.equal(big, 200);
    assert.ok(Math.abs(big / small - 2) < 1e-9, 'a quarter of the value is half the width');
    assert.equal(discRadius(0, 1400, 200), 12, 'a tiny value is still a visible dot');
  });

  it('pushes a crowd apart until no two circles overlap, inside the bounds', () => {
    const bounds = {left: 0, top: 0, right: 1000, bottom: 1000};
    const crowd: Disc[] = Array.from({length: 22}, (_, index) => ({id: `c${String(index).padStart(2, '0')}`, x: 480 + (index % 5) * 9, y: 500 + (index % 4) * 9, r: 28 + ((index * 37) % 90)}));
    assert.ok(worstOverlap(crowd) > 0);
    const laid = relax(crowd, bounds);
    assert.ok(worstOverlap(laid) <= 0.01, `still overlapping by ${worstOverlap(laid)}`);
    for (const disc of laid) assert.ok(disc.x - disc.r >= -0.01 && disc.x + disc.r <= 1000.01 && disc.y - disc.r >= -0.01 && disc.y + disc.r <= 1000.01);
    assert.deepEqual(laid.map((disc) => disc.id), crowd.map((disc) => disc.id), 'the order is kept');
  });

  it('gives the same picture every time, and leaves a lone circle where it was', () => {
    const bounds = {left: 0, top: 0, right: 800, bottom: 800};
    const discs: Disc[] = [{id: 'a', x: 400, y: 400, r: 80}, {id: 'b', x: 420, y: 410, r: 60}, {id: 'c', x: 100, y: 700, r: 30}];
    assert.deepEqual(relax(discs, bounds), relax(discs, bounds));
    const lone = relax([{id: 'z', x: 300, y: 300, r: 50}], bounds);
    assert.ok(Math.abs(lone[0].x - 300) < 1e-6 && Math.abs(lone[0].y - 300) < 1e-6);
  });

  it('moves the smaller of two overlapping circles further', () => {
    const [big, small] = relax([{id: 'big', x: 300, y: 300, r: 100}, {id: 'small', x: 320, y: 300, r: 30}], {left: 0, top: 0, right: 700, bottom: 700}, 5);
    assert.ok(Math.abs(big.x - 300) < Math.abs(small.x - 320));
  });
});

describe('cartogram scenes', () => {
  it('accept a population cartogram over years, with a lit country and a size', () => {
    const parsed = primitiveSchema.parse(shot({...cartogram, places: ['country:IND']})) as {series: {top?: number}};
    assert.equal(parsed.series.top, undefined, 'the renderer defaults to 20; the draft does not carry a default');
    assert.ok(primitiveSchema.safeParse(shot({...cartogram, top: 30})).success);
    assert.equal(primitiveSchema.safeParse(shot({indicator: 'population', view: 'race', from: 1960, to: 2023, top: 12})).success, false, 'top belongs to a cartogram');
  });

  it('refuse other indicators, shading, a globe, a data layer and too many circles', () => {
    assert.equal(primitiveSchema.safeParse(shot({...cartogram, indicator: 'life-expectancy'})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({...cartogram, indicator: 'fertility'})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({...cartogram, shade: true})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({...cartogram, mark: {year: 2000, text: 'X'}})).success, false);
    assert.equal(primitiveSchema.safeParse(shot(cartogram, {globe: true})).success, false);
    assert.equal(primitiveSchema.safeParse(shot(cartogram, {relief: true})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({...cartogram, top: 31})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({...cartogram, top: 3})).success, false);
  });

  it('are tagged chart-cartogram', () => {
    assert.ok(featureTags({scenes: [{primitive: shot(cartogram), shot: 'map'}]} as never).includes('chart-cartogram'));
  });
});
