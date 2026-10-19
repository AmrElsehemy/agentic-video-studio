import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {LAYERS, chooseZoom, fractionIn as nodeFraction, tilePlan, tileUrl, worldPixel} from '../scripts/lib/satellite.mjs';
import {featureTags} from '../scripts/lib/feature-tags.mjs';
import {mapVariety} from '../scripts/lib/map-variety.mjs';
import {satelliteProblems, satelliteRightsAsset} from '../scripts/lib/geo-primitives.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {fractionIn, stampOf} from '../src/video/geo/satellite';

const camera = [{target: 'world', at: 0, padding: 0.1, ease: 'in-out'}];
const shot = (annotation: object, extra: object = {}) => ({kind: 'geo-map', camera, highlights: [], annotations: [annotation], dataset: 'natural-earth', ...extra});
const sat = {type: 'satellite', set: 'rondonia', dates: ['2000-07-18', '2024-07-18']};
const set = {bbox: [-63.4, -11.6, -61.4, -9.0], dates: {'2000-07-18': {title: 'MODIS Terra true colour (250 m)'}, '2024-07-18': {title: 'MODIS Terra true colour (250 m)'}}};

describe('satellite stills: tiles and georeferencing', () => {
  it('plan the tiles that cover a box, with the crop inside their mosaic', () => {
    const plan = tilePlan([-63.4, -11.6, -61.4, -9.0], 9);
    assert.ok(plan.columns.length >= 3 && plan.rows.length >= 4);
    assert.ok(plan.crop.x >= 0 && plan.crop.x < 256 && plan.crop.y >= 0 && plan.crop.y < 256);
    const a = worldPixel(-63.4, -9.0, 9);
    const b = worldPixel(-61.4, -11.6, 9);
    assert.equal(plan.crop.width, Math.round(b.x - a.x));
    assert.equal(plan.crop.height, Math.round(b.y - a.y));
  });

  it('choose the finest zoom the image size and the layer allow', () => {
    const zoom = chooseZoom([-63.4, -11.6, -61.4, -9.0], LAYERS['modis-terra']);
    assert.equal(zoom, 9);
    assert.ok(chooseZoom([-10, 30, 40, 60], LAYERS['modis-terra']) < 9);
    assert.ok(chooseZoom([54.9, 24.85, 55.5, 25.45], LAYERS['landsat-annual']) <= 12);
  });

  it('build the tile address, leaving the date out of undated layers', () => {
    assert.match(tileUrl(LAYERS['modis-terra'], '2000-07-18', 9, 10, 20), /MODIS_Terra_CorrectedReflectance_TrueColor\/default\/2000-07-18\/GoogleMapsCompatible_Level9\/9\/20\/10\.jpeg$/);
    assert.doesNotMatch(tileUrl(LAYERS['blue-marble'], 'static', 5, 1, 2), /static/);
  });

  it('place a lon/lat by the Mercator scale, the same in the renderer and the fetcher', () => {
    const bbox: [number, number, number, number] = [-63.4, -11.6, -61.4, -9.0];
    const centre = fractionIn(bbox, -62.4, -10.3);
    assert.ok(Math.abs(centre.x - 0.5) < 1e-9);
    assert.ok(Math.abs(centre.y - 0.5) < 0.01);
    assert.deepEqual(fractionIn(bbox, -63.4, -9.0), {x: 0, y: 0});
    assert.deepEqual(nodeFraction(bbox, -61.4, -11.6), {x: 1, y: 1});
    const far = [10, 50, 20, 60] as [number, number, number, number];
    const middleLat = fractionIn(far, 15, 55).y;
    assert.ok(middleLat > 0.5, 'Mercator stretches towards the pole, so the middle latitude sits below the middle of the picture');
  });

  it('print an annual layer as a year and a daily one as month and year', () => {
    assert.equal(stampOf('1990-12-01', true), '1990');
    assert.equal(stampOf('2024-07-18', false), 'JUL 2024');
    assert.equal(stampOf('static', false), '');
  });
});

describe('satellite scenes', () => {
  it('accept a fade, a swipe between two dates, and marks', () => {
    assert.ok(primitiveSchema.safeParse(shot({...sat, mode: 'fade'})).success);
    assert.ok(primitiveSchema.safeParse(shot({...sat, mode: 'swipe', marks: [{lon: -62.4, lat: -10.3, text: 'Forest remnant'}]})).success);
    const parsed = primitiveSchema.parse(shot(sat)) as {annotations: {mode: string; marks: unknown[]}[]};
    assert.equal(parsed.annotations[0].mode, 'fade');
    assert.deepEqual(parsed.annotations[0].marks, []);
  });

  it('refuse a swipe of anything but two dates, a long mark and other layers on the picture', () => {
    assert.equal(primitiveSchema.safeParse(shot({...sat, dates: ['2000-07-18'], mode: 'swipe'})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({...sat, dates: ['2000-07-18', '2010-07-18', '2024-07-18', '2025-07-18']})).success, false);
    assert.equal(primitiveSchema.safeParse(shot({...sat, marks: [{lon: 0, lat: 0, text: 'A mark that is far too long to read on a phone'}]})).success, false);
    assert.equal(primitiveSchema.safeParse({...shot(sat), annotations: [sat, {type: 'label', anchor: 'country:BRA', text: 'BRAZIL', at: 0.2}]}).success, false);
    assert.equal(primitiveSchema.safeParse(shot(sat, {highlights: [{entity: 'country:BRA', style: 'fill', at: 0.2}]})).success, false);
    assert.equal(primitiveSchema.safeParse(shot(sat, {globe: true})).success, false);
  });

  it('need the set and each date on file, and every mark inside the picture', () => {
    const primitive = (annotation: object) => ({annotations: [annotation]});
    assert.deepEqual(satelliteProblems(primitive({...sat, marks: []}) as never, {satellite: {rondonia: set}} as never), []);
    assert.match(satelliteProblems(primitive({...sat, marks: []}) as never, {satellite: {}} as never)[0], /no satellite set "rondonia"/);
    assert.match(satelliteProblems(primitive({...sat, marks: [], dates: ['2000-07-18', '1999-01-01']}) as never, {satellite: {rondonia: set}} as never)[0], /no still for 1999-01-01/);
    assert.match(satelliteProblems(primitive({...sat, marks: [{lon: 10, lat: 10, text: 'Elsewhere'}]}) as never, {satellite: {rondonia: set}} as never)[0], /outside the satellite picture/);
  });

  it('tag the episode and credit NASA with the layers and dates', () => {
    const manifest = {scenes: [{primitive: shot({...sat, mode: 'swipe'}), shot: 'map'}, {primitive: shot(sat), shot: 'map'}]};
    const tags = featureTags(manifest as never);
    assert.ok(tags.includes('satellite') && tags.includes('satellite-swipe'));
    const asset = satelliteRightsAsset('rondonia', set, ['2000-07-18', '2024-07-18']);
    assert.equal(asset.kind, 'photo');
    assert.match(asset.notes, /NASA EOSDIS Global Imagery Browse Services \(MODIS Terra true colour \(250 m\)\), 2000-07-18, 2024-07-18/);
  });

  it('count two satellite scenes of one set and dates as one view', () => {
    const scene = (id: string, annotation: object) => ({id, primitive: shot(annotation)});
    const same = mapVariety({scenes: [scene('a', sat), scene('b', sat), scene('c', sat), scene('d', {...sat, dates: ['2000-07-18']})]} as never);
    assert.equal(same.distinct, 2);
  });
});
