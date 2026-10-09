import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {geoArea, geoCentroid, geoDistance} from 'd3-geo';
import {rotateGeometry, rotatePoint} from '../scripts/lib/plates.mjs';
import {alignRotation, partialRotation, trueSizeRotation} from '../scripts/lib/true-size.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const countries = JSON.parse(fs.readFileSync(path.join(root, 'public/geo/countries.geojson'), 'utf8')).features;
const country = (id: string) => countries.find((feature: {id: string}) => feature.id === id);
const near = (actual: number[], expected: number[], tolerance = 1e-6) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < tolerance, `${actual} vs ${expected}`));

describe('true-size rotation', () => {
  it('carries a point onto another by the shortest way, and does nothing for the same point', () => {
    near(rotatePoint(alignRotation([10, 20], [-80, 45]), [10, 20]), [-80, 45], 1e-9);
    near(rotatePoint(alignRotation([10, 20], [10, 20]), [33, 44]), [33, 44]);
  });

  it('copes with a move to the opposite side of the world', () => {
    const [lon, lat] = rotatePoint(alignRotation([0, 0], [180, 0]), [0, 0]);
    assert.ok(Math.abs(Math.abs(lon) - 180) < 1e-9 && Math.abs(lat) < 1e-9);
  });

  it('keeps the area of a country exactly, and puts its centre on the target', () => {
    const algeria = country('country:DZA');
    const from = geoCentroid(algeria) as [number, number];
    const to: [number, number] = [-100, 39.5];
    const moved = {type: 'Feature', properties: {}, geometry: rotateGeometry(algeria.geometry, trueSizeRotation(from, to))};
    assert.ok(Math.abs(geoArea(moved as never) / geoArea(algeria) - 1) < 1e-9, 'same area');
    assert.ok(geoDistance(geoCentroid(moved as never), to) < 0.02, 'centred on the target');
  });

  it('keeps the shape north up: a point just north of the centre is still just north of it', () => {
    for (const [from, to] of [[[3, 28], [-100, 39]], [[46.7, -19], [2.5, 46.5]], [[25, 48], [100, -2]]] as [number, number][][]) {
      const q = trueSizeRotation(from, to);
      const [lon0, lat0] = rotatePoint(q, from);
      const [lon1, lat1] = rotatePoint(q, [from[0], from[1] + 0.5]);
      assert.ok(lat1 > lat0, `north stays north (${from} to ${to})`);
      assert.ok(Math.abs(((lon1 - lon0 + 540) % 360) - 180) < 0.02, `and not tilted sideways (${from} to ${to})`);
    }
  });

  it('slides there: nothing at the start, the whole move at the end, the middle in between', () => {
    const q = trueSizeRotation([3, 28], [-100, 39]);
    near(rotatePoint(partialRotation(q, 0), [3, 28]), [3, 28]);
    near(rotatePoint(partialRotation(q, 1), [3, 28]), [-100, 39], 1e-6);
    const [lon, lat] = rotatePoint(partialRotation(q, 0.5), [3, 28]);
    assert.ok(lon < 3 && lon > -100 && lat > 20, `${lon}, ${lat}`);
  });
});

import {directGeoVisuals, reconstructionConflicts, unframedJourneys} from '../scripts/lib/geo-director.mjs';
import {geoProblems, loadGeoData} from '../scripts/lib/geo-primitives.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';

