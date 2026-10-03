import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {geoDistance} from 'd3-geo';
import {primitiveSchema, routeUntil, type GeoMapPrimitive} from '../scripts/primitive-schema.mjs';
import {resolveResearchPlaces, shotToPrimitive} from '../scripts/lib/geo-director.mjs';
import {geoProblems, loadGeoData} from '../scripts/lib/geo-primitives.mjs';
import {cameraAt, cameraKeys, type BBox} from '../src/video/geo/camera';
import {FOLLOW_OUT, followView, followWeight, partialRoute, routeLine, routeProgress, type LonLat} from '../src/video/geo/route';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const geo = loadGeoData(root);
const {shots} = read('test/fixtures/geo-georgia-shots.json');
const label = (id: string) => geo.entities.get(id)!.label as LonLat;

const XIAN: LonLat = [108.94, 34.34];
const SAMARKAND: LonLat = [66.96, 39.65];
const CONSTANTINOPLE: LonLat = [28.98, 41.01];

describe('routes (#90): geometry', () => {
  it('follows great circles through every stop, with distances that only grow', () => {
    const line = routeLine([XIAN, SAMARKAND, CONSTANTINOPLE]);
    assert.deepEqual(line.points[0], XIAN);
    assert.deepEqual(line.points.at(-1), CONSTANTINOPLE);
    assert.equal(line.stops.length, 3);
    assert.deepEqual(line.stops.map((at) => line.points[at]), [XIAN, SAMARKAND, CONSTANTINOPLE]);
    line.distances.forEach((distance, index) => index && assert.ok(distance > line.distances[index - 1]));
    const legs = geoDistance(XIAN, SAMARKAND) + geoDistance(SAMARKAND, CONSTANTINOPLE);
    assert.ok(Math.abs(line.distances.at(-1)! - legs) < 1e-9, 'the length is the sum of the great-circle legs');
    // The great circle bows towards the pole: mid-leg it runs about 2° north of the ends' average (38.9° vs 37.0°).
    const middle = partialRoute(routeLine([XIAN, SAMARKAND]), .5).head;
    assert.ok(middle[1] > (XIAN[1] + SAMARKAND[1]) / 2 + 1, `midpoint latitude ${middle[1].toFixed(2)}`);
  });

  it('crosses the antimeridian the short way (Fiji to Samoa)', () => {
    const [fiji, samoa] = [label('country:FJI'), label('country:WSM')];
    const line = routeLine([fiji, samoa]);
    assert.ok(line.distances.at(-1)! < .2, `about 1,100 km, not around the world (${line.distances.at(-1)!.toFixed(3)} rad)`);
    assert.ok(line.points.some(([lon]) => lon > 170) && line.points.some(([lon]) => lon < -170), 'samples lie on both sides of 180°');
    line.points.forEach((point, index) => index && assert.ok(geoDistance(line.points[index - 1], point) < .02, 'no sample jumps the long way round'));
  });

  it('draws from the first stop to the last as progress goes 0 → 1', () => {
    const line = routeLine([XIAN, SAMARKAND, CONSTANTINOPLE]);
    assert.deepEqual(partialRoute(line, 0).head, XIAN);
    const end = partialRoute(line, 1).head;
    assert.ok(geoDistance(end, CONSTANTINOPLE) < 1e-9);
    let travelled = -1;
    for (let progress = 0; progress <= 1; progress += .05) {
      const {head} = partialRoute(line, progress);
      const along = geoDistance(XIAN, head);
      assert.ok(progress < .45 ? along >= travelled - 1e-9 : true);
      travelled = along;
    }
    assert.equal(routeProgress(.1, .2, .8), 0);
    assert.equal(routeProgress(.9, .2, .8), 1);
  });
});

