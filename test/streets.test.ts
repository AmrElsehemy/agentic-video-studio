import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {boxOf, classesFor, compactStreets, overpassQuery, ROAD_CLASSES, TALL, withBuildings} from '../scripts/lib/streets.mjs';
import {streetCamera, shotToPrimitive} from '../scripts/lib/geo-director.mjs';
import {geoProblems, loadGeoData, osmRightsAsset, streetsProblems} from '../scripts/lib/geo-primitives.mjs';
import {publishBlockers} from '../scripts/lib/publish-checks.mjs';
import {sha256} from '../scripts/lib/geo-data.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const geo = loadGeoData();

describe('street data from OpenStreetMap', () => {
  it('boxes a city taller than wide, for portrait video', () => {
    const [south, west, north, east] = boxOf([12.45, 41.9], 1);
    // In metres the box is TALL times as high as it is wide.
    const [wide, high] = [(east - west) * Math.cos((41.9 * Math.PI) / 180), north - south];
    assert.ok(Math.abs(high / wide - TALL) < 0.01);
    assert.ok(north - south > east - west);
    assert.ok(Math.abs((west + east) / 2 - 12.45) < 1e-4 && Math.abs((south + north) / 2 - 41.9) < 1e-4);
  });

  it('keeps a big area to the main roads and buildings to a small one', () => {
    assert.deepEqual(classesFor(5), ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
    assert.deepEqual(classesFor(1), ROAD_CLASSES);
    assert.ok(withBuildings(1) && !withBuildings(5));
    assert.ok(!overpassQuery([29, 41], 5).includes('["building"]'));
    assert.ok(overpassQuery([12.45, 41.9], 1).includes('["building"]'));
  });

  it('sorts what Overpass returns into roads by class, water, rails and buildings', () => {
    const way = (tags: object, geometry: {lon: number; lat: number}[]) => ({type: 'way', tags, geometry});
    const square = [{lon: 1, lat: 1}, {lon: 1, lat: 2}, {lon: 2, lat: 2}, {lon: 1, lat: 1}];
    const out = compactStreets([
      way({highway: 'primary'}, [{lon: 0, lat: 0}, {lon: 1, lat: 1}]),
      way({highway: 'residential_link_unknown'}, [{lon: 0, lat: 0}, {lon: 1, lat: 1}]),
      way({highway: 'footway'}, [{lon: 0, lat: 0}, {lon: 1, lat: 1}]),
      way({railway: 'rail'}, [{lon: 0, lat: 0}, {lon: 1, lat: 1}]),
      way({natural: 'water'}, square),
      way({natural: 'water'}, square.slice(0, 3)),
      way({waterway: 'river'}, [{lon: 0, lat: 0}, {lon: 1, lat: 1}]),
      way({natural: 'coastline'}, [{lon: 0, lat: 0}, {lon: 1, lat: 1}]),
      way({building: 'yes'}, square),
      {type: 'node'},
    ]);
    assert.equal(out.roads[ROAD_CLASSES.indexOf('primary')].length, 1);
    assert.equal(out.roads[ROAD_CLASSES.indexOf('path')].length, 1);
    assert.equal(out.roads.flat().length, 2, 'an unknown kind of road is left out');
    assert.equal(out.rails.length, 1);
    assert.equal(out.water.length, 1, 'only a closed ring is a water area');
    assert.equal(out.rivers.length, 1);
    assert.equal(out.coast.length, 1);
    assert.equal(out.buildings.length, 1);
  });
});

describe('the pinned street data', () => {
  const index = read('public/geo/streets/index.json');

  it('matches its index, and credits OpenStreetMap', () => {
    assert.match(index.attribution, /OpenStreetMap contributors/);
    for (const [id, entry] of Object.entries(index.cities) as [string, {sha256: string}][]) {
      assert.equal(sha256(fs.readFileSync(path.join(root, 'public', 'geo', 'streets', `${id}.json`))), entry.sha256, id);
    }
  });

  it('puts real streets in each city: roads, and the Tiber beside the Vatican', () => {
    const vatican = read('public/geo/streets/vatican-city.json');
    assert.ok(vatican.roads.flat().length > 1000);
    assert.ok(vatican.buildings.length > 500);
    assert.ok(vatican.rivers.length + vatican.water.length > 0);
    for (const road of vatican.roads.flat().slice(0, 50)) for (const [lon, lat] of road) assert.ok(lon > 12.3 && lon < 12.6 && lat > 41.8 && lat < 42, 'in Rome');
  });
});

describe('a street map shot', () => {
  const places = new Map([['country:VAT', {id: 'country:VAT', kind: 'country', name: 'Vatican City', bbox: [12.44, 41.9, 12.46, 41.91]}]]);
  const cities = geo.streets!.cities;
  const shot = (extra: object) => ({camera: [{target: 'country:VAT', at: 0}], highlights: [], annotations: [], ...extra});
  const context = {places, research: {claims: [], places: {}}, streets: cities} as never;

  it('frames the city itself, pushing in from nearly all of it to two thirds', () => {
    const primitive = shotToPrimitive(shot({streets: 'vatican-city'}), context);
    assert.deepEqual(primitive.streets, {city: 'vatican-city', at: 0.05});
    assert.equal(primitive.camera.length, 2);
    const [first, second] = primitive.camera.map((key: any) => key.target.bbox);
    assert.ok(second[0] > first[0] && second[2] < first[2] && second[1] > first[1] && second[3] < first[3]);
    assert.deepEqual(streetCamera(cities['vatican-city'].box!), primitive.camera);
  });

  it('only for a city that has street data, and not with a globe or a layer', () => {
    assert.throws(() => shotToPrimitive(shot({streets: 'atlantis'}), context), /isn't a city with street data/);
    assert.throws(() => shotToPrimitive(shot({streets: 'vatican-city', globe: true}), context), /cannot also be/);
    assert.throws(() => shotToPrimitive(shot({streets: 'vatican-city', coastDistance: true}), context), /cannot also be/);
  });

  it('keeps its camera inside the data, and says so when it does not', () => {
    const primitive = shotToPrimitive(shot({streets: 'vatican-city'}), context);
    assert.deepEqual(streetsProblems(primitive, geo), []);
    assert.deepEqual(geoProblems(primitive, geo).filter((problem: string) => problem.startsWith('camera')), []);
    const wide = {...primitive, camera: [{target: {bbox: [10, 40, 14, 44]}, at: 0, padding: 0, ease: 'linear'}]};
    assert.match(streetsProblems(wide, geo)[0], /leaves Vatican City's street data/);
    assert.match(streetsProblems({...primitive, camera: [{target: 'world', at: 0}]}, geo)[0], /bbox camera/);
    assert.match(streetsProblems({...primitive, streets: {city: 'nowhere', at: 0}}, geo)[0], /no street data/);
  });

  it('is accepted by the schema, with a city id of lowercase words only', () => {
    const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
    assert.ok(primitiveSchema.safeParse({...base, streets: {city: 'vatican-city', at: .1}}).success);
    assert.ok(!primitiveSchema.safeParse({...base, streets: {city: '../etc', at: .1}}).success);
  });

  it('blocks release until OpenStreetMap is credited, and the credit is the licence line', () => {
    const manifest = read('videos/geographica/vatican-city/video.json');
    const streets = {...manifest, scenes: manifest.scenes.map((scene: any, index: number) => (index === 0 ? {...scene, primitive: {...scene.primitive, ...shotToPrimitive(shot({streets: 'vatican-city'}), context)}} : scene))};
    const cleared = {...streets.rights, releaseStatus: 'cleared', publicReleaseApproved: true};
    assert.ok(publishBlockers({...streets, rights: cleared}, geo).some((blocker: string) => blocker.startsWith('osm-credit:')));
    const credited = {...cleared, assets: [...cleared.assets, osmRightsAsset(geo)]};
    assert.ok(!publishBlockers({...streets, rights: credited}, geo).some((blocker: string) => blocker.startsWith('osm-credit:')));
    assert.match(osmRightsAsset(geo).notes, /© OpenStreetMap contributors \(ODbL\)/);
  });
});
