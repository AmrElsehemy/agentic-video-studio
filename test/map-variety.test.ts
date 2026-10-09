import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {directGeoVisuals} from '../scripts/lib/geo-director.mjs';
import {loadGeoData} from '../scripts/lib/geo-primitives.mjs';
import {mapDirectionProblems, mapVariety} from '../scripts/lib/map-variety.mjs';
import {publishBlockers} from '../scripts/lib/publish-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const geo = loadGeoData(root);

const shot = (target: string, highlight = target, extra: object = {}) => ({
  kind: 'geo-map',
  camera: [{target, at: 0}],
  highlights: [{entity: highlight, style: 'fill', at: 0.2}],
  annotations: [],
  ...extra,
});
const scenesOf = (shots: object[]) => ({scenes: shots.map((primitive, index) => ({id: `s${index + 1}`, primitive}))});

describe('map variety', () => {
  it('passes a map that moves and changes what is lit', () => {
    const {problems, repeats} = mapVariety(scenesOf([shot('world', 'country:LSO'), shot('country:LSO'), shot('country:ZAF'), shot('country:LSO', 'country:ZAF'), shot('world', 'country:ZAF')]));
    assert.deepEqual(problems, []);
    assert.deepEqual(repeats, []);
  });

  it('blocks the same picture scene after scene', () => {
    const same = shot('country:MNG');
    const {problems, repeats} = mapVariety(scenesOf([same, same, same, same, same, same, same]));
    assert.equal(repeats.length, 6);
    assert.match(problems[0], /barely changes: 6 of 6/);
  });

  it('blocks a map that keeps returning to a couple of pictures', () => {
    const a = shot('country:MNG');
    const b = shot('country:MNG', 'country:CHN');
    const {problems, repeats} = mapVariety(scenesOf([a, b, a, b, a, b, a]));
    assert.deepEqual(repeats, []);
    assert.match(problems[0], /2 different views in 7 scenes/);
  });

  it('counts a data layer or relief as a different picture, and ignores label text', () => {
    const base = shot('country:LSO');
    const labelled = {...base, annotations: [{type: 'label', anchor: 'country:LSO', text: 'LESOTHO', at: 0.3}]};
    assert.deepEqual(mapVariety(scenesOf([base, labelled])).repeats, ['s2']);
    assert.deepEqual(mapVariety(scenesOf([base, {...base, relief: true}])).repeats, []);
  });

  it('has nothing to say about episodes without maps or with very few', () => {
    assert.deepEqual(mapVariety({scenes: [{id: 'a'}, {id: 'b'}]}).problems, []);
    assert.deepEqual(mapVariety(scenesOf([shot('country:MNG'), shot('country:MNG')])).problems, []);
  });

  it('keeps every committed, uploaded episode clear of the release check', () => {
    for (const id of ['bir-tawil', 'brazil-borders', 'gambia-river', 'mercator-greenland']) {
      const manifest = read(`videos/geographica/${id}/video.json`);
      assert.deepEqual(mapVariety(manifest).problems, [], id);
    }
  });

  it('is a publish blocker for a map episode that never changes', () => {
    const manifest = read('videos/geographica/lesotho-enclave/video.json');
    const same = manifest.scenes[0].primitive;
    const stuck = {...manifest, scenes: manifest.scenes.map((scene: object) => ({...scene, primitive: same}))};
    assert.ok(publishBlockers(stuck, geo).some((blocker: string) => blocker.startsWith('map-variety:')));
    assert.ok(!publishBlockers(manifest, geo).some((blocker: string) => blocker.startsWith('map-variety:')));
  });
});