describe('true-size comparisons in a shot', () => {
  const geo = loadGeoData(root);
  const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
  const comparison = {type: 'truesize', entity: 'country:DZA', onto: 'country:USA', at: 0.2, until: 0.6};

  it('needs an equal-area projection and no globe, so the copy cannot look the wrong size', () => {
    const parses = (extra: object) => primitiveSchema.safeParse({...base, annotations: [comparison], ...extra}).success;
    assert.equal(parses({}), false, 'Mercator by default');
    assert.equal(parses({projection: 'mercator'}), false);
    assert.equal(parses({projection: 'azimuthal'}), false, 'equidistant is not equal-area');
    assert.equal(parses({projection: 'albers'}), true);
    assert.equal(parses({projection: 'equal-earth'}), true);
    assert.equal(parses({projection: 'albers', globe: true}), false);
  });

  it('refuses to compare a place with itself', () => {
    assert.equal(primitiveSchema.safeParse({...base, projection: 'albers', annotations: [{...comparison, onto: 'country:DZA'}]}).success, false);
  });

  it('wants an outline to copy and a place to land on', () => {
    const problems = (annotation: object) => geoProblems(primitiveSchema.parse({...base, projection: 'albers', annotations: [annotation]}) as any, geo);
    assert.deepEqual(problems(comparison), []);
    assert.deepEqual(problems({...comparison, onto: 'city:cairo-egy'}), [], 'a city is a fine place to land');
    assert.match(problems({...comparison, entity: 'river:nile'})[0], /has no outline to copy/);
    assert.match(problems({...comparison, entity: 'city:cairo-egy'})[0], /has no outline to copy/);
    assert.match(problems({...comparison, onto: 'river:nile'})[0], /a copy can land on a country/);
  });

  it('does not let the place that slides also be highlighted, labelled or pointed at', () => {
    const shot = (extra: object) => primitiveSchema.parse({...base, projection: 'albers', ...extra, annotations: [comparison, ...((extra as any).annotations ?? [])]}) as any;
    assert.deepEqual(reconstructionConflicts(shot({highlights: [{entity: 'country:USA', style: 'outline', at: 0.1}]})), []);
    assert.deepEqual(reconstructionConflicts(shot({highlights: [{entity: 'country:DZA', style: 'fill', at: 0.1}]})), ['country:DZA']);
  });

  it('asks the camera to hold both where the place is and where its copy lands', () => {
    const places = new Map<string, any>([['country:DZA', geo.entities.get('country:DZA')], ['country:USA', geo.entities.get('country:USA')]]);
    const boxes = new Map<string, [number, number, number, number]>();
    const shot = (bbox: number[]) => primitiveSchema.parse({...base, projection: 'albers', camera: [{target: {bbox}, at: 0}], annotations: [comparison]}) as any;
    assert.equal(unframedJourneys(shot([-12, 18, 12, 38]), places, boxes, geo).length, 1, 'tight on Algeria misses where it lands');
    assert.equal(unframedJourneys(shot([-130, 15, 20, 60]), places, boxes, geo).length, 0);
  });

  it('makes the director use an equal-area projection for an episode that compares sizes, even near the equator', async () => {
    const lesotho = {draft: JSON.parse(fs.readFileSync(path.join(root, 'drafts/geographica/lesotho-enclave.json'), 'utf8')), research: JSON.parse(fs.readFileSync(path.join(root, 'research/geographica/lesotho-enclave.json'), 'utf8'))};
    const undirected = {...lesotho.draft, scenes: lesotho.draft.scenes.map(({primitive, ...scene}: any) => scene)};
    const reply = JSON.stringify({scenes: undirected.scenes.map((scene: {id: string}, index: number) => ({
      id: scene.id,
      camera: [{target: index % 2 ? 'country:ZAF' : 'country:LSO', at: 0}, {target: {around: ['country:LSO', 'country:ZAF']}, at: 1}],
      highlights: [{entity: index % 2 ? 'country:ZAF' : 'country:LSO', style: index % 3 ? 'fill' : 'outline', at: 0.2}],
      annotations: index === 2 ? [{type: 'truesize', entity: 'country:LSO', onto: 'country:ZAF', at: 0.2, until: 0.6}] : [],
      why: 'x',
    }))});
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: async (prompt: any) => (/review the map shots/.test(prompt.system) ? '{"scenes": []}' : reply)});
    const flat = result.draft.scenes.filter((scene: any) => !scene.primitive.globe);
    assert.ok(flat.length > 0 && flat.every((scene: any) => scene.primitive.projection === 'albers'), 'Lesotho would be Mercator, but the comparison forces Albers');
  });
});
