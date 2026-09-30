import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {bboxOf, buildEntities, roundGeometry, sha256, slimWater, type GeoEntity} from '../scripts/lib/geo-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const geo = (file: string) => path.join(root, 'public/geo', file);
const square = (west: number, south: number, east: number, north: number) => ({type: 'Polygon' as const, coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]]});

describe('geo data helpers', () => {
  it('rounds coordinates and drops points that collapse together', () => {
    const rounded = roundGeometry({type: 'Polygon', coordinates: [[[0.0001, 0], [0.0002, 0], [1.23456, 2.34567], [0, 0]]]}, 3);
    assert.deepEqual(rounded.coordinates, [[[0, 0], [1.235, 2.346], [0, 0]]]);
  });

  it('boxes shapes that cross the antimeridian the short way round', () => {
    assert.deepEqual(bboxOf(square(10, 20, 30, 40)), [10, 20, 30, 40]);
    const fiji = {type: 'MultiPolygon' as const, coordinates: [square(177, -18, 179.9, -16).coordinates, square(-180, -17, -178.5, -16).coordinates]};
    assert.deepEqual(bboxOf(fiji), [177, -18, -178.5, -16], 'west > east marks the crossing');
  });

  it('numbers repeated water names instead of colliding', () => {
    const feature = (name: string, geometry: ReturnType<typeof square>) => ({type: 'Feature' as const, properties: {name, featurecla: 'sea'}, geometry});
    const water = slimWater({type: 'FeatureCollection', features: [feature('Reef', square(2, 0, 3, 1)), feature('Reef', square(0, 0, 1, 1)), feature('Black Sea', square(27, 40, 42, 47))]});
    assert.deepEqual(water.features.map((item) => item.id), ['water:black-sea', 'water:reef', 'water:reef-2']);
  });

  it('flags countries that administer or claim a disputed area', () => {
    const country = (id: string, name: string, geometry: ReturnType<typeof square>) => ({type: 'Feature' as const, id, properties: {name, iso3: id.slice(-3), label: [0, 0]}, geometry});
    const entities = buildEntities({
      countries: {type: 'FeatureCollection', features: [country('country:GEO', 'Georgia', square(40, 41, 47, 44)), country('country:ARM', 'Armenia', square(43, 38, 47, 41))]},
      water: {type: 'FeatureCollection', features: []},
      disputed: {type: 'FeatureCollection', features: [{type: 'Feature', id: 'disputed:abkhazia-B35', properties: {name: 'Abkhazia', administeredBy: 'Georgia', note: 'Self admin.; Claimed by Georgia'}, geometry: square(40, 42, 42, 43.5)}]},
    });
    assert.deepEqual(entities.find((entity) => entity.id === 'country:GEO')!.review, [{disputed: 'disputed:abkhazia-B35', name: 'Abkhazia', note: 'Self admin.; Claimed by Georgia'}]);
    assert.equal(entities.find((entity) => entity.id === 'country:ARM')!.review, undefined);
  });
});

describe('pinned geo assets', () => {
  const manifest = JSON.parse(fs.readFileSync(geo('manifest.json'), 'utf8'));
  const entities = JSON.parse(fs.readFileSync(geo('entities.json'), 'utf8')) as GeoEntity[];
  const byId = new Map(entities.map((entity) => [entity.id, entity]));

  it('match their manifest checksums and record source, version and license', () => {
    for (const [file, {sha256: expected}] of Object.entries(manifest.files as Record<string, {sha256: string}>)) {
      assert.equal(sha256(fs.readFileSync(geo(file))), expected, file);
    }
    assert.equal(manifest.source.version, 'v5.1.2');
    assert.equal(manifest.source.license, 'Public domain');
    assert.match(manifest.source.attribution, /Natural Earth/);
  });

  it('can frame Georgia, its neighbours and both seas', () => {
    for (const id of ['country:GEO', 'country:ARM', 'country:AZE', 'country:TUR', 'country:RUS', 'water:black-sea', 'water:caspian-sea']) assert.ok(byId.has(id), id);
    const [west, south, east, north] = byId.get('country:GEO')!.bbox;
    assert.ok(west > 39 && east < 47 && south > 40.5 && north < 44, 'Georgia sits in the Caucasus');
    assert.ok(byId.get('water:black-sea')!.bbox[2] < byId.get('country:GEO')!.bbox[0] + 2, 'the Black Sea is west of Georgia');
    assert.ok(byId.get('water:caspian-sea')!.bbox[0] > byId.get('country:GEO')!.bbox[2] - 1, 'the Caspian is east of Georgia');
  });

  it("flags Georgia's breakaway regions for editorial review", () => {
    assert.deepEqual(byId.get('country:GEO')!.review!.map((item) => item.name).sort(), ['Abkhazia', 'South Ossetia']);
  });

  it('gives every entity a unique id and marks antimeridian shapes', () => {
    assert.equal(byId.size, entities.length);
    assert.equal(byId.get('country:FJI')!.crossesAntimeridian, true);
    assert.equal(byId.get('country:GEO')!.crossesAntimeridian, undefined);
  });
});
