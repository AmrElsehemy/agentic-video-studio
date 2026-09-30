import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {cameraAt, fitView, inverseMercatorY, lonSpan, mercatorY, mixViews, worldView, type View} from '../src/video/geo/camera';

const SIZE = {width: 1010, height: 1375};
const near = (actual: number, expected: number, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);

describe('GeoMotion camera', () => {
  it('round-trips Mercator latitude', () => {
    for (const lat of [-60, -12.3, 0, 41.7, 80]) near(inverseMercatorY(mercatorY(lat)), lat);
  });

  it('fits a box inside the frame with its padding, limited by the tighter side', () => {
    const view = fitView([39.978, 41.07, 46.673, 43.57], SIZE, .15);
    near(view.lon, (39.978 + 46.673) / 2);
    const widthPx = lonSpan(39.978, 46.673) * (Math.PI / 180) * view.scale;
    const heightPx = (mercatorY(43.57) - mercatorY(41.07)) * view.scale;
    near(widthPx, SIZE.width * .7, 1e-6);
    assert.ok(heightPx < SIZE.height * .7, 'Georgia is wider than tall, so width decides');
  });

  it('centres boxes that cross the antimeridian on the date line side', () => {
    const fiji = fitView([174.587, -21.706, -178.251, -12.477], SIZE);
    near(fiji.lon, 178.168);
    assert.ok(Math.abs(fiji.lon) > 170);
  });

  it('frames the world by height for a tall frame, centred on where the camera is going', () => {
    const view = worldView(44, SIZE);
    near(view.lon, 44);
    assert.ok(view.scale > SIZE.width / (2 * Math.PI), 'bigger than squeezing all 360° into the width');
  });

  it('moves the short way round the globe and zooms geometrically', () => {
    const a: View = {lon: 170, lat: 0, scale: 100};
    const b: View = {lon: -170, lat: 0, scale: 10000};
    const mid = mixViews(a, b, .5);
    near(Math.abs(mid.lon), 180);
    near(mid.scale, 1000);
  });

  it('holds before the first key and after the last, and eases between', () => {
    const keys = [
      {view: {lon: 0, lat: 0, scale: 100}, at: .2, ease: 'in-out' as const},
      {view: {lon: 40, lat: 0, scale: 100}, at: .6, ease: 'in-out' as const},
    ];
    assert.deepEqual(cameraAt(keys, 0), keys[0].view);
    assert.deepEqual(cameraAt(keys, 1), keys[1].view);
    near(cameraAt(keys, .4).lon, 20);
    assert.ok(cameraAt(keys, .25).lon < 40 * (.05 / .4), 'in-out starts slowly');
    near(cameraAt([keys[0], {...keys[1], ease: 'linear'}], .25).lon, 5);
  });
});
