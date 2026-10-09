import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {geoDistance} from 'd3-geo';
import {geoResearchSchema} from '../scripts/geo-research-schema.mjs';
import {destination, EARTH_RADIUS_KM, kmToDegrees} from '../scripts/lib/geodesy.mjs';
import {resolveResearchPlaces, shotToPrimitive, unframedRings} from '../scripts/lib/geo-director.mjs';
import {loadGeoData} from '../scripts/lib/geo-primitives.mjs';
import {planMapSoundEvents} from '../scripts/lib/sound-design.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const geo = loadGeoData(root);
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

describe('geodesy', () => {
  it('turns kilometres into degrees of arc on the mean Earth radius', () => {
    assert.ok(Math.abs(kmToDegrees(EARTH_RADIUS_KM * (Math.PI / 180)) - 1) < 1e-12);
    assert.ok(Math.abs(kmToDegrees(111.195) - 1) < 1e-3);
  });

  it('lands the right distance away, on the right side', () => {
    for (const [from, bearing, km] of [[[0, 0], 90, 500], [[10, 50], 0, 1200], [[-70, -30], 225, 3000], [[170, 10], 90, 2000]] as [[number, number], number, number][]) {
      const to = destination(from, km, bearing);
      assert.ok(Math.abs(geoDistance(from, to) * EARTH_RADIUS_KM - km) < 1e-6, `${from} ${bearing} ${km}`);
    }
    const [lon, lat] = destination([0, 0], 1000, 90);
    assert.ok(lon > 8.9 && lon < 9.1 && Math.abs(lat) < 1e-9, 'due east along the equator');
    const [, north] = destination([20, 40], 500, 0);
    assert.ok(north > 44 && north < 45, 'due north');
  });

  it('wraps across the antimeridian', () => {
    const [lon] = destination([179, 0], 500, 90);
    assert.ok(lon < -170 && lon > -180, String(lon));
  });
});

describe('distance rings in a shot', () => {
  const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
  const ring = {type: 'ring', center: 'country:GIB', radiusKm: 14, text: '14 KM', at: 0.3};

  it('are accepted with a place or a point as centre, and need a sensible radius', () => {
    const parses = (annotation: object) => primitiveSchema.safeParse({...base, annotations: [annotation]}).success;
    assert.equal(parses(ring), true);
    assert.equal(parses({...ring, center: {lon: -5.6, lat: 36}}), true);
    assert.equal(parses({...ring, radiusKm: 0}), false);
    assert.equal(parses({...ring, radiusKm: 50000}), false);
  });

  const research = geoResearchSchema.parse(read('research/geographica/strait-of-gibraltar.json'));
  const {places, datasets} = resolveResearchPlaces(research, geo);
  const shot = (annotation: object) => ({camera: [{target: 'world', at: 0}], annotations: [annotation]});

  it('are only drawn with a radius the research states', () => {
    const numbers = JSON.stringify(research.claims);
    assert.match(numbers, /14\.2/, 'the Gibraltar research says 14.2 km');
    const first = [...places.values()].find((place: any) => place.kind === 'country');
    const primitive = shotToPrimitive(shot({type: 'ring', center: first!.id, radiusKm: 14.2, text: '14.2 KM', at: 0.2}), {places, research, datasets}) as any;
    assert.equal(primitive.annotations[0].radiusKm, 14.2);
    assert.throws(() => shotToPrimitive(shot({type: 'ring', center: first!.id, radiusKm: 37, at: 0.2}), {places, research, datasets}), /radius 37 km is not a number in the research/);
    assert.throws(() => shotToPrimitive(shot({type: 'ring', center: first!.id, radiusKm: 14.2, text: '37 KM', at: 0.2}), {places, research, datasets}), /states 37/);
  });

  it('must be framed whole', () => {
    const boxes = new Map<string, [number, number, number, number]>();
    const placesWithGib = new Map<string, any>([['country:GIB', geo.entities.get('country:GIB')]]);
    const ringShot = (bbox: number[]) => primitiveSchema.parse({...base, camera: [{target: {bbox}, at: 0}], annotations: [{...ring, radiusKm: 100}]}) as any;
    assert.equal(unframedRings(ringShot([-5.4, 36.05, -5.3, 36.15]), placesWithGib, boxes).length, 1, 'a frame smaller than the ring');
    assert.equal(unframedRings(ringShot([-8, 34, -3, 38]), placesWithGib, boxes).length, 0);
  });

  it('sound like a swell', () => {
    const events = planMapSoundEvents([{id: 'a', beat: 'hook', durationSeconds: 5, primitive: {...base, annotations: [ring]}} as any]);
    assert.deepEqual(events.map((event) => event.cue), ['swell']);
  });
});