describe('geo director repair round', () => {
  const lesotho = {draft: read('drafts/geographica/lesotho-enclave.json'), research: read('research/geographica/lesotho-enclave.json')};
  const undirected = {...lesotho.draft, scenes: lesotho.draft.scenes.map(({primitive, ...scene}: any) => scene)};
  const good = fs.readFileSync(path.join(root, 'test/fixtures/geo-director/lesotho-enclave.reply.json'), 'utf8');
  const monotone = JSON.stringify({scenes: undirected.scenes.map((scene: {id: string}) => ({id: scene.id, camera: [{target: 'country:LSO', at: 0}], highlights: [{entity: 'country:LSO', style: 'fill', at: 0.2}], why: 'same'}))});

  it('asks again when the first answer is a slideshow, and keeps the better answer', async () => {
    const calls: any[] = [];
    const complete = async (prompt: any) => {
      calls.push(prompt);
      return calls.length === 1 ? monotone : good;
    };
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete});
    assert.equal(calls.length, 2);
    assert.match(calls[1].messages.at(-1).content, /barely changes/);
    assert.equal(calls[1].messages.at(-2).content, monotone);
    assert.deepEqual(result.variety.problems, []);
    assert.deepEqual(result.fallbacks, []);
  });

  it('asks a second time when the first repair is still a slideshow, then stops', async () => {
    const answers = [monotone, monotone, good];
    let calls = 0;
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: async () => answers[calls++] ?? monotone});
    assert.equal(calls, 3, 'one answer and at most two repairs');
    assert.deepEqual(result.variety.problems, []);

    calls = 0;
    await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: async () => { calls++; return monotone; }});
    assert.equal(calls, 3, 'never more than two repairs');
  });

  it('does not ask again when the first answer is already fine', async () => {
    let calls = 0;
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: async () => { calls++; return good; }});
    assert.equal(calls, 1);
    assert.deepEqual(result.variety.problems, []);
  });

  it('keeps the first shots when the repair is no better', async () => {
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: async () => monotone});
    assert.ok(result.variety.problems.length > 0);
    assert.equal(result.assigned.length, undirected.scenes.length);
  });
});

describe('geo director point keys', () => {
  const lesotho = {draft: read('drafts/geographica/lesotho-enclave.json'), research: read('research/geographica/lesotho-enclave.json')};
  const undirected = {...lesotho.draft, scenes: lesotho.draft.scenes.map(({primitive, ...scene}: any) => scene)};
  const shotFor = (annotation: object, highlight = 'country:LSO') => JSON.stringify({scenes: undirected.scenes.map((scene: {id: string}, index: number) => ({
    id: scene.id,
    camera: [{target: index % 2 ? 'country:LSO' : 'world', at: 0}],
    highlights: [{entity: highlight, style: index % 3 ? 'fill' : 'outline', at: 0.2}],
    annotations: index === 0 ? [annotation] : [],
    why: 'x',
  }))});

  it('reads a bare point key as that named point', async () => {
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: async () => shotFor({type: 'marker', anchor: 'maseru', text: 'MASERU', at: 0.3})});
    const marker = result.draft.scenes[0].primitive.annotations[0];
    assert.deepEqual(marker.anchor, {lon: lesotho.research.places.maseru.lon, lat: lesotho.research.places.maseru.lat});
    assert.deepEqual(result.fallbacks, []);
  });

  it('tells the model a point cannot be highlighted, and how to use it', async () => {
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: async () => shotFor({type: 'marker', anchor: 'maseru', text: 'MASERU', at: 0.3}, 'maseru')});
    assert.match(result.fallbacks[0].reason, /named point, not a place id/);
  });
});

describe('map direction', () => {
  const world = (highlight: string) => shot('world', highlight);
  it('allows a world opening on the first and last scene, and asks for the rest to open on their places', () => {
    assert.deepEqual(mapDirectionProblems(scenesOf([world('country:MNG'), shot('country:MNG'), shot('country:CHN'), world('country:MNG')])), []);
    const problems = mapDirectionProblems(scenesOf([world('country:MNG'), shot('country:MNG'), world('country:CHN'), shot('country:RUS'), world('country:MNG')]));
    assert.match(problems[0], /^Scene s3 opens on the whole-world view/);
    assert.match(mapDirectionProblems(scenesOf([shot('country:MNG'), world('country:MNG'), world('country:CHN'), shot('country:RUS')]))[0], /^Scenes s2, s3 open on/);
  });

  it('is not a release blocker, so published episodes are unaffected', () => {
    const manifest = read('videos/geographica/lesotho-enclave/video.json');
    const worldly = {...manifest, scenes: manifest.scenes.map((scene: any) => ({...scene, primitive: {...scene.primitive, camera: [{target: 'world', at: 0}]}}))};
    assert.ok(mapDirectionProblems(worldly).length > 0);
    assert.ok(!publishBlockers(worldly, geo).some((blocker: string) => /whole-world/.test(blocker)));
  });
});
