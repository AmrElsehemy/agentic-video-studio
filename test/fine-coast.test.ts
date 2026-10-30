import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {FINE_COAST, buildTiles, clipRect, flatten, simplify, sliceRing} from '../scripts/lib/fine-coast.mjs';
import {readPolygons} from '../scripts/lib/shapefile.mjs';
import {usesFineCoast} from '../scripts/lib/camera-motion.mjs';
import {fineCoastRightsAsset} from '../scripts/lib/geo-primitives.mjs';
import {episodeDescription} from '../scripts/lib/description.mjs';
import {levelFor, tilesIn, viewBox} from '../src/video/geo/fineCoast';

describe('fine coast tiles', () => {
  it('simplify keeps the corners of a coast and drops the points on straight runs', () => {
    const line = [[0, 0], [1, 0.0001], [2, 0], [3, 0], [3, 3]];
    assert.deepEqual(simplify(line, 0.01), [[0, 0], [3, 0], [3, 3]]);
    assert.deepEqual(simplify([[0, 0], [1, 1]], 1), [[0, 0], [1, 1]]);
  });

  it('clip a ring to a box without leaving it', () => {
    const square = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    const clipped = clipRect(square, [0, 0, 2, 2]);
    assert.ok(clipped.length >= 4);
    for (const [x, y] of clipped) assert.ok(x >= 0 && x <= 2 && y >= 0 && y <= 2);
    assert.deepEqual(clipRect([[10, 10], [11, 10], [11, 11]], [0, 0, 2, 2]), []);
  });

  it('cut a ring that crosses a tile edge into overlapping pieces, one per tile', () => {
    const ring = [[3, 1], [8, 1], [8, 3], [3, 3]];
    const tiles = sliceRing(ring, {size: 5, margin: 0.03});
    assert.deepEqual([...tiles.keys()].sort(), ['0_0', '5_0']);
    const xs = (key: string) => tiles.get(key)!.flat().map(([x]) => x);
    assert.ok(Math.max(...xs('0_0')) <= 5.03 + 1e-9 && Math.min(...xs('5_0')) >= 4.97 - 1e-9, 'each piece reaches a little past its tile so no seam opens');
  });

  it('cut a ring that spans many tiles without recursing forever', () => {
    const ring = [[-60, -40], [60, -40], [60, 40], [-60, 40]];
    assert.equal(sliceRing(ring, {size: 5}).size, 24 * 16);
  });

  it('round and flatten a ring, dropping repeated points', () => {
    assert.deepEqual(flatten([[1.00004, 2.00004], [1.00001, 2.00002], [3, 4]], 3), [1, 2, 3, 4]);
  });

  it('build tiles from polygons', () => {
    const tiles = buildTiles([{rings: [[[1, 1], [4, 1], [4, 4], [1, 4], [1, 1]]]}], {tolerance: 0.001, decimals: 3});
    assert.deepEqual([...tiles.keys()], ['0_0']);
    assert.equal(tiles.get('0_0')![0].length, 8);
  });

  it('read a polygon shapefile', () => {
    const points = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
    const content = 44 + 4 + points.length * 16;
    const buffer = Buffer.alloc(100 + 8 + content);
    buffer.writeInt32BE(9994, 0);
    buffer.writeInt32LE(5, 32);
    buffer.writeInt32BE(content / 2, 100 + 4);
    const at = 108;
    buffer.writeInt32LE(5, at);
    [0, 0, 1, 1].forEach((value, index) => buffer.writeDoubleLE(value, at + 4 + index * 8));
    buffer.writeInt32LE(1, at + 36);
    buffer.writeInt32LE(points.length, at + 40);
    buffer.writeInt32LE(0, at + 44);
    points.forEach(([x, y], index) => { buffer.writeDoubleLE(x, at + 48 + index * 16); buffer.writeDoubleLE(y, at + 56 + index * 16); });
    const [polygon] = readPolygons(buffer);
    assert.deepEqual(polygon.rings[0], points);
    assert.deepEqual(polygon.bbox, [0, 0, 1, 1]);
    assert.throws(() => readPolygons(Buffer.alloc(100)), /Not a shapefile/);
  });
});

describe('fine coast in a shot', () => {
  const size = {width: 1010, height: 1375};

  it('picks the sharper resolution as the view narrows, and none for a wide one', () => {
    assert.equal(levelFor(40), undefined);
    assert.equal(levelFor(10), 'h');
    assert.equal(levelFor(2), 'f');
  });

  it('finds the tiles a view touches', () => {
    assert.deepEqual(tilesIn([54, 24, 58, 28]).sort(), ['50_20', '50_25', '55_20', '55_25']);
    const box = viewBox({lon: 56, lat: 26, scale: 6000}, size, 0);
    assert.ok(box[0] < 56 && box[2] > 56 && box[1] < 26 && box[3] > 26);
  });

  it('is used by an episode only when a flat map frames a close view', () => {
    const boxes = new Map([['place:a', [55, 25, 58, 28]], ['place:b', [-20, -30, 60, 40]]]);
    const scene = (target: unknown, extra = {}) => ({primitive: {kind: 'geo-map', camera: [{target, at: 0, padding: 0.1}], annotations: [], highlights: [], ...extra}});
    assert.equal(usesFineCoast([scene('place:a')], boxes), true);
    assert.equal(usesFineCoast([scene('place:b')], boxes), false);
    assert.equal(usesFineCoast([scene('place:a', {globe: true})], boxes), false);
    assert.equal(usesFineCoast([scene('world')], boxes), false);
  });
});

describe('fine coast credit', () => {
  it('names GSHHG and its licence', () => {
    const asset = fineCoastRightsAsset();
    assert.equal(asset.kind, 'map-data');
    assert.match(asset.notes, /GSHHG/);
    assert.equal(asset.sourceUrl, FINE_COAST.sourceUrl);
  });

  it('is printed in the description even where the show leaves other credits out', () => {
    const manifest = {title: 'T', rights: {nonAffiliationNotice: 'N', assets: [{kind: 'map-data', owner: 'Natural Earth v5.1.2', notes: 'Made with Natural Earth.'}, fineCoastRightsAsset()]}, scenes: [], sources: []};
    const text = episodeDescription(manifest as never, {publishing: {credits: false}} as never);
    assert.match(text, /GSHHG/);
    assert.doesNotMatch(text, /Made with Natural Earth/);
  });
});
