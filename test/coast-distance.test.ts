import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {geoArea} from 'd3-geo';
import {bandPolygons, CELL, coastDistanceKm, distanceGrid, farthest, haversineKm, HEIGHT, landMask, LEVELS_KM, openSea, WIDTH} from '../scripts/lib/coast-distance.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {sha256} from '../scripts/lib/geo-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A square continent from 0 to 40 degrees east, 0 to 40 north, with a lake-sized hole of land-locked water in the middle.
const continent = {type: 'FeatureCollection', features: [{type: 'Feature', geometry: {type: 'Polygon', coordinates: [
  [[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]],
  [[18, 18], [18, 22], [22, 22], [22, 18], [18, 18]],
]}}]};
const at = (lon: number, lat: number) => Math.floor((90 - lat) / CELL) * WIDTH + Math.floor((lon + 180) / CELL);

describe('distance from the sea', () => {
  const mask = landMask(continent as never);
  const sea = openSea(mask);
  const distance = distanceGrid(sea);

  it('fills a polygon but leaves its holes and the water outside', () => {
    assert.equal(mask[at(5, 5)], 1);
    assert.equal(mask[at(20, 20)], 0);
    assert.equal(mask[at(-10, 20)], 0);
    assert.equal(mask[at(50, 20)], 0);
  });

  it('counts water that never reaches the ocean as land, not sea', () => {
    assert.equal(sea[at(-10, 20)], 1);
    assert.equal(sea[at(20, 20)], 0);
  });

  it('is zero in the sea and grows inland to the middle of the land', () => {
    assert.equal(coastDistanceKm(distance, [-10, 20]), 0);
    const [near, middle] = [coastDistanceKm(distance, [2, 20]), coastDistanceKm(distance, [10, 20])];
    assert.ok(near < middle);
    // The corner of the land is the farthest from the sea, about 20 degrees of longitude from the coast at 20 N: ~2,090 km.
    const edge = coastDistanceKm(distance, [20, 3]);
    assert.ok(edge < middle + 1);
  });

  it('measures a great-circle distance close to the true one', () => {
    const km = coastDistanceKm(distance, [20, 15]);
    const expected = haversineKm(20, 15, 20, 0);
    assert.ok(Math.abs(km - expected) < 2 * CELL * 111, `${km} vs ${expected}`);
    assert.ok(farthest(distance, [0, 0, 40, 40]).km > 1500);
  });

  it('draws a band for each level, wound the way d3-geo reads polygons', () => {
    const bands = bandPolygons(distance);
    assert.deepEqual(bands.map((band) => band.properties.km), LEVELS_KM);
    for (const band of bands) assert.ok(geoArea(band as never) < 1, `${band.properties.km} km band is a small patch, not the whole sphere`);
  });
});

describe('the pinned distance data', () => {
  const file = path.join(root, 'public', 'geo', 'coast-distance.json');
  const made = JSON.parse(fs.readFileSync(file, 'utf8'));

  it('was made from the pinned country outlines', () => {
    assert.equal(made.derivedFrom, sha256(fs.readFileSync(path.join(root, 'public', 'geo', 'countries.geojson'))));
  });

  it('puts the heart of Eurasia far from any sea and the coast of Portugal near one', () => {
    const area = (km: number) => made.bands.find((band: {properties: {km: number}}) => band.properties.km === km);
    assert.ok(geoArea(area(1500)) * 6371 * 6371 > 3e6);
    assert.ok(geoArea(area(250)) > geoArea(area(500)));
    assert.equal(HEIGHT, 720);
  });
});

describe('the surface shot field', () => {
  const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
  it('takes coast-distance and a start time', () => {
    assert.ok(primitiveSchema.safeParse({...base, surface: {kind: 'coast-distance', at: .15}}).success);
    assert.ok(!primitiveSchema.safeParse({...base, surface: {kind: 'rainfall', at: .15}}).success);
    assert.ok(!primitiveSchema.safeParse({...base, surface: {kind: 'coast-distance', at: 2}}).success);
  });
});
