import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {geoProblems, geoReferences, loadGeoData} from '../scripts/lib/geo-primitives.mjs';
import {primitiveSchema, primitiveText, type GeoMapPrimitive} from '../scripts/primitive-schema.mjs';
import {videoSchema} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/geo-georgia-shots.json'), 'utf8')).shots as Record<string, unknown>;
const parse = (value: unknown) => primitiveSchema.safeParse(value);
const errorsOf = (value: unknown) => {
  const result = parse(value);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};
const geo = loadGeoData();
const flyTo = () => structuredClone(shots['fly-to-georgia']) as Record<string, unknown> & {camera: {at: number}[]};

describe('geo-map primitive', () => {
  it('expresses the three Georgia golden shots as data, filling in defaults', () => {
    for (const [name, shot] of Object.entries(shots)) {
      const result = parse(shot);
      assert.ok(result.success, `${name}: ${errorsOf(shot).join('; ')}`);
      assert.deepEqual(geoProblems(result.data as GeoMapPrimitive, geo), [], name);
    }
    const border = parse(shots['georgia-border']).data as GeoMapPrimitive;
    assert.deepEqual(border.camera[0], {target: 'country:GEO', at: 0, padding: 0.12, ease: 'in-out'});
    assert.equal(border.dataset, 'natural-earth');
    const seas = parse(shots['between-two-seas']).data as GeoMapPrimitive;
    assert.equal(primitiveText(seas), 'BLACK SEA, CASPIAN SEA', 'only on-screen words go to the fact checks');
    assert.deepEqual(geoReferences(seas).map(([, id]) => id), ['country:GEO', 'water:black-sea', 'water:caspian-sea', 'water:black-sea', 'country:GEO', 'water:caspian-sea', 'country:GEO']);
  });

  it('rejects camera keyframes that start late or go back in time', () => {
    const late = flyTo();
    late.camera[0].at = 0.2;
    assert.match(errorsOf(late).join(), /first camera keyframe must be at 0/);
    const backwards = flyTo();
    backwards.camera[2].at = 0.3;
    assert.match(errorsOf(backwards).join(), /must move forward in time: 0.3 follows 0.45/);
  });

  it('rejects coordinates out of range, upside-down boxes, raw ids and unknown fields', () => {
    assert.match(errorsOf({kind: 'geo-map', camera: [{target: 'world', at: 0}], annotations: [{type: 'marker', anchor: {lon: 200, lat: 10}, at: 0}]}).join(), /annotations\.0\.anchor/);
    assert.match(errorsOf({kind: 'geo-map', camera: [{target: {bbox: [40, 45, 46, 41]}, at: 0}]}).join(), /south below north/);
    assert.match(errorsOf({kind: 'geo-map', camera: [{target: 'Georgia', at: 0}]}).join(), /camera\.0\.target/);
    assert.ok(errorsOf({kind: 'geo-map', camera: [{target: 'world', at: 0}], polygon: [[0, 0]]}).length > 0, 'no hand-drawn outlines');
    assert.ok(errorsOf({kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: Array.from({length: 5}, () => ({entity: 'country:GEO'}))}).length > 0, 'at most 4 highlights');
  });

  it('points at the nearest real id when a place is unknown', () => {
    const shot = parse({kind: 'geo-map', camera: [{target: 'country:GEORGIA', at: 0}], highlights: [{entity: 'disputed:abkhazia-B35'}, {entity: 'water:black'}]}).data as GeoMapPrimitive;
    const problems = geoProblems(shot, geo);
    assert.equal(problems.length, 2, problems.join('\n'));
    assert.match(problems[0], /camera\[0\]\.target: unknown geo entity "country:GEORGIA"; did you mean country:GEO \(Georgia\)/);
    assert.match(problems[1], /highlights\[1\]\.entity: unknown geo entity "water:black"; did you mean water:black-sea/);
  });
});

describe('compiling map scenes', () => {
  const draftWithMap = (primitive: unknown) => {
    const draft = JSON.parse(fs.readFileSync(path.join(root, 'drafts/pokepulses/bulbasaur-001.json'), 'utf8'));
    draft.scenes[1].primitive = primitive;
    return draft;
  };

  it('keeps the map in the manifest and credits the map data once', () => {
    const {manifest} = compileEpisode(draftWithMap(shots['between-two-seas']), {showId: 'pokepulses'});
    assert.ok(videoSchema.safeParse(manifest).success);
    assert.equal(manifest.scenes[1].primitive?.kind, 'geo-map');
    const credits = manifest.rights.assets.filter((asset) => asset.kind === 'map-data');
    assert.deepEqual(credits, [{kind: 'map-data', sourceUrl: 'https://www.naturalearthdata.com/about/terms-of-use/', owner: 'Natural Earth v5.1.2', licenseStatus: 'public-domain', publicReleaseApproved: true, notes: 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.'}]);
  });

  it('fails compilation with every unknown place, not an empty map', () => {
    assert.throws(() => compileEpisode(draftWithMap({kind: 'geo-map', camera: [{target: 'country:XYZ', at: 0}], highlights: [{entity: 'water:atlantis'}]}), {showId: 'pokepulses'}), (error: Error) => {
      assert.match(error.message, /bulbasaur-001 has map scenes that refer to unknown places/);
      assert.match(error.message, /scene "[a-z0-9-]+" camera\[0\]\.target: unknown geo entity "country:XYZ"/);
      assert.match(error.message, /highlights\[0\]\.entity: unknown geo entity "water:atlantis"/);
      return true;
    });
  });

  it('leaves episodes without maps exactly as they were', () => {
    const draft = JSON.parse(fs.readFileSync(path.join(root, 'drafts/pokepulses/mew-151.json'), 'utf8'));
    const committed = JSON.parse(fs.readFileSync(path.join(root, 'videos/pokepulses/mew-151/video.json'), 'utf8'));
    assert.deepEqual(compileEpisode(draft, {showId: 'pokepulses'}).manifest, committed);
  });
});
