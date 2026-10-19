import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {countriesWithin, nearestKm, reachDistances, type Boundary} from '../src/video/geo/reach';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const countries = JSON.parse(fs.readFileSync(path.join(root, 'public', 'geo', 'countries.geojson'), 'utf8')).features as {id: string; geometry: Boundary['geometry']}[];
const boundaries: Boundary[] = countries.map((feature) => ({id: feature.id.startsWith('country:') ? feature.id : `country:${feature.id}`, geometry: feature.geometry}));
const brussels: [number, number] = [4.35, 50.85];

describe('reach: distance to the nearest border', () => {
  it('is 0 for the country the centre lies in', () => {
    const belgium = boundaries.find((country) => country.id === 'country:BEL')!;
    assert.equal(nearestKm(belgium, brussels), 0);
  });

  it('measures a straight line to the nearest border, not to a point inside the country', () => {
    const [netherlands, france, spain] = ['NLD', 'FRA', 'ESP'].map((code) => boundaries.find((country) => country.id === `country:${code}`)!);
    const [nl, fr, es] = [nearestKm(netherlands, brussels), nearestKm(france, brussels), nearestKm(spain, brussels)];
    assert.ok(nl > 0 && nl < 60, `Netherlands ${nl}`);
    assert.ok(fr > 40 && fr < 75, `France ${fr}`);
    assert.ok(es > 800 && es < 1100, `Spain ${es}`);
  });

  it('lights the neighbours within 200 km of Brussels and not the far countries', () => {
    const distances = reachDistances(boundaries, brussels);
    const within = countriesWithin(distances, 200);
    for (const code of ['BEL', 'NLD', 'FRA', 'LUX', 'DEU']) assert.ok(within.includes(`country:${code}`), code);
    for (const code of ['ESP', 'ITA', 'POL', 'NOR']) assert.ok(!within.includes(`country:${code}`), code);
    assert.ok(countriesWithin(distances, 50).length < within.length);
    assert.deepEqual(countriesWithin(distances, 0), ['country:BEL']);
  });

  it('only ever adds countries as the radius grows', () => {
    const distances = reachDistances(boundaries, brussels);
    let before = 0;
    for (const km of [0, 50, 100, 200, 400, 800, 1600]) {
      const count = countriesWithin(distances, km).length;
      assert.ok(count >= before);
      before = count;
    }
  });

  it('walks a long straight border instead of only its corners', () => {
    // A square country 40 degrees wide (wound clockwise, the way d3 wants an outer ring): its nearest point to a centre below the middle of its south edge is on the edge, not at a corner.
    const square: Boundary = {id: 'country:SQR', geometry: {type: 'Polygon', coordinates: [[[-20, 10], [-20, 50], [20, 50], [20, 10], [-20, 10]]]}};
    // The edge is a great-circle arc, which bows towards the pole: at the middle it lies at 10.63 degrees north, about 1,182 km away.
    const km = nearestKm(square, [0, 0]);
    assert.ok(Math.abs(km - 1182) < 10, `${km} km against about 1,182 km`);
    assert.ok(km < 1500, 'a corner is more than 2,000 km away, so the edge itself was found');
  });
});

describe('counting rings', () => {
  const camera = [{target: 'world', at: 0, padding: 0.1, ease: 'in-out'}];
  const shot = (extra: object = {}) => ({kind: 'geo-map', camera, highlights: [], annotations: [{type: 'ring', center: 'city:singapore-sgp', radiusKm: 5000, reach: true}], dataset: 'natural-earth', ...extra});

  it('accept reach on a flat map and refuse it on a globe or a morph', () => {
    assert.ok(primitiveSchema.safeParse(shot()).success);
    assert.equal(primitiveSchema.safeParse(shot({globe: true})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({morph: true})).success, false);
  });
});
