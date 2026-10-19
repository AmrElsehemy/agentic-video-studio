import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {featureTags} from '../scripts/lib/feature-tags.mjs';
import {geoReferences} from '../scripts/lib/geo-primitives.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {clockLabel, subsolarPoint, sunAltitude} from '../src/video/geo/sun';

const at = (iso: string) => Date.parse(iso);
const camera = [{target: 'world', at: 0, padding: 0.1, ease: 'in-out'}];
const shot = (annotation: object) => ({kind: 'geo-map', camera, highlights: [], annotations: [annotation], dataset: 'natural-earth'});
const dn = {type: 'daynight', date: '2024-12-21', from: 16, to: 26, places: ['city:shanghai-chn', 'city:urumqi-chn']};

describe('the sun', () => {
  it('stands over the tropics at the solstices and the equator at the equinox', () => {
    assert.ok(Math.abs(subsolarPoint(at('2024-06-21T12:00:00Z')).lat - 23.44) < 0.1);
    assert.ok(Math.abs(subsolarPoint(at('2024-12-21T12:00:00Z')).lat + 23.44) < 0.1);
    assert.ok(Math.abs(subsolarPoint(at('2024-03-20T03:06:00Z')).lat) < 0.2);
  });

  it('is near Greenwich at noon UTC and moves west by 15 degrees an hour', () => {
    assert.ok(Math.abs(subsolarPoint(at('2024-06-21T12:00:00Z')).lon) < 2.5);
    const [a, b] = [subsolarPoint(at('2024-09-10T10:00:00Z')).lon, subsolarPoint(at('2024-09-10T11:00:00Z')).lon];
    assert.ok(Math.abs(a - b - 15) < 0.1, `moved ${a - b} degrees in an hour`);
  });

  it('is overhead at its own point, below the horizon at the opposite one, and up at 90 degrees from it', () => {
    const sun = subsolarPoint(at('2024-09-10T10:00:00Z'));
    assert.ok(Math.abs(sunAltitude(sun, sun.lon, sun.lat) - 90) < 1e-6);
    assert.ok(Math.abs(sunAltitude(sun, sun.lon + 180, -sun.lat) + 90) < 1e-6);
    assert.ok(Math.abs(sunAltitude(sun, sun.lon + 90, 0)) < 90);
  });

  it('puts the sun up in Shanghai before Ürümqi on a winter morning (the same clock, not the same sun)', () => {
    const sun = subsolarPoint(at('2024-12-22T01:18:00Z'));
    assert.ok(sunAltitude(sun, 121.435, 31.218) > 0, 'Shanghai is in daylight at 09:18 local');
    assert.ok(sunAltitude(sun, 87.573, 43.807) < 0, 'Ürümqi, on the same clock, is still dark');
    const dark = subsolarPoint(at('2024-12-21T22:07:00Z'));
    assert.ok(sunAltitude(dark, 121.435, 31.218) < 0, 'Shanghai before dawn');
  });

  it('prints the clock in UTC', () => {
    assert.equal(clockLabel(at('2024-12-21T22:07:00Z')), '22:07 UTC · 21 DEC');
    assert.equal(clockLabel(at('2024-01-05T01:05:00Z')), '01:05 UTC · 5 JAN');
  });
});

describe('day and night scenes', () => {
  it('accept a sweep over hours of a date, with places', () => {
    assert.ok(primitiveSchema.safeParse(shot(dn)).success);
    assert.ok(primitiveSchema.safeParse(shot({type: 'daynight', date: '2024-06-21', from: 0, to: 24})).success);
  });

  it('refuse no sweep, an impossible date, hours out of range and too many places', () => {
    assert.equal(primitiveSchema.safeParse(shot({...dn, from: 12, to: 12})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({...dn, date: '2024-13-45'})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({...dn, to: 60})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({...dn, places: ['city:a-b', 'city:c-d', 'city:e-f', 'city:g-h', 'city:i-j']})).success, false);
  });

  it('check its places like any other, and are tagged', () => {
    const parsed = primitiveSchema.parse(shot(dn)) as never;
    assert.deepEqual(geoReferences(parsed).filter(([where]) => where.includes('places')).map(([, id]) => id), ['city:shanghai-chn', 'city:urumqi-chn']);
    assert.ok(featureTags({scenes: [{primitive: parsed, shot: 'map'}]} as never).includes('day-night'));
  });
});
