import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {geoContains} from 'd3-geo';
import {CELL, ELEVATION_LEVELS, FLOOD_LEVELS, floodFrom, HEIGHT, parseDods, simplify, WIDTH} from '../scripts/lib/elevation.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {shotToPrimitive} from '../scripts/lib/geo-director.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (lon: number, lat: number) => Math.floor((90 - lat) / CELL) * WIDTH + Math.floor((lon + 180) / CELL);

describe('reading the elevation server', () => {
  it('takes the floats of the array out of a DAP2 reply', () => {
    const header = Buffer.from('Dataset {\n    Float32 z[2];\n} x;\n\nData:\n');
    const body = Buffer.alloc(8 + 8);
    body.writeUInt32BE(2, 0);
    body.writeUInt32BE(2, 4);
    body.writeFloatBE(-12.5, 8);
    body.writeFloatBE(3300, 12);
    assert.deepEqual([...parseDods(Buffer.concat([Buffer.from('\n'), header, body]))], [-12.5, 3300]);
  });

  it('says so when the server sent an error instead', () => {
    assert.throws(() => parseDods(Buffer.from('Error {\n code = 3;\n};')), /did not return data/);
  });
});

describe('the sea-level flood', () => {
  // The whole world at 100 m, a coast of low land at 3 m (cells 100-150 east), and a basin at -50 m walled off by high land.
  const grid = new Int16Array(WIDTH * HEIGHT).fill(-100);
  const land = (lon: number, lat: number, height: number) => {grid[at(lon, lat)] = height;};
  for (let lon = 0; lon < 30; lon += CELL) for (let lat = 0; lat < 30; lat += CELL) land(lon + .001, lat + .001, 500);
  for (let lon = 0; lon < 5; lon += CELL) for (let lat = 0; lat < 30; lat += CELL) land(lon + .001, lat + .001, 3);
  for (let lon = 15; lon < 20; lon += CELL) for (let lat = 15; lat < 20; lat += CELL) land(lon + .001, lat + .001, -50);

  it('covers low land the sea can reach', () => {
    const wet = floodFrom(grid, 5, [[-10, 15]]);
    assert.equal(wet[at(2, 10)], 1);
    assert.equal(wet[at(20, 10)], 0);
  });

  it('leaves a low basin the sea cannot reach dry', () => {
    const wet = floodFrom(grid, 5, [[-10, 15]]);
    assert.equal(wet[at(17, 17)], 0);
  });

  it('floods more as the sea rises', () => {
    const count = (level: number) => floodFrom(grid, level, [[-10, 15]]).reduce((sum, value) => sum + value, 0);
    assert.ok(count(1) < count(5));
    assert.ok(count(5) < count(600));
  });
});

describe('simplifying a ring', () => {
  it('drops points on a straight line and keeps the corners', () => {
    const ring: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 3], [0, 3], [0, 0]];
    assert.deepEqual(simplify(ring, .1), [[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]]);
  });
});

describe('the pinned elevation data', () => {
  const made = JSON.parse(fs.readFileSync(path.join(root, 'public', 'geo', 'elevation.json'), 'utf8'));
  const flood = (metres: number) => made.flood.find((band: {properties: {metres: number}}) => band.properties.metres === metres);

  it('has every level', () => {
    assert.deepEqual(made.elevation.map((band: {properties: {metres: number}}) => band.properties.metres), ELEVATION_LEVELS);
    assert.deepEqual(made.flood.map((band: {properties: {metres: number}}) => band.properties.metres), FLOOD_LEVELS);
    assert.match(made.source.attribution, /NOAA/);
  });

  it('floods the Nile delta and Amsterdam, and not the Dead Sea basin or Tibet', () => {
    assert.ok(geoContains(flood(20), [31, 31]), 'Nile delta at 20 m');
    assert.ok(geoContains(flood(5), [4.9, 52.4]), 'Amsterdam at 5 m');
    assert.ok(!geoContains(flood(50), [35.5, 31.4]), 'Dead Sea shore, walled off from the sea');
    assert.ok(!geoContains(flood(50), [90, 31]), 'Tibet');
  });

  it('rises with the land: the Himalaya is in the top band, the Netherlands is not', () => {
    const top = made.elevation[made.elevation.length - 1];
    assert.ok(made.elevation.some((band: object) => geoContains(band as never, [86.9, 28.0])));
    assert.ok(!geoContains(top, [5, 52]));
  });
});

describe('surface shots', () => {
  const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
  it('take elevation and flood with a rise from the list', () => {
    assert.ok(primitiveSchema.safeParse({...base, surface: {kind: 'elevation', at: .1}}).success);
    assert.ok(primitiveSchema.safeParse({...base, surface: {kind: 'flood', at: .1, rise: 10}}).success);
    assert.ok(!primitiveSchema.safeParse({...base, surface: {kind: 'flood', at: .1, rise: 7}}).success);
    assert.ok(!primitiveSchema.safeParse({...base, surface: {kind: 'flood', at: .1}}).success);
  });

  it('only flood by a rise the research states', () => {
    const places = new Map([['country:EGY', {id: 'country:EGY', kind: 'country', name: 'Egypt', bbox: [25, 22, 36, 32]}]]);
    const shot = (floodRise: number) => ({camera: [{target: 'country:EGY', at: 0}], highlights: [], annotations: [], floodRise});
    assert.throws(() => shotToPrimitive(shot(10), {places, research: {claims: []}} as never), /not a number in the research/);
    const stated = shotToPrimitive(shot(10), {places, research: {claims: [{text: 'A rise of 10 metres would flood the delta.'}]}} as never);
    assert.deepEqual(stated.surface, {kind: 'flood', at: 0.15, rise: 10});
  });
});