describe('routes: the follow camera', () => {
  it('eases on, holds, and is fully handed back before the scene ends', () => {
    for (const [at, until] of [[.2, .8], [.1, .15], [.5, .85]]) {
      assert.equal(followWeight(at, at, until), 0);
      assert.equal(followWeight(1, at, until), 0, `weight is 0 by the end for until ${until}`);
      assert.equal(followWeight(Math.min(1, until + FOLLOW_OUT), at, until), 0);
      let previous = 0;
      for (let t = 0; t <= 1.0001; t += .002) {
        const weight = followWeight(t, at, until);
        assert.ok(Math.abs(weight - previous) < .03, `no jump at t=${t.toFixed(3)} (at ${at}, until ${until})`);
        previous = weight;
      }
    }
    assert.equal(followWeight(.5, .2, .8), 1);
  });

  it('ends the scene exactly on its keyframes, so the next scene continues without a jump', () => {
    const primitive = primitiveSchema.parse(shots['silk-road']) as GeoMapPrimitive;
    const route = primitive.annotations.find((annotation) => annotation.type === 'route' && annotation.follow)!;
    assert.ok(route.type === 'route');
    const keys = cameraKeys(primitive.camera, (target) => (typeof target === 'object' ? target.bbox : geo.entities.get(target)!.bbox) as BBox);
    const line = routeLine(route.path.map((stop) => (typeof stop === 'string' ? label(stop) : [stop.lon, stop.lat])));
    const viewAt = (t: number) => followView(cameraAt(keys, t), partialRoute(line, routeProgress(t, route.at, routeUntil(route))).head, followWeight(t, route.at, routeUntil(route)));
    assert.deepEqual(viewAt(1), cameraAt(keys, 1));
    // Mid-route the marker is at the centre of the frame.
    const head = partialRoute(line, routeProgress(.5, route.at, routeUntil(route))).head;
    const middle = viewAt(.5);
    assert.ok(Math.abs(middle.lon - head[0]) < 1e-6 && Math.abs(middle.lat - head[1]) < 1e-6);
  });
});

describe('routes: schema, places and the director', () => {
  const route = {type: 'route', path: ['country:FJI', 'country:WSM'], at: .2};
  const shot = (annotation: object) => ({kind: 'geo-map', camera: [{target: 'world', at: 0}], annotations: [annotation]});

  it('accepts a route and rejects one that ends before it starts or follows too late', () => {
    assert.ok(primitiveSchema.safeParse(shot(route)).success);
    assert.match(JSON.stringify(primitiveSchema.safeParse(shot({...route, until: .1})).error?.issues), /finish after it starts/);
    assert.match(JSON.stringify(primitiveSchema.safeParse(shot({...route, follow: true, until: .95})).error?.issues), /must finish by 0.85/);
    assert.match(JSON.stringify(primitiveSchema.safeParse({...shot(route), annotations: [{...route, follow: true, until: .6}, {...route, follow: true, until: .6}]}).error?.issues), /Only one route/);
    assert.equal(primitiveSchema.safeParse(shot({...route, path: ['country:FJI']})).success, false);
  });

  it('checks every stop against the map data', () => {
    const primitive = primitiveSchema.parse(shot({...route, path: ['country:FJI', 'country:SAMOA']})) as GeoMapPrimitive;
    assert.match(geoProblems(primitive, geo).join('\n'), /annotations\[0\]\.path\[1\]: unknown geo entity "country:SAMOA"/);
  });

  it('lets the director route only between the episode’s places and named points', () => {
    const research = read('research/geographica/georgia-wine.json');
    const {places} = resolveResearchPlaces(research, geo);
    const make = (annotation: object) => shotToPrimitive({camera: [{target: 'country:GEO', at: 0}], annotations: [annotation]}, {places, research});
    const primitive = make({type: 'route', path: [{place: 'tbilisi'}, 'country:GEO'], at: .2, text: 'THE WINE ROAD'});
    const [annotation] = primitive.annotations;
    assert.ok(annotation.type === 'route' && typeof annotation.path[0] === 'object' && annotation.path[1] === 'country:GEO');
    assert.throws(() => make({type: 'route', path: [{place: 'tbilisi'}, 'country:FRA'], at: .2}), /path\[1\]: "country:FRA" isn't one of the episode's places/);
    assert.throws(() => make({type: 'route', path: [{place: 'tbilisi'}, {place: 'dig-sites-approx'}], at: .2, text: 'TO THE DIG'}), /approximate point "dig-sites-approx"/);
    assert.doesNotThrow(() => make({type: 'route', path: [{place: 'tbilisi'}, {place: 'dig-sites-approx'}], at: .2, text: 'TO THE DIG (APPROX.)'}));
  });
});
