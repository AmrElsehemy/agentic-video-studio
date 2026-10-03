import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {geoMercator} from 'd3-geo';
import {primitiveSchema, type GeoMapPrimitive} from '../scripts/primitive-schema.mjs';
import {resolveResearchPlaces, shotToPrimitive} from '../scripts/lib/geo-director.mjs';
import {loadGeoData} from '../scripts/lib/geo-primitives.mjs';
import {mercatorY as buildMercatorY, RELIEF, reliefRows} from '../scripts/lib/geo-relief.mjs';
import {MAP_SIZE, type View} from '../src/video/geo/camera';
import {MAX_RELIEF_PIXELS, reliefPlacements, type ReliefManifest} from '../src/video/geo/relief';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const manifest: ReliefManifest = read('public/geo/relief/manifest.json');
const projectionFor = (view: View) => geoMercator().rotate([-view.lon, 0]).center([0, view.lat]).scale(view.scale).translate([MAP_SIZE.width / 2, MAP_SIZE.height / 2]);

describe('relief (#91): the pinned images', () => {
  it('has every configured image, at its configured box', () => {
    for (const image of RELIEF.images) {
      assert.deepEqual(manifest.images[image.id]?.bbox, image.bbox, image.id);
      assert.ok(fs.existsSync(path.join(root, 'public/geo/relief', manifest.images[image.id].file)));
    }
  });

  it('reprojects rows to Mercator and turns flat ground neutral', () => {
    // A 4-row plate-carrée source from 60°N to 0°: flat everywhere except one bright row at 15°N-0°.
    const [width, height, north, south] = [2, 4, 60, 0];
    const source = Buffer.from([206, 206, 206, 206, 206, 206, 255, 255]);
    const {pixels, outHeight} = reliefRows(source, {width, height, south, north, flat: 206, gain: 1.6});
    assert.equal(outHeight, Math.round((buildMercatorY(north) - buildMercatorY(south)) / (15 * Math.PI / 180)));
    assert.equal(pixels[0], 128, 'flat ground is neutral grey');
    // The bright row (255) is lifted around neutral: 128 + 49 × 1.6 ≈ 206 (the last row blends a little with the one above).
    assert.ok(Math.abs(pixels[pixels.length - 1] - 206) <= 3, `bottom row ${pixels[pixels.length - 1]}`);
    // Mercator stretches high latitudes, so the image is taller than the plate-carrée source.
    assert.ok(outHeight > height);
  });
});

describe('relief: placement matches the map projection', () => {
  const views: View[] = [
    {lon: 28.2, lat: -29.6, scale: 9000},     // Lesotho close-up
    {lon: 25, lat: -28, scale: 2400},         // southern Africa
    {lon: 44, lat: 42, scale: 3000},          // the Caucasus
    {lon: 178, lat: -17, scale: 600},         // across the antimeridian
  ];
  for (const view of views) {
    it(`puts each image's corners where the projection puts them (${view.lon}, ${view.lat}, ×${view.scale})`, () => {
      const projection = projectionFor(view);
      const placements = reliefPlacements(manifest, view);
      assert.ok(placements.length > 0, 'something is drawn');
      for (const placement of placements) {
        const image = Object.values(manifest.images).find((item) => item.file === placement.file)!;
        const [west, south, east, north] = image.bbox;
        const turn = Number(placement.key.split(':')[1]);
        // d3 wraps longitudes into ±180 around the view centre; compare where the corner isn't wrapped.
        const [x0, y0] = projection([west + 360 * turn, north])!;
        const [, y1] = projection([east + 360 * turn, south])!;
        assert.ok(Math.abs(placement.top - y0) < 1e-6 && Math.abs(placement.top + placement.height - y1) < 1e-6, 'top and bottom edges');
        if (Math.abs(west + 360 * turn - view.lon) < 180) assert.ok(Math.abs(placement.left - x0) < 1e-6, 'left edge');
      }
    });
  }

  it('draws the finer images on top and skips any enlarged past use', () => {
    const close = reliefPlacements(manifest, {lon: 28.2, lat: -29.6, scale: 9000});
    assert.deepEqual(close.map((placement) => placement.file), ['southern-africa.jpg'], 'the world image would be over 32,768 px wide here');
    assert.ok(close.every((placement) => placement.width <= MAX_RELIEF_PIXELS));
    const wide = reliefPlacements(manifest, {lon: 25, lat: -28, scale: 2400});
    assert.deepEqual(wide.map((placement) => placement.file), ['world.jpg', 'southern-africa.jpg']);
  });
});

describe('relief: schema and director', () => {
  it('is an optional switch on a map shot', () => {
    assert.equal((primitiveSchema.parse({kind: 'geo-map', camera: [{target: 'world', at: 0}], relief: true}) as GeoMapPrimitive).relief, true);
    assert.equal(primitiveSchema.safeParse({kind: 'geo-map', camera: [{target: 'world', at: 0}], relief: 'yes'}).success, false);
  });

  it('passes the director’s relief choice through', () => {
    const geo = loadGeoData(root);
    const research = read('research/geographica/lesotho-enclave.json');
    const {places} = resolveResearchPlaces(research, geo);
    assert.equal(shotToPrimitive({camera: [{target: 'country:LSO', at: 0}], relief: true}, {places, research}).relief, true);
    assert.equal(shotToPrimitive({camera: [{target: 'country:LSO', at: 0}]}, {places, research}).relief, undefined);
  });
});
