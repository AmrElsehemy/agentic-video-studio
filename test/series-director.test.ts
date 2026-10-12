import assert from 'node:assert/strict';
import fs from 'node:fs';
import {describe, it} from 'node:test';
import {shotToPrimitive, buildGeoDirectorPrompt} from '../scripts/lib/geo-director.mjs';
import {extremeYear, seriesDigest} from '../scripts/lib/series-shot.mjs';

const series = JSON.parse(fs.readFileSync('public/geo/series.json', 'utf8'));
const box = [60, 5, 150, 55];
const places = new Map([
  ['country:CHN', {id: 'country:CHN', kind: 'country', name: 'China', bbox: box}],
  ['country:IND', {id: 'country:IND', kind: 'country', name: 'India', bbox: box}],
  ['river:yangtze', {id: 'river:yangtze', kind: 'river', name: 'Yangtze', bbox: box}],
]);
const shot = (extra: object) => ({camera: [{target: 'country:CHN', at: 0}], highlights: [], annotations: [], ...extra});
const run = (s: object, extra: object = {}) => shotToPrimitive(shot({series: s, ...extra}), {places, research: {claims: [], places: {}}, series} as never);

describe('the director draws charts over time', () => {
  it('turns a choice of indicator, countries and years into the primitive', () => {
    const primitive = run({indicator: 'population', view: 'line', from: 1960, to: 2024, places: ['country:CHN', 'country:IND']});
    assert.deepEqual(primitive.series, {indicator: 'population', view: 'line', places: ['country:CHN', 'country:IND'], from: 1960, to: 2024, at: 0.04, axis: 'zero'});
  });

  it('derives a marked year\'s caption, and checks a peak against the data', () => {
    const peak = extremeYear(series.indicators.population, 'CHN', 2005, 2024, 'peak')!;
    const primitive = run({indicator: 'population', view: 'line', from: 2005, to: 2024, places: ['country:CHN'], axis: 'fit', mark: {year: peak, kind: 'peak'}});
    assert.equal(primitive.series?.mark?.text, `PEAK ${peak}`);
    assert.throws(() => run({indicator: 'population', view: 'line', from: 2005, to: 2024, places: ['country:CHN'], mark: {year: 2010, kind: 'peak'}}), /is not 2010|not 2010/);
    assert.equal(run({indicator: 'population', view: 'line', from: 2005, to: 2024, places: ['country:CHN'], mark: {year: 2010, kind: 'year'}}).series?.mark?.text, '2010');
  });

  it('zooms the axis only to show a verified peak or low', () => {
    const peak = extremeYear(series.indicators.population, 'CHN', 2005, 2024, 'peak')!;
    const base = {indicator: 'population', view: 'line', from: 2005, to: 2024, places: ['country:CHN'], axis: 'fit'};
    assert.equal(run({...base, mark: {year: peak, kind: 'peak'}}).series?.axis, 'fit');
    assert.equal(run(base).series?.axis, 'zero');
    assert.equal(run({...base, mark: {year: 2010, kind: 'year'}}).series?.axis, 'zero');
  });

  it('rejects what the table cannot back', () => {
    assert.throws(() => run({indicator: 'happiness', view: 'line', from: 1960, to: 2000, places: ['country:CHN']}), /isn't an indicator/);
    assert.throws(() => run({indicator: 'population', view: 'line', from: 1960, to: 2000, places: ['river:yangtze']}), /isn't a country/);
    assert.throws(() => run({indicator: 'population', view: 'line', from: 1960, to: 2000, places: ['country:XXX']}), /isn't one of the episode's places/);
    assert.throws(() => run({indicator: 'population', view: 'line', from: 1960, to: 2000, places: []}), /1 to 4 countries/);
    assert.throws(() => run({indicator: 'population', view: 'race', from: 1960, to: 2000, mark: {year: 1980, kind: 'year'}}), /belongs to a line chart/);
    assert.throws(() => run({indicator: 'population', view: 'line', from: 1960, to: 2000, places: ['country:CHN']}, {globe: true}), /cannot also be a globe/);
  });

  it('tells the model which years and figures exist', () => {
    const digest = seriesDigest(series, places);
    assert.match(digest, /population.*years 1960-/);
    assert.match(digest, /country:CHN: 1960 667M/);
    assert.match(digest, /highest 2021/);
    const prompt = buildGeoDirectorPrompt({draft: {title: 't', scenes: []}, research: {claims: [], places: {}}, places, datasets: new Map(), series} as never);
    assert.match(prompt.messages[0].content as string, /Yearly figures \(World Bank\)/);
    assert.match(prompt.system, /"series" draws a chart over time/);
  });
});

describe('shaded maps and big numbers', () => {
  it('shades only by a rate, never a population', () => {
    assert.equal(run({indicator: 'life-expectancy', view: 'line', from: 1960, to: 2020, places: ['country:CHN'], shade: true}).series?.shade, true);
    assert.throws(() => run({indicator: 'population', view: 'line', from: 1960, to: 2020, places: ['country:CHN'], shade: true}), /cannot shade the map/);
  });

  it('rolls up a number only when the research states it', () => {
    const research = {claims: [{text: 'Bir Tawil covers 2,060 square kilometres.'}], places: {}};
    const figure = {value: 2060, unit: 'km2', text: 'AREA'};
    const primitive = shotToPrimitive(shot({figure}), {places, research, series} as never);
    assert.deepEqual(primitive.figure, {value: 2060, unit: 'km2', text: 'AREA', decimals: 0, at: 0.3});
    assert.throws(() => shotToPrimitive(shot({figure: {...figure, value: 2061}}), {places, research, series} as never), /not a number in the research/);
    assert.throws(() => shotToPrimitive(shot({figure, series: {indicator: 'population', view: 'line', from: 1960, to: 2000, places: ['country:CHN']}}), {places, research, series} as never), /cannot share a scene/);
  });
});
