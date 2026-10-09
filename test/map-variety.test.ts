import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {barRows, formatBar, panelHeight} from '../src/video/geo/DataBars';
import {builtinDatasets, directGeoVisuals, mentionedPlaces, resolveResearchPlaces, shotShows, unframedRivers} from '../scripts/lib/geo-director.mjs';
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

describe('places the director may use', () => {
  const rich = {draft: read('drafts/geographica/lesotho-enclave.json'), research: read('research/geographica/lesotho-enclave.json')};
  const nile = (text: string) => mentionedPlaces(text, geo).map((entity: {id: string}) => entity.id).sort();

  it('finds the rivers, lakes, states and cities a text names', () => {
    assert.deepEqual(nile('The Nile flows north through Cairo and Khartoum.'), ['city:cairo-egy', 'city:khartoum-sdn', 'river:nile']);
    assert.ok(nile('Russia sold Alaska in 1867.').includes('admin1:USA-3563'));
    assert.deepEqual(nile('Lake Baikal holds a fifth of the fresh water.'), ['lake:lake-baikal']);
  });

  it('lets a longer name hide the shorter one inside it, and skips everyday words', () => {
    assert.deepEqual(nile('The White Nile leaves Lake Victoria.'), ['lake:lake-victoria', 'river:white-nile']);
    assert.deepEqual(nile('Back then, nobody knew.'), []);
  });

  it('offers a country its nearby rivers, lakes and cities, capitals and the biggest first, a few of each', () => {
    const {places} = resolveResearchPlaces(read('research/geographica/nile-flows-north.json'), geo);
    const kinds = [...places.values()].map((place: {kind: string}) => place.kind);
    for (const kind of ['river', 'lake', 'city']) assert.ok(kinds.includes(kind), kind);
    assert.ok(places.has('river:nile') && places.has('city:cairo-egy'));
    assert.ok(kinds.filter((kind: string) => kind === 'city').length <= 10);
  });

  it('knows what a shot shows: highlighted, labelled, or framed (not just the whole world)', () => {
    const place = {id: 'river:nile', bbox: [29, 22, 33, 31] as [number, number, number, number]};
    const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: []} as any;
    const boxes = new Map<string, [number, number, number, number]>();
    assert.equal(shotShows(base, place, boxes), false);
    assert.equal(shotShows({...base, highlights: [{entity: 'river:nile', style: 'trace', at: 0.2}]}, place, boxes), true);
    assert.equal(shotShows({...base, annotations: [{type: 'label', anchor: 'river:nile', text: 'NILE', at: 0.3}]}, place, boxes), true);
    assert.equal(shotShows({...base, camera: [{target: {bbox: [20, 15, 40, 35]}, at: 0}]}, place, boxes), true);
    assert.equal(shotShows({...base, camera: [{target: {bbox: [60, 15, 80, 35]}, at: 0}]}, place, boxes), false);
  });

  it('asks again when a scene names a place its shot never shows', async () => {
    const draft = {...rich.draft, scenes: rich.draft.scenes.map(({primitive, ...scene}: any) => scene)};
    const names = (text: string) => ({...draft, scenes: draft.scenes.map((scene: any, index: number) => (index === 1 ? {...scene, narration: text} : scene))});
    const monotone = (ids: string[]) => JSON.stringify({scenes: draft.scenes.map((scene: {id: string}, index: number) => ({id: scene.id, camera: [{target: index % 2 ? 'country:LSO' : 'world', at: 0}], highlights: [{entity: ids[index % ids.length], style: index % 3 ? 'fill' : 'outline', at: 0.2}], why: 'x'}))});
    const calls: any[] = [];
    const answers = [monotone(['country:LSO', 'country:ZAF']), monotone(['country:LSO', 'country:ZAF'])];
    const result = await directGeoVisuals({draft: names('Lesotho sits inside South Africa, near Durban.'), research: rich.research, geo, complete: async (prompt: any) => { calls.push(prompt); return answers[Math.min(calls.length - 1, 1)]; }});
    assert.ok(calls.length >= 2, 'a repair round happened');
    assert.match(calls[1].messages.at(-1).content, /names Durban/);
    assert.ok(result.unseenMentions.some((item: {places: string[]}) => item.places.includes('city:durban-zaf')));
  });
});

