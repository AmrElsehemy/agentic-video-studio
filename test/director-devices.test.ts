import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {buildGeoDirectorPrompt, shotToPrimitive} from '../scripts/lib/geo-director.mjs';
import {seriesFromShot} from '../scripts/lib/series-shot.mjs';
import {loadGeoData} from '../scripts/lib/geo-primitives.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const geo = loadGeoData();
const entities = JSON.parse(fs.readFileSync(path.join(root, 'public/geo/entities.json'), 'utf8')) as {id: string; kind: string; name: string; bbox: number[]; label?: number[]}[];
const placeOf = (id: string) => entities.find((entity) => entity.id === id)!;
const places = new Map(['country:BRA', 'country:CHN', 'country:IND', 'city:shanghai-chn', 'city:urumqi-chn', 'city:singapore-sgp', 'city:mumbai-ind'].map((id) => [id, placeOf(id)]));
const research = (text: string, extra: object = {}) => ({claims: [{text}], places: {gulf: {lon: 51.5, lat: 26.5, name: 'Persian Gulf'}, 'ji-parana': {lon: -61.95, lat: -10.88, name: 'Ji-Paraná'}, elsewhere: {lon: 10, lat: 10, name: 'Elsewhere'}}, ...extra});
const context = (r = research('Nothing numeric.')) => ({places, research: r, satellite: geo.satellite, profiles: geo.profiles, series: geo.series}) as never;
const shot = (annotations: object[], extra: object = {}) => ({camera: [{target: 'country:BRA', at: 0}], highlights: [], annotations, ...extra});

