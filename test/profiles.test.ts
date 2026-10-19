import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {featureTags} from '../scripts/lib/feature-tags.mjs';
import {profileProblems, profileRightsAsset} from '../scripts/lib/geo-primitives.mjs';
import {EARTH_KM, densify, heightAt, sampleProfile, windowOf} from '../scripts/lib/profiles.mjs';
import {sha256} from '../scripts/lib/geo-data.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {exaggeration, heightAxis, profileProgress} from '../src/video/geo/Profile';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const camera = [{target: 'world', at: 0, padding: 0.1, ease: 'in-out'}];
const shot = (annotations: object[], extra: object = {}) => ({kind: 'geo-map', camera, highlights: [], annotations, dataset: 'natural-earth', ...extra});
const profile = {type: 'profile', set: 'andes-crossing'};

describe('profile sampling', () => {
  it('densifies a path along great circles with the distance run at each point', () => {
    const dense = densify([[0, 0], [0, 1]], 5);
    assert.equal(dense.distances[0], 0);
    assert.ok(Math.abs(dense.distances.at(-1)! - (EARTH_KM * Math.PI) / 180) < 0.01, 'one degree of arc is about 111 km');
    assert.ok(dense.points.length > 20);
  });

  it('covers the path with a window of model cells, and reads heights between cell centres', () => {
    const window = windowOf([[-71.5, -33], [-70, -33.2]]);
    assert.ok(window.columns > 80 && window.rows >= 12);
    // A 2x2 patch of cells whose heights rise to the east.
    const patch = {row0: 0, row1: 1, col0: 0, col1: 1, columns: 2, rows: 2};
    const lon = (0.5 + 0.5) / 60 - 180;
    const lat = (0.5 + 0.5) / 60 - 90;
    assert.ok(Math.abs(heightAt([0, 100, 0, 100], patch, [lon, lat]) - 50) < 1e-6);
  });

  it('samples evenly by distance, from the start to the end of the path', () => {
    const dense = densify([[0, 0], [1, 0]], 2);
    const window = {row0: 0, row1: 1, col0: 0, col1: 1, columns: 2, rows: 2};
    const sampled = sampleProfile([10, 10, 10, 10], window, dense, 21);
    assert.equal(sampled.distanceKm.length, 21);
    assert.equal(sampled.distanceKm[0], 0);
    assert.ok(Math.abs(sampled.distanceKm[20] - dense.distances.at(-1)!) < 0.1);
    assert.ok(sampled.elevationM.every((height) => height === 10));
  });
});

describe('the stored profiles', () => {
  const dir = path.join(root, 'public', 'geo', 'profiles');
  const index = fs.existsSync(path.join(dir, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) : {profiles: {}};

  it('match their checksums and are shaped like their route', () => {
    assert.ok(Object.keys(index.profiles).length >= 1);
    for (const [id, entry] of Object.entries(index.profiles) as [string, {sha256: string}][]) {
      const bytes = fs.readFileSync(path.join(dir, `${id}.json`));
      assert.equal(sha256(bytes), entry.sha256, id);
      const stored = JSON.parse(bytes.toString('utf8'));
      assert.equal(stored.elevationM.length, stored.samples);
      assert.equal(stored.distanceKm.length, stored.samples);
      assert.equal(stored.points.length, stored.samples);
      assert.equal(stored.highestM, Math.max(...stored.elevationM));
      assert.equal(stored.lowestM, Math.min(...stored.elevationM));
      assert.ok(stored.distanceKm.every((d: number, i: number) => i === 0 || d >= stored.distanceKm[i - 1]));
    }
  });

  it('cross the Andes from the sea to a high pass and down again', () => {
    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'andes-crossing.json'), 'utf8'));
    assert.ok(stored.elevationM[0] < 200, 'it starts at the Pacific');
    assert.ok(stored.highestM > 3500 && stored.highestM < 7000, `highest ${stored.highestM}`);
    assert.ok(stored.elevationM.at(-1) < stored.highestM / 2, 'it comes down on the Argentine side');
  });
});

describe('profile scenes', () => {
  it('accept one profile on a flat map and tag it', () => {
    const parsed = primitiveSchema.parse(shot([{...profile, text: 'Valparaíso to Argentina'}])) as never;
    assert.ok(featureTags({scenes: [{primitive: parsed, shot: 'map'}]} as never).includes('elevation-profile'));
  });

  it('refuse a second profile, another panel, a globe and a morph', () => {
    assert.equal(primitiveSchema.safeParse(shot([profile, {...profile, set: 'other'}])).success, false);
    assert.equal(primitiveSchema.safeParse(shot([profile], {series: {indicator: 'population', view: 'line', places: ['country:CHL'], from: 1990, to: 2020}})).success, false);
    assert.equal(primitiveSchema.safeParse(shot([profile], {figure: {value: 6961, text: 'ACONCAGUA', decimals: 0, at: 0.5}})).success, false);
    assert.equal(primitiveSchema.safeParse(shot([profile, {type: 'timeline', steps: [{label: 'A'}, {label: 'B'}], active: 0}])).success, false);
    assert.equal(primitiveSchema.safeParse(shot([profile], {globe: true})).success, false);
  });

  it('need the profile on file, and credit NOAA', () => {
    assert.deepEqual(profileProblems(shot([profile]) as never, {profiles: {profiles: {'andes-crossing': {}}}} as never), []);
    assert.match(profileProblems(shot([profile]) as never, {profiles: {profiles: {}}} as never)[0], /no elevation profile "andes-crossing"/);
    const asset = profileRightsAsset({profiles: {source: {doi: 'https://doi.org/10.25921/fd45-gt74', name: 'ETOPO 2022', publisher: 'NOAA', license: 'Public domain'}}});
    assert.match(asset.owner, /ETOPO 2022/);
    assert.equal(asset.licenseStatus, 'public-domain');
  });
});

describe('the profile panel', () => {
  it('sets a tidy height axis that includes the sea when the path dips under it', () => {
    assert.deepEqual(heightAxis(-87, 4849), {min: -250, max: 5000, step: 1000, ticks: [0, 1000, 2000, 3000, 4000, 5000]});
    assert.equal(heightAxis(120, 900).min, 0);
    assert.equal(heightAxis(0, 900).max, 1000);
    assert.equal(heightAxis(0, 8000).step, 2000);
  });

  it('says how much taller the picture is than the land', () => {
    // 5,000 m over 400 px tall against 900 km over 800 px wide: 0.08 px/m against 0.00089 px/m.
    assert.ok(Math.abs(exaggeration(5000, 400, 900, 800) - 90) < 0.5);
  });

  it('holds at the start while the panel arrives, runs to the end, and holds there', () => {
    assert.equal(profileProgress(0, 0, 100), 0);
    assert.equal(profileProgress(14, 0, 100), 0);
    assert.ok(profileProgress(57, 0, 100) > 0.4 && profileProgress(57, 0, 100) < 0.6);
    assert.equal(profileProgress(100, 0, 100), 1);
    assert.equal(profileProgress(500, 0, 100), 1);
  });
});
