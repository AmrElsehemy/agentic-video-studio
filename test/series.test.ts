import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {lastCompleteYear, niceCeiling, niceRange, pivot, raceAt, raceCandidates, valueAt} from '../scripts/lib/series.mjs';
import {seriesProblems, seriesRightsAsset} from '../scripts/lib/geo-primitives.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {formatFigure, yearAt} from '../src/video/geo/SeriesChart';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = (code: string, values: (number | null)[], first = 2000) => values.map((value, index) => ({countryiso3code: code, date: String(first + index), value}));

describe('the yearly table', () => {
  it('keeps only the countries we draw, only the years asked for, and leaves a gap as null', () => {
    const table = pivot([...rows('AAA', [1, null, 3]), ...rows('WLD', [9, 9, 9]), ...rows('BBB', [null, null, null])], {iso3: ['AAA', 'BBB'], firstYear: 2000, lastYear: 2002});
    assert.deepEqual(table.years, [2000, 2001, 2002]);
    assert.deepEqual(Object.keys(table.countries), ['AAA']);
    assert.deepEqual(table.countries.AAA, [1, null, 3]);
  });

  it('finds the last year most countries have a figure for', () => {
    const table = {years: [2000, 2001, 2002], countries: {A: [1, 2, null], B: [1, 2, null], C: [1, 2, 3], D: [1, 2, null], E: [1, 2, null]}};
    assert.equal(lastCompleteYear(table), 2001);
  });

  it('reads a value between two years in a straight line, and null outside what a country has', () => {
    const table = {years: [2000, 2001, 2002], countries: {A: [10, 20, null]}};
    assert.equal(valueAt(table, 'A', 2000.5), 15);
    assert.equal(valueAt(table, 'A', 2001.5), null);
    assert.equal(valueAt(table, 'A', 1999), null);
    assert.equal(valueAt(table, 'Z', 2000), null);
  });

  it('rounds an axis up to a tidy number', () => {
    assert.equal(niceCeiling(84), 100);
    assert.equal(niceCeiling(1.45e9), 2e9);
    assert.equal(niceCeiling(7.2), 10);
    assert.equal(niceCeiling(2.4), 2.5);
  });
});

describe('a zoomed axis', () => {
  it('fits tidy bounds around the data, at whole steps', () => {
    assert.deepEqual(niceRange(1.26e9, 1.4124e9), {low: 1.25e9, high: 1.45e9, step: 5e7});
    assert.deepEqual(niceRange(3, 3), {low: 3, high: 4, step: 1});
  });
});

describe('a ranked race', () => {
  const table = {years: [2000, 2001], countries: {A: [10, 30], B: [20, 20], C: [5, 5], D: [1, 1]}};
  it('is told only about countries that are ever near the top', () => {
    assert.deepEqual(raceCandidates(table, 2000, 2001, 1), ['A', 'B']);
  });
  it('glides a country between its ranks at the years either side', () => {
    const start = raceAt(table, ['A', 'B', 'C'], 2000);
    assert.deepEqual(start.map((row) => [row.code, row.rank]), [['B', 0], ['A', 1], ['C', 2]]);
    const middle = raceAt(table, ['A', 'B', 'C'], 2000.5);
    assert.equal(middle.find((row) => row.code === 'A')?.rank, 0.5);
    assert.equal(middle.find((row) => row.code === 'A')?.value, 20);
    const end = raceAt(table, ['A', 'B', 'C'], 2001);
    assert.equal(end[0].code, 'A');
  });
});

describe('what the chart prints', () => {
  it('writes big counts compactly and money with a dollar sign', () => {
    assert.equal(formatFigure('population', 1450935791, 0), '1.45B');
    assert.equal(formatFigure('population', 809590000, 0), '810M');
    assert.equal(formatFigure('gdp-per-person', 137781.7, 0), '$138K');
    assert.equal(formatFigure('life-expectancy', 84.04, 1), '84.0');
  });
  it('runs the year from the start to the end and holds', () => {
    assert.equal(yearAt(0, 10, 110, 1960, 2020), 1960);
    assert.equal(yearAt(60, 10, 110, 1960, 2020), 1990);
    assert.equal(yearAt(500, 10, 110, 1960, 2020), 2020);
  });
});