describe('comparison datasets and the globe', () => {
  const lesotho = {draft: read('drafts/geographica/lesotho-enclave.json'), research: read('research/geographica/lesotho-enclave.json')};
  const undirected = {...lesotho.draft, scenes: lesotho.draft.scenes.map(({primitive, ...scene}: any) => scene)};

  it('builds population, area and density from the pinned country data', () => {
    const {places} = resolveResearchPlaces(read('research/geographica/mongolia-empty.json'), geo);
    const datasets = builtinDatasets(places);
    assert.deepEqual([...datasets.keys()], ['population', 'area', 'density']);
    const density = Object.fromEntries(datasets.get('density')!.values.map(({entity, value}: {entity: string; value: number}) => [entity, value]));
    assert.ok(density['country:MNG'] < 3 && density['country:CHN'] > 100, JSON.stringify(density));
    // Rounded so they read as estimates.
    for (const {value} of datasets.get('population')!.values) assert.ok(String(value).replace(/0+$/, '').length <= 4, String(value));
  });

  it('has no built-in datasets for a single country', () => {
    const only = new Map([['country:LSO', {id: 'country:LSO', kind: 'country', name: 'Lesotho', population: 2e6, areaKm2: 30000}]]);
    assert.equal(builtinDatasets(only as any).size, 0);
  });

  it('keeps a globe on the first and last scene only, and cuts where the projection changes', async () => {
    const shot = (index: number) => ({camera: [{target: 'world', at: 0}, {target: 'country:LSO', at: 1}], highlights: [{entity: 'country:LSO', style: index % 2 ? 'fill' : 'outline', at: 0.3}], globe: true, why: 'x'});
    const reply = JSON.stringify({scenes: undirected.scenes.map((scene: {id: string}, index: number) => ({id: scene.id, ...shot(index), camera: [{target: index % 2 ? 'country:ZAF' : 'country:LSO', at: 0}, {target: index % 3 ? 'country:LSO' : 'country:ZAF', at: 1}]}))});
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: async () => reply});
    const scenes = result.draft.scenes;
    scenes.forEach((scene: any, index: number) => {
      const edge = index === 0 || index === scenes.length - 1;
      assert.equal(Boolean(scene.primitive.globe), edge, `scene ${index + 1}`);
    });
    // The first scene is a globe and the second is flat, so the second starts with a cut; the last is a globe again, so it cuts too.
    assert.equal(scenes[1].primitive.cut, true);
    assert.equal(scenes.at(-1).primitive.cut, true);
    assert.equal(scenes[2].primitive.cut, undefined);
  });
});

describe('bar chart', () => {
  it('shows the longest bars and always keeps the subject', () => {
    const rows = [...Array.from({length: 8}, (_, index) => ({id: `r${index}`, name: `R${index}`, value: 100 - index, subject: false})), {id: 's', name: 'S', value: 1, subject: true}];
    const shown = barRows(rows);
    assert.equal(shown.length, 5);
    assert.ok(shown.some((row) => row.subject));
    assert.deepEqual(shown.slice(0, 4).map((row) => row.id), ['r0', 'r1', 'r2', 'r3']);
  });

  it('prints big numbers compactly and counts up in the same style', () => {
    assert.equal(formatBar(1_400_000_000, 1_400_000_000), '1.4B');
    assert.equal(formatBar(144_000_000, 144_000_000), '144M');
    assert.equal(formatBar(2.1, 2.1), '2.1');
    assert.equal(formatBar(8.46, 8.5), '8.5');
    assert.equal(formatBar(149.6, 150), '150');
    assert.ok(panelHeight(4) < panelHeight(5));
  });
});

describe('mentions that are not countries', () => {
  const ids = (text: string) => mentionedPlaces(text, geo).map((entity: {id: string}) => entity.id).sort();
  it('does not read New Guinea as Guinea, or a sea\'s name as the country in it', () => {
    assert.ok(!ids('Indonesia shares the island of New Guinea.').includes('country:GIN'));
    assert.ok(ids('Papua New Guinea is a country.').includes('country:PNG'));
    assert.deepEqual(ids('Ships cross the Gulf of Mexico.'), []);
    assert.ok(!ids('The Sea of Japan lies to the west.').includes('country:JPN'));
    assert.deepEqual(ids('Guinea and Guinea-Bissau are neighbours.'), ['country:GIN', 'country:GNB']);
  });
});

describe('traced rivers', () => {
  const places = new Map<string, any>([['river:nile', {id: 'river:nile', kind: 'river', name: 'Nile', bbox: [30, 15, 34, 30]}]]);
  const boxes = new Map<string, [number, number, number, number]>();
  const shotWith = (camera: object[]) => ({kind: 'geo-map', camera, highlights: [{entity: 'river:nile', style: 'trace', at: 0.2}], annotations: []}) as any;
  it('asks for a framing that holds most of the river', () => {
    assert.equal(unframedRivers(shotWith([{target: {bbox: [31.5, 14.7, 33.5, 16.2]}, at: 0}, {target: {bbox: [-2, 22, 37, 44]}, at: 1}]), places, boxes).length, 1);
    assert.equal(unframedRivers(shotWith([{target: {bbox: [28, 12, 36, 32]}, at: 0}, {target: {bbox: [30, 29, 32, 32]}, at: 1}]), places, boxes).length, 0);
  });
  it('leaves a camera that starts on the world alone', () => {
    assert.equal(unframedRivers(shotWith([{target: 'world', at: 0}, {target: {bbox: [31.5, 14.7, 33.5, 16.2]}, at: 1}]), places, boxes).length, 0);
  });
});
