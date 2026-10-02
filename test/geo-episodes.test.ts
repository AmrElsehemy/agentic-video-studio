import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {geoPath} from 'd3-geo';
import {listManifests} from '../scripts/catalog.mjs';
import {primitiveSchema, type GeoMapPrimitive} from '../scripts/primitive-schema.mjs';
import {cameraAt, cameraKeys, continuesMap, episodeCameraKeys, lonSpan, MAP_SIZE, mercatorY, worldView, type BBox} from '../src/video/geo/camera';

// Every map scene in the catalog (and the golden fixture), run through the
// renderer's own camera maths: a view that collapses (the blank map a 0.5
// padding once produced) or a target shrunk to a speck fails here, before any render.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const entities = new Map<string, {bbox: BBox; frame?: BBox}>(read('public/geo/entities.json').map((entity: {id: string; bbox: BBox; frame?: BBox}) => [entity.id, entity]));
const disputed = new Map<string, object>(read('public/geo/disputed.geojson').features.map((feature: {id: string}) => [feature.id, feature]));

const boxOf = (target: string | {bbox: BBox}): BBox => {
  if (typeof target === 'object') return target.bbox;
  const entity = entities.get(target);
  if (entity) return entity.frame ?? entity.bbox;
  const [[west, south], [east, north]] = geoPath().bounds(disputed.get(target) as never);
  return [west, south, east, north];
};

const shots: {where: string; primitive: GeoMapPrimitive}[] = [
  ...listManifests().flatMap((file) => {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    return manifest.scenes
      .filter((scene: {primitive?: {kind: string}}) => scene.primitive?.kind === 'geo-map')
      .map((scene: {id: string; primitive: GeoMapPrimitive}) => ({where: `${manifest.id}/${scene.id}`, primitive: scene.primitive}));
  }),
  ...Object.entries(read('test/fixtures/geo-georgia-shots.json').shots).map(([name, shot]) => ({where: `fixture/${name}`, primitive: primitiveSchema.parse(shot) as GeoMapPrimitive})),
];

/** The smallest zoom any shot may reach: well below the world framing, which already shows every continent. */
const MIN_SCALE = worldView(0, MAP_SIZE, .1).scale * .4;
/**
 * A framed place must fill at least this share of the frame's width or height:
 * the most the schema's largest padding (0.4) leaves. EPSILON absorbs rounding
 * (1 - 2 × 0.4 is 0.19999999999999996 in floating point).
 */
const MIN_TARGET_SHARE = .2;
const EPSILON = 1e-9;

describe('map scenes in the catalog', () => {
  it('has map scenes to check', () => {
    assert.ok(shots.length >= 14, `found ${shots.length}`);
  });

  it('accepts a target framed with the largest padding the schema allows', () => {
    const keys = cameraKeys([{target: 'country:LSO', at: 0, padding: .4, ease: 'in-out'}], boxOf);
    const [west, south, east, north] = boxOf('country:LSO');
    const share = Math.max(lonSpan(west, east) * (Math.PI / 180) * keys[0].view.scale / MAP_SIZE.width, (mercatorY(north) - mercatorY(south)) * keys[0].view.scale / MAP_SIZE.height);
    assert.ok(share < MIN_TARGET_SHARE, 'the boundary case really is just under 0.2 in floating point');
    assert.ok(share >= MIN_TARGET_SHARE - EPSILON);
  });

  for (const {where, primitive} of shots) {
    it(`${where}: the camera never collapses and frames its targets`, () => {
      const keys = cameraKeys(primitive.camera, boxOf);
      for (let t = 0; t <= 1.0001; t += .02) {
        const view = cameraAt(keys, t);
        assert.ok(Number.isFinite(view.scale) && Number.isFinite(view.lon) && Number.isFinite(view.lat), `t=${t.toFixed(2)}: invalid view ${JSON.stringify(view)}`);
        assert.ok(view.scale >= MIN_SCALE, `t=${t.toFixed(2)}: zoomed out to scale ${view.scale.toFixed(1)} (min ${MIN_SCALE.toFixed(1)}); the map would be nearly empty`);
      }
      primitive.camera.forEach((key, index) => {
        if (key.target === 'world') return;
        const [west, south, east, north] = boxOf(key.target);
        const {scale} = keys[index].view;
        const width = lonSpan(west, east) * (Math.PI / 180) * scale / MAP_SIZE.width;
        const height = (mercatorY(north) - mercatorY(south)) * scale / MAP_SIZE.height;
        assert.ok(Math.max(width, height) >= MIN_TARGET_SHARE - EPSILON, `camera[${index}] frames its target at ${Math.round(Math.max(width, height) * 100)}% of the frame`);
      });
    });
  }
});

describe('continuous camera across map scenes (#85)', () => {
  const episodes = listManifests().map((file) => JSON.parse(fs.readFileSync(file, 'utf8'))).filter((manifest) => manifest.scenes.some((_: unknown, index: number) => continuesMap(manifest.scenes, index)));
  const same = (a: {lon: number; lat: number; scale: number}, b: typeof a) => Math.abs(a.lon - b.lon) < 1e-9 && Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.scale - b.scale) < 1e-6;

  it('has episodes with consecutive map scenes', () => {
    assert.ok(episodes.length >= 2, `found ${episodes.length}`);
  });

  for (const manifest of episodes) {
    it(`${manifest.id}: each scene starts where the previous one ended, and never collapses on the way`, () => {
      manifest.scenes.forEach((_: unknown, index: number) => {
        if (!continuesMap(manifest.scenes, index)) return;
        const end = cameraAt(episodeCameraKeys(manifest.scenes, index - 1, boxOf), 1);
        const keys = episodeCameraKeys(manifest.scenes, index, boxOf);
        assert.ok(same(cameraAt(keys, 0), end), `scene ${manifest.scenes[index].id} starts away from where ${manifest.scenes[index - 1].id} ended`);
        for (let t = 0; t <= 1.0001; t += .02) assert.ok(cameraAt(keys, t).scale >= MIN_SCALE, `scene ${manifest.scenes[index].id} collapses at t=${t.toFixed(2)}`);
      });
    });
  }

  it('starts fresh after a cut, and only between two map scenes', () => {
    const map = (target: string, cut?: boolean) => ({primitive: primitiveSchema.parse({kind: 'geo-map', camera: [{target, at: 0}], ...(cut ? {cut} : {})})});
    const scenes = [map('country:ZAF'), map('country:LSO'), map('country:ITA', true), {primitive: {kind: 'counter'}}, map('country:GEO')];
    assert.deepEqual(scenes.map((_, index) => continuesMap(scenes, index)), [false, true, false, false, false]);
    assert.ok(same(cameraAt(episodeCameraKeys(scenes, 1, boxOf), 0), cameraAt(episodeCameraKeys(scenes, 0, boxOf), 1)));
    assert.ok(same(cameraAt(episodeCameraKeys(scenes, 2, boxOf), 0), cameraAt(cameraKeys((scenes[2].primitive as GeoMapPrimitive).camera, boxOf), 0)));
  });
});
