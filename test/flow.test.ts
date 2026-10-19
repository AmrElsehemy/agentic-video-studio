import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {featureTags} from '../scripts/lib/feature-tags.mjs';
import {geoReferences} from '../scripts/lib/geo-primitives.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';

const camera = [{target: 'world', at: 0, padding: 0.1, ease: 'in-out'}];
const shot = (annotation: object) => ({kind: 'geo-map', camera, highlights: [], annotations: [annotation], dataset: 'natural-earth'});
const gulf = {lon: 51.5, lat: 26.5};

describe('flow maps', () => {
  it('accept plain arcs, and arcs that all carry a value with a unit', () => {
    assert.ok(primitiveSchema.safeParse(shot({type: 'flow', flows: [{from: gulf, to: 'city:shanghai-chn'}, {from: gulf, to: 'city:mumbai-ind', text: 'India'}]})).success);
    assert.ok(primitiveSchema.safeParse(shot({type: 'flow', unit: 'mb/d', flows: [{from: gulf, to: 'city:shanghai-chn', value: 9}, {from: gulf, to: 'city:mumbai-ind', value: 4.5}]})).success);
  });

  it('refuse a mix of valued and plain arcs, a unit with no values, a place to itself and too many arcs', () => {
    assert.equal(primitiveSchema.safeParse(shot({type: 'flow', flows: [{from: gulf, to: 'city:shanghai-chn', value: 9}, {from: gulf, to: 'city:mumbai-ind'}]})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({type: 'flow', unit: 'mb/d', flows: [{from: gulf, to: 'city:shanghai-chn'}]})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({type: 'flow', flows: [{from: 'city:shanghai-chn', to: 'city:shanghai-chn'}]})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({type: 'flow', flows: [{from: gulf, to: 'city:shanghai-chn', value: -1}]})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({type: 'flow', flows: Array.from({length: 7}, (_, k) => ({from: gulf, to: {lon: k, lat: k}}))})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({type: 'flow', flows: []})).success, false);
  });

  it('check named ends like any other place, skip points, and are tagged', () => {
    const parsed = primitiveSchema.parse(shot({type: 'flow', flows: [{from: gulf, to: 'city:shanghai-chn'}, {from: 'city:mumbai-ind', to: {lon: 4.4, lat: 51.9}}]})) as never;
    assert.deepEqual(geoReferences(parsed).filter(([where]) => where.includes('flows')).map(([, id]) => id), ['city:shanghai-chn', 'city:mumbai-ind']);
    assert.ok(featureTags({scenes: [{primitive: parsed, shot: 'map'}]} as never).includes('flow'));
  });
});