describe('the director and satellite stills', () => {
  const sat = {type: 'satellite', set: 'rondonia', dates: ['2000-07-18', '2024-07-18'], mode: 'swipe'};

  it('turns a swipe between two dates on file into the primitive', () => {
    const primitive = shotToPrimitive(shot([{...sat, marks: [{anchor: {place: 'ji-parana'}, text: 'Ji-Paraná'}]}]), context());
    const annotation = primitive.annotations[0] as {type: string; mode: string; marks: {lon: number; lat: number; text: string}[]};
    assert.equal(annotation.type, 'satellite');
    assert.equal(annotation.mode, 'swipe');
    assert.deepEqual(annotation.marks[0], {lon: -61.95, lat: -10.88, text: 'Ji-Paraná'});
  });

  it('refuses a set that is not on file, a date it lacks, and a mark outside the picture', () => {
    assert.throws(() => shotToPrimitive(shot([{...sat, set: 'atlantis'}]), context()), /isn't a satellite set on file/);
    assert.throws(() => shotToPrimitive(shot([{...sat, dates: ['2000-07-18', '1999-01-01']}]), context()), /has no still for 1999-01-01/);
    assert.throws(() => shotToPrimitive(shot([{...sat, marks: [{anchor: {place: 'elsewhere'}, text: 'Elsewhere'}]}]), context()), /outside the satellite picture/);
    assert.throws(() => shotToPrimitive(shot([{...sat, dates: ['2000-07-18']}]), context()), /exactly two dates/);
  });

  it('keeps a satellite scene to the picture alone', () => {
    assert.throws(() => shotToPrimitive(shot([sat], {highlights: [{entity: 'country:BRA', style: 'fill', at: 0.2}]}), context()), /no highlights/);
  });
});

describe('the director and the other new devices', () => {
  it('draws a profile only from one on file, and keeps its panel to itself', () => {
    assert.equal((shotToPrimitive(shot([{type: 'profile', set: 'andes-crossing', text: 'OVER THE ANDES'}]), context()).annotations[0] as {set: string}).set, 'andes-crossing');
    assert.throws(() => shotToPrimitive(shot([{type: 'profile', set: 'nowhere'}]), context()), /isn't an elevation profile on file/);
  });

  it('draws arcs with values only when the research states them, all or none', () => {
    const stated = context(research('The Gulf sends 9 million barrels a day to China and 4.5 million to India.'));
    const ok = shotToPrimitive(shot([{type: 'flow', unit: 'mb/d', flows: [{from: {place: 'gulf'}, to: 'country:CHN', value: 9, text: 'China'}, {from: {place: 'gulf'}, to: 'country:IND', value: 4.5, text: 'India'}]}]), stated);
    assert.equal((ok.annotations[0] as {flows: {value?: number}[]}).flows[1].value, 4.5);
    assert.throws(() => shotToPrimitive(shot([{type: 'flow', flows: [{from: {place: 'gulf'}, to: 'country:CHN', value: 12}]}]), stated), /not a number in the research/);
    assert.throws(() => shotToPrimitive(shot([{type: 'flow', flows: [{from: {place: 'gulf'}, to: 'country:CHN', value: 9}, {from: {place: 'gulf'}, to: 'country:IND'}]}]), stated), /Either every arc has a value or none does/);
    assert.ok(shotToPrimitive(shot([{type: 'flow', flows: [{from: {place: 'gulf'}, to: 'country:CHN'}]}]), context()));
  });

  it('checks the places of a day and night scene', () => {
    const ok = shotToPrimitive(shot([{type: 'daynight', date: '2024-12-21', from: 16, to: 26, places: ['city:shanghai-chn', 'city:urumqi-chn']}]), context());
    assert.equal((ok.annotations[0] as {places: string[]}).places.length, 2);
    assert.throws(() => shotToPrimitive(shot([{type: 'daynight', date: '2024-12-21', from: 16, to: 26, places: ['city:atlantis']}]), context()), /isn't one of the episode's places/);
  });

  it('lets a ring count its reach, with the radius still a number the research states', () => {
    const stated = context(research('Singapore is within 3,000 km of many neighbours.'));
    const ok = shotToPrimitive(shot([{type: 'ring', center: 'city:singapore-sgp', radiusKm: 3000, reach: true}]), stated);
    assert.equal((ok.annotations[0] as {reach?: boolean}).reach, true);
    assert.throws(() => shotToPrimitive(shot([{type: 'ring', center: 'city:singapore-sgp', radiusKm: 4000, reach: true}]), stated), /radius 4000 km is not a number in the research/);
  });

  it('takes a population cartogram, and only a population one', () => {
    const table = geo.series;
    const placeId = (id: unknown) => String(id);
    assert.deepEqual(seriesFromShot({indicator: 'population', view: 'cartogram', from: 1960, to: 2023, top: 16, places: ['country:IND']}, {series: table, placeId}), {indicator: 'population', view: 'cartogram', places: ['country:IND'], from: 1960, to: 2023, top: 16});
    assert.throws(() => seriesFromShot({indicator: 'fertility', view: 'cartogram', from: 1960, to: 2020}, {series: table, placeId}), /use the "population" indicator/);
    assert.throws(() => seriesFromShot({indicator: 'population', view: 'cartogram', from: 1960, to: 2020, shade: true}, {series: table, placeId}), /takes no shade, mark or axis/);
    assert.throws(() => seriesFromShot({indicator: 'population', view: 'cartogram', from: 1960, to: 2020, top: 3}, {series: table, placeId}), /from 6 to 30/);
    assert.throws(() => seriesFromShot({indicator: 'population', view: 'race', from: 1960, to: 2020, top: 10}, {series: table, placeId}), /belongs to a cartogram/);
  });
});

describe('the director prompt', () => {
  const draft = {show: {name: 'Geographica'}, scenes: [{id: 'hook', narration: 'x', headline: 'x', caption: 'x'}]};
  const system = buildGeoDirectorPrompt({draft, research: research('Nothing.'), places, datasets: new Map(), satellite: geo.satellite, profiles: geo.profiles, series: geo.series} as never).system;

  it('lists the satellite sets and profiles on file, with their dates and lengths', () => {
    assert.match(system, /rondonia \(Rondônia, Brazil; dates on file: 2000-07-18 modis-terra, 2024-07-18 modis-terra/);
    assert.match(system, /andes-crossing \(896 km long/);
  });

  it('teaches each new device with its honesty rule', () => {
    assert.match(system, /"satellite" annotation fills the whole map panel/);
    assert.match(system, /never state a cause or a figure it cannot back/);
    assert.match(system, /the height is stretched/);
    assert.match(system, /"view": "cartogram"/);
    assert.match(system, /not a time-zone map|never describe it as a time-zone map/);
    assert.match(system, /EVERY arc has a "value"/);
    assert.match(system, /never "N countries"/);
  });

  it('says there are none when none are on file', () => {
    const bare = buildGeoDirectorPrompt({draft, research: research('Nothing.'), places, datasets: new Map(), satellite: {}, profiles: undefined} as never).system;
    assert.match(bare, /Use ONLY a set on file and ONLY its dates: none/);
    assert.match(bare, /Profiles on file: none/);
  });
});
