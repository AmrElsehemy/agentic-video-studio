import assert from 'node:assert/strict';
import fs from 'node:fs';
import {describe, it} from 'node:test';
import {shadeScale} from '../scripts/lib/series.mjs';
import {countAt, formatCount} from '../src/video/geo/FigureReveal';
import {shadeColor} from '../src/video/geo/SeriesChart';

const series = JSON.parse(fs.readFileSync('public/geo/series.json', 'utf8')).indicators;

describe('shaded map scale', () => {
  it('uses one scale for the whole chart, with the ends clipped at the 2nd and 98th percentile', () => {
    const scale = shadeScale(series['life-expectancy'], 'life-expectancy', 1960, 2022);
    assert.ok(scale.low > 20 && scale.low < 50 && scale.high > 75 && scale.high < 90);
    assert.equal(scale.t(scale.low - 5), 0);
    assert.equal(scale.t(scale.high + 5), 1);
    assert.ok(scale.t((scale.low + scale.high) / 2) > 0.4 && scale.t((scale.low + scale.high) / 2) < 0.6);
    assert.equal(scale.clippedHigh, true);
  });

  it('puts money on a log scale', () => {
    const scale = shadeScale(series['gdp-per-person'], 'gdp-per-person', 2000, 2022);
    assert.ok(scale.log);
    const middle = Math.sqrt(scale.low * scale.high);
    assert.ok(Math.abs(scale.t(middle) - 0.5) < 0.01);
  });

  it('ramps from dark to bright', () => {
    assert.equal(shadeColor(0), 'rgb(27,21,52)');
    assert.equal(shadeColor(1), 'rgb(251,229,154)');
  });
});

describe('rolled-up number', () => {
  it('counts from zero to the stated value and prints it with grouped digits', () => {
    assert.equal(countAt(2060, 0), 0);
    assert.equal(countAt(2060, 1000), 2060);
    assert.ok(countAt(2060, 18) > 1000 && countAt(2060, 18) < 2060);
    assert.equal(formatCount(2060, 0), '2,060');
    assert.equal(formatCount(3.5, 1), '3.5');
  });
});
