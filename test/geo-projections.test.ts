import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {geoGraticule, geoPath} from 'd3-geo';
import {MAP_SIZE} from '../src/video/geo/camera';
import {AZIMUTHAL_CLIP, EQUAL_EARTH_K, hasSphereOutline, makeMorphProjection, makeProjection, morphMix, PROJECTION_KINDS} from '../src/video/geo/projections';
import {chooseProjection, directGeoVisuals} from '../scripts/lib/geo-director.mjs';
import {loadGeoData} from '../scripts/lib/geo-primitives.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const geo = loadGeoData(root);
const view = {lon: 20, lat: 5, scale: 300};

describe('map projections', () => {
  it('put the centre of the view in the middle of the frame, whatever the projection', () => {
    for (const kind of PROJECTION_KINDS) {
      const [x, y] = makeProjection(kind, view, MAP_SIZE)([view.lon, view.lat])!;
      assert.ok(Math.abs(x - MAP_SIZE.width / 2) < 1e-6 && Math.abs(y - MAP_SIZE.height / 2) < 1e-6, kind);
    }
  });

  it('lift the view to leave room for a chart', () => {
    const [, y] = makeProjection('albers', view, MAP_SIZE, 100)([view.lon, view.lat])!;
    assert.ok(Math.abs(y - (MAP_SIZE.height / 2 - 100)) < 1e-6);
  });

  it('keep a view that fills the frame in Mercator filling about as much in the others, near the equator', () => {
    const width = (kind: (typeof PROJECTION_KINDS)[number]) => {
      const projection = makeProjection(kind, {lon: 0, lat: 0, scale: 250}, MAP_SIZE);
      return projection([10, 0])![0] - projection([-10, 0])![0];
    };
    const mercator = width('mercator');
    for (const kind of ['equal-earth', 'albers', 'azimuthal'] as const) assert.ok(Math.abs(width(kind) / mercator - 1) < 0.02, `${kind}: ${width(kind)} vs ${mercator}`);
  });

  it('keep true areas in the equal-area projections: Greenland is not Africa-sized', () => {
    const feature = (id: string) => read('public/geo/countries.geojson').features.find((item: {id: string}) => item.id === id);
    const [greenland, africaProxy] = [feature('country:GRL'), feature('country:COD')];
    for (const kind of ['equal-earth', 'albers'] as const) {
      const projection = makeProjection(kind, {lon: 0, lat: 40, scale: 120}, MAP_SIZE);
      const area = (item: object) => Math.abs(geoPath(projection).area(item as never));
      // Greenland is about 0.9x the Democratic Republic of the Congo's area on the globe; Mercator makes it several times larger.
      const ratio = area(greenland) / area(africaProxy);
      assert.ok(ratio > 0.7 && ratio < 1.3, `${kind}: Greenland / DR Congo = ${ratio.toFixed(2)}`);
    }
    const mercator = makeProjection('mercator', {lon: 0, lat: 40, scale: 120}, MAP_SIZE);
    assert.ok(geoPath(mercator).area(greenland) / geoPath(mercator).area(africaProxy) > 3, 'Mercator inflates Greenland');
  });

  it('draw the whole world as a shape of its own only where that makes sense', () => {
    assert.deepEqual(PROJECTION_KINDS.filter(hasSphereOutline), ['equal-earth', 'azimuthal']);
    const projection = makeProjection('equal-earth', {lon: 0, lat: 0, scale: 160}, MAP_SIZE);
    const outline = geoPath(projection)({type: 'Sphere'});
    assert.ok(outline && outline.length > 20);
    assert.ok(EQUAL_EARTH_K > 0.8 && EQUAL_EARTH_K < 0.9);
  });

  it('can see most of the sphere from an azimuthal centre but never the antipode', () => {
    const projection = makeProjection('azimuthal', {lon: 0, lat: 0, scale: 150}, MAP_SIZE);
    assert.ok(geoPath(projection)(geoGraticule()()) !== null);
    assert.ok(AZIMUTHAL_CLIP < 180);
  });
});