describe('the pinned World Bank table', () => {
  const file = path.join(root, 'public', 'geo', 'series.json');
  const series = JSON.parse(fs.readFileSync(file, 'utf8'));
  it('has the four indicators, credited', () => {
    assert.deepEqual(Object.keys(series.indicators), ['population', 'life-expectancy', 'fertility', 'gdp-per-person']);
    assert.match(series.attribution, /World Bank/);
    assert.equal(series.license, 'CC BY 4.0');
  });
  it('has the figures the story of India overtaking China rests on', () => {
    const population = series.indicators.population;
    const index = (year: number) => year - population.years[0];
    assert.ok(population.countries.CHN[index(2000)] > population.countries.IND[index(2000)]);
    assert.ok(population.countries.IND[index(2024)] > population.countries.CHN[index(2024)]);
  });
});

describe('a chart over time in a shot', () => {
  const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
  const geo = {series: JSON.parse(fs.readFileSync(path.join(root, 'public', 'geo', 'series.json'), 'utf8'))};
  const line = (extra = {}) => ({...base, series: {indicator: 'population', view: 'line', places: ['country:CHN', 'country:IND'], from: 1960, to: 2024, ...extra}});

  it('takes an indicator, a view, countries and two different years', () => {
    assert.ok(primitiveSchema.safeParse(line()).success);
    assert.ok(primitiveSchema.safeParse(line({view: 'race', places: []})).success);
    assert.ok(!primitiveSchema.safeParse(line({indicator: 'happiness'})).success);
    assert.ok(!primitiveSchema.safeParse(line({to: 1960})).success);
    assert.ok(!primitiveSchema.safeParse(line({places: []})).success, 'a line needs a country');
    assert.ok(!primitiveSchema.safeParse(line({view: 'race', places: ['country:CHN', 'country:IND']})).success, 'a race lights up one');
  });

  it('marks a year inside its range on a line, and never on a race', () => {
    assert.ok(primitiveSchema.safeParse(line({axis: 'fit', mark: {year: 2021, text: 'PEAK 2021'}})).success);
    assert.ok(!primitiveSchema.safeParse(line({mark: {year: 1950, text: 'EARLY'}})).success);
    assert.ok(!primitiveSchema.safeParse(line({mark: {year: 2030, text: 'LATE'}})).success);
    assert.ok(!primitiveSchema.safeParse(line({view: 'race', places: [], mark: {year: 2000, text: 'X'}})).success);
    assert.ok(!primitiveSchema.safeParse(line({view: 'race', places: [], axis: 'fit'})).success);
  });

  it('will not share the bottom of the frame with a bar chart, a photo or a street map', () => {
    assert.ok(!primitiveSchema.safeParse({...line(), data: {label: 'x', values: [{entity: 'country:CHN', value: 1}, {entity: 'country:IND', value: 2}], view: 'bars'}}).success);
    assert.ok(!primitiveSchema.safeParse({...line(), annotations: [{type: 'photo', photo: 'peace-arch', at: 0.1}]}).success);
  });

  it('is checked against the years and countries the table has', () => {
    assert.deepEqual(seriesProblems(line(), geo), []);
    assert.match(seriesProblems(line({from: 1950}), geo)[0], /outside the years/);
    assert.match(seriesProblems(line({places: ['country:TWN']}), geo)[0], /no population figures/);
    assert.match(seriesProblems(line({indicator: 'life-expectancy', to: 2025}), geo)[0], /outside the years/);
  });

  it('is credited to the World Bank in the rights', () => {
    const asset = seriesRightsAsset(geo);
    assert.equal(asset.owner, 'World Bank');
    assert.match(asset.notes, /CC BY 4.0/);
  });
});