describe('choosing a projection for an episode', () => {
  const place = (name: string) => geo.entities.get(`country:${name}`);
  it('keeps Mercator near the equator, uses a conic map in the mid and high latitudes, and azimuthal at the poles', () => {
    for (const code of ['MDG', 'IDN', 'EGY', 'DZA', 'ECU']) assert.equal(chooseProjection(place(code)), 'mercator', code);
    for (const code of ['MNG', 'KAZ', 'CAN', 'RUS', 'ISL', 'FRA']) assert.equal(chooseProjection(place(code)), 'albers', code);
    assert.equal(chooseProjection({bbox: [-180, 80, 180, 90]}), 'azimuthal');
  });

  it('accepts a projection on a map shot and refuses an unknown one', () => {
    const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
    assert.equal(primitiveSchema.safeParse({...base, projection: 'albers'}).success, true);
    assert.equal(primitiveSchema.safeParse({...base, projection: 'robinson'}).success, false);
  });

  const lesotho = {draft: read('drafts/geographica/lesotho-enclave.json'), research: read('research/geographica/lesotho-enclave.json')};
  const undirected = (extra: object) => ({...lesotho.draft, ...extra, scenes: lesotho.draft.scenes.map(({primitive, ...scene}: any) => scene)});
  const good = fs.readFileSync(path.join(root, 'test/fixtures/geo-director/lesotho-enclave.reply.json'), 'utf8');
  const direct = (extra: object) => directGeoVisuals({draft: undirected(extra), research: lesotho.research, geo, complete: async (prompt: any) => (/review the map shots/.test(prompt.system) ? '{"scenes": []}' : good)});

  it('sets the chosen projection on every flat map scene and leaves Mercator unset', async () => {
    const albers = await direct({projection: 'albers'});
    assert.ok(albers.draft.scenes.every((scene: any) => scene.primitive.globe || scene.primitive.projection === 'albers'));
    const auto = await direct({});
    assert.ok(auto.draft.scenes.every((scene: any) => scene.primitive.projection === undefined), 'Lesotho is near the equator band edge: Mercator');
  });

  it('leaves a globe scene on its globe', async () => {
    const globeReply = JSON.stringify({scenes: JSON.parse(good).scenes.map((shot: any, index: number) => (index === 0 ? {...shot, globe: true} : shot))});
    const result = await directGeoVisuals({draft: undirected({projection: 'azimuthal'}), research: lesotho.research, geo, complete: async (prompt: any) => (/review the map shots/.test(prompt.system) ? '{"scenes": []}' : globeReply)});
    assert.equal(result.draft.scenes[0].primitive.globe, true);
    assert.equal(result.draft.scenes[0].primitive.projection, undefined);
    assert.equal(result.draft.scenes[1].primitive.projection, 'azimuthal');
  });
});

describe('projection morph', () => {
  const places: [number, number][] = [[-42, 72], [20, 5], [100, 60], [-70, -30]];
  const near = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

  it('starts as Mercator and ends as Equal Earth, point for point', () => {
    for (const place of places) {
      assert.ok(near(makeMorphProjection(view, MAP_SIZE, 0, 0)(place)!, makeProjection('mercator', view, MAP_SIZE)(place)!), `${place} at 0`);
      assert.ok(near(makeMorphProjection(view, MAP_SIZE, 0, 1)(place)!, makeProjection('equal-earth', view, MAP_SIZE)(place)!), `${place} at 1`);
    }
  });

  it('keeps the centre of the view in the middle of the frame all the way', () => {
    for (const mix of [0, .3, .7, 1]) {
      const [x, y] = makeMorphProjection(view, MAP_SIZE, 0, mix)([view.lon, view.lat])!;
      assert.ok(Math.abs(x - MAP_SIZE.width / 2) < 1e-6 && Math.abs(y - MAP_SIZE.height / 2) < 1e-6, `${mix}`);
    }
  });

  it('shrinks a far-north place steadily as it settles to its true size', () => {
    const greenland = (mix: number) => {
      const projection = makeMorphProjection({lon: -40, lat: 20, scale: 300}, MAP_SIZE, 0, mix);
      return Math.abs(projection([-60, 82])![1] - projection([-60, 60])![1]);
    };
    assert.ok(greenland(0) > greenland(.5) && greenland(.5) > greenland(1));
  });

  it('holds still, then flows, then settles', () => {
    assert.equal(morphMix(0), 0);
    assert.equal(morphMix(.2), 0);
    assert.equal(morphMix(.8), 1);
    assert.equal(morphMix(1), 1);
    assert.ok(morphMix(.5) > .4 && morphMix(.5) < .6);
  });

  it('is a flat Mercator-to-Equal-Earth shot only', () => {
    const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
    assert.ok(primitiveSchema.safeParse({...base, morph: true}).success);
    assert.ok(!primitiveSchema.safeParse({...base, morph: true, globe: true}).success);
    assert.ok(!primitiveSchema.safeParse({...base, morph: true, projection: 'albers'}).success);
  });
});
