import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {geoResearchSchema} from '../scripts/geo-research-schema.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {planMapSoundEvents} from '../scripts/lib/sound-design.mjs';
import {barRows, formatBar, panelHeight} from '../src/video/geo/DataBars';
import {builtinDatasets, describeShot, directGeoVisuals, labelClutter, mentionedPlaces, offFramePlaces, reconstructionConflicts, resolveResearchPlaces, shotShows, shotToPrimitive, unframedJourneys, unframedRivers} from '../scripts/lib/geo-director.mjs';
import {geoProblems, loadGeoData, plateRightsAsset} from '../scripts/lib/geo-primitives.mjs';
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
/** Calls from the shot reviewer are answered "nothing weak" so tests can count the director's own calls. */
const isReviewer = (prompt: any) => /review the map shots/.test(prompt.system);
const directorOnly = (complete: (prompt: any) => Promise<string>) => async (prompt: any) => (isReviewer(prompt) ? JSON.stringify({scenes: []}) : complete(prompt));
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
  // The saved Lesotho reply plus a line, relief and a distance-from-sea surface, so it clears the devices check too.
  const good = fs.readFileSync(path.join(root, 'test/fixtures/geo-director/lesotho-enclave.devices.reply.json'), 'utf8');
  const monotone = JSON.stringify({scenes: undirected.scenes.map((scene: {id: string}) => ({id: scene.id, camera: [{target: 'country:LSO', at: 0}], highlights: [{entity: 'country:LSO', style: 'fill', at: 0.2}], why: 'same'}))});

  it('asks again when the first answer is a slideshow, and keeps the better answer', async () => {
    const calls: any[] = [];
    const complete = directorOnly(async (prompt: any) => {
      calls.push(prompt);
      return calls.length === 1 ? monotone : good;
    });
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
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: directorOnly(async () => answers[calls++] ?? monotone)});
    assert.equal(calls, 3, 'one answer and at most two repairs');
    assert.deepEqual(result.variety.problems, []);

    calls = 0;
    await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: directorOnly(async () => { calls++; return monotone; })});
    assert.equal(calls, 3, 'never more than two repairs');
  });

  it('does not ask again when the first answer is already fine', async () => {
    let calls = 0;
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: directorOnly(async () => { calls++; return good; })});
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
    const result = await directGeoVisuals({draft: names('Lesotho sits inside South Africa, near Durban.'), research: rich.research, geo, complete: directorOnly(async (prompt: any) => { calls.push(prompt); return answers[Math.min(calls.length - 1, 1)]; })});
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

describe('grid lines', () => {
  const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
  it('accepts a meridian and a parallel, and refuses a parallel past the poles', () => {
    assert.equal(primitiveSchema.safeParse({...base, annotations: [{type: 'line', kind: 'meridian', degrees: 0, text: '0° PRIME MERIDIAN', at: 0.2}]}).success, true);
    assert.equal(primitiveSchema.safeParse({...base, annotations: [{type: 'line', kind: 'parallel', degrees: 23.4}]}).success, true);
    assert.equal(primitiveSchema.safeParse({...base, annotations: [{type: 'line', kind: 'parallel', degrees: 120}]}).success, false);
    assert.equal(primitiveSchema.safeParse({...base, annotations: [{type: 'line', kind: 'meridian', degrees: 200}]}).success, false);
  });

  it('lets a line state its own degrees, and the director keeps the line', () => {
    const lesotho = {draft: read('drafts/geographica/lesotho-enclave.json'), research: read('research/geographica/lesotho-enclave.json')};
    const research = geoResearchSchema.parse(lesotho.research);
    const {places, datasets} = resolveResearchPlaces(research, geo);
    const shot = {camera: [{target: 'world', at: 0}], annotations: [{type: 'line', kind: 'meridian', degrees: 0, text: '0° PRIME MERIDIAN', at: 0.2}]};
    const primitive = shotToPrimitive(shot, {places, research, datasets});
    assert.deepEqual(primitive.annotations[0], {type: 'line', kind: 'meridian', degrees: 0, text: '0° PRIME MERIDIAN', at: 0.2, reverse: false});
    // Some other number is still refused.
    assert.throws(() => shotToPrimitive({...shot, annotations: [{...shot.annotations[0], text: '37° LINE'}]}, {places, research, datasets}), /states 37/);
  });

  it('sounds like a trace', () => {
    const events = planMapSoundEvents([{id: 'a', beat: 'hook', durationSeconds: 5, primitive: {...base, annotations: [{type: 'line', kind: 'meridian', degrees: 0, at: 0.4}]}} as any]);
    assert.deepEqual(events.map((event) => event.cue), ['trace']);
  });
});

describe('places in frame when they appear', () => {
  const places = new Map<string, any>([
    ['country:MDG', {id: 'country:MDG', kind: 'country', name: 'Madagascar', bbox: [43, -26, 51, -12], label: [46.7, -19.4]}],
    ['country:IND', {id: 'country:IND', kind: 'country', name: 'India', bbox: [68, 7, 97, 36], label: [78.5, 22.5]}],
  ]);
  const boxes = new Map<string, [number, number, number, number]>();
  const shot = (camera: object[], annotations: object[]) => ({kind: 'geo-map', camera, highlights: [], annotations}) as any;

  it('flags a label the camera has not reached yet when it appears', () => {
    const slow = shot([{target: {bbox: [40, -28, 54, -10]}, at: 0}, {target: {bbox: [40, -28, 100, 38]}, at: 1}], [{type: 'label', anchor: 'country:IND', text: 'INDIA', at: 0.2}]);
    assert.deepEqual(offFramePlaces(slow, places, boxes).map((place: any) => place.id), ['country:IND']);
  });

  it('accepts it once the camera has moved there in time', () => {
    const early = shot([{target: {bbox: [40, -28, 54, -10]}, at: 0}, {target: {bbox: [40, -28, 100, 38]}, at: 0.2}], [{type: 'label', anchor: 'country:IND', text: 'INDIA', at: 0.5}]);
    assert.deepEqual(offFramePlaces(early, places, boxes), []);
  });

  it('counts a world framing as showing everything', () => {
    assert.deepEqual(offFramePlaces(shot([{target: 'world', at: 0}], [{type: 'label', anchor: 'country:IND', text: 'INDIA', at: 0.1}]), places, boxes), []);
  });
});


describe('the shot reviewer', () => {
  const lesotho = {draft: read('drafts/geographica/lesotho-enclave.json'), research: read('research/geographica/lesotho-enclave.json')};
  const undirected = {...lesotho.draft, scenes: lesotho.draft.scenes.map(({primitive, ...scene}: any) => scene)};
  const good = fs.readFileSync(path.join(root, 'test/fixtures/geo-director/lesotho-enclave.reply.json'), 'utf8');

  it('sends a scene it finds weak back for another try, with its problem and fix', async () => {
    const calls: any[] = [];
    const firstId = undirected.scenes[1].id;
    let judged = 0;
    const complete = async (prompt: any) => {
      calls.push(prompt);
      if (isReviewer(prompt)) return JSON.stringify({scenes: judged++ === 0 ? [{id: firstId, ok: false, problem: 'It never shows the border.', fix: 'Trace the border.'}] : []});
      return good;
    };
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete});
    const retry = calls.find((prompt) => !isReviewer(prompt) && prompt.messages.length > 1);
    assert.ok(retry, 'the director was asked again');
    assert.match(retry.messages.at(-1).content, new RegExp(`Scene "${firstId}" is weak as a picture: It never shows the border\\. Trace the border\\.`));
    assert.deepEqual(result.fallbacks, []);
  });

  it('describes a shot in words a reviewer can judge', () => {
    const places = new Map<string, any>([['country:LSO', {id: 'country:LSO', kind: 'country', name: 'Lesotho', bbox: [27, -31, 30, -28]}]]);
    const shot = {kind: 'geo-map', camera: [{target: 'country:LSO', at: 0}], highlights: [{entity: 'country:LSO', style: 'fill', at: 0.2}],
      annotations: [{type: 'label', anchor: 'country:LSO', text: 'LESOTHO', at: 0.3}, {type: 'line', kind: 'meridian', degrees: 0, text: 'PRIME MERIDIAN', at: 0.4}, {type: 'timeline', steps: [{label: '1867'}, {label: 'TODAY'}], active: 0, at: 0.5}]} as any;
    const text = describeShot(shot, places, new Map([['country:LSO', [27, -31, 30, -28]]]));
    assert.match(text, /camera: Lesotho/);
    assert.match(text, /lit: Lesotho \(fill\)/);
    assert.match(text, /label: "LESOTHO" on Lesotho/);
    assert.match(text, /meridian line at 0° "PRIME MERIDIAN"/);
    assert.match(text, /timeline: \[1867\] · TODAY/);
  });

  it('changes nothing when the reviewer fails or answers nonsense', async () => {
    const answers = [good, 'not json', good];
    const result = await directGeoVisuals({draft: undirected, research: lesotho.research, geo, complete: async (prompt: any) => (isReviewer(prompt) ? 'oops, not json' : good)});
    assert.deepEqual(result.fallbacks, []);
    assert.deepEqual(result.weakShots, []);
    assert.ok(answers.length > 0);
  });
});

describe('label clutter', () => {
  const label = (anchor: string, text: string) => ({type: 'label', anchor, text, at: 0.3});
  const shot = (annotations: object[]) => ({kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations}) as any;
  it('allows a few labels spread over places', () => {
    assert.equal(labelClutter(shot([label('country:MDG', 'MADAGASCAR'), label('country:MOZ', 'AFRICA'), label('country:IND', 'INDIA')])), null);
  });
  it('flags labels piled on one place, and too many in a scene', () => {
    assert.match(labelClutter(shot([label('country:MDG', 'A'), label('country:MDG', 'B'), label('country:MDG', 'C')]))!, /country:MDG carries more than 2 labels/);
    assert.match(labelClutter(shot([label('country:MDG', 'A'), label('country:MOZ', 'B'), label('country:IND', 'C'), label('country:TZA', 'D')]))!, /4 labels and markers is too many/);
  });
  it('ignores lines, arrows and text-free markers', () => {
    assert.equal(labelClutter(shot([{type: 'marker', anchor: 'country:MDG', at: 0}, {type: 'marker', anchor: 'country:MDG', at: 0}, {type: 'marker', anchor: 'country:MDG', at: 0}, {type: 'line', kind: 'meridian', degrees: 0, at: 0}])), null);
  });
});

describe('plate reconstructions in a shot', () => {
  const geoWithPlates = loadGeoData(root);
  const base = {kind: 'geo-map', camera: [{target: {bbox: [28, -30, 62, 8]}, at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
  const recon = {type: 'reconstruction', entities: ['country:MDG'], from: 180, at: 0.1, until: 0.9};

  it('accepts one, filling in the defaults, and refuses one that does not run forward in time', () => {
    const parsed = primitiveSchema.parse({...base, annotations: [recon]}) as any;
    assert.deepEqual(parsed.annotations[0], {...recon, fixed: 'country:ZAF', to: 0});
    assert.equal(primitiveSchema.safeParse({...base, annotations: [{...recon, from: 0, to: 0}]}).success, false);
    assert.equal(primitiveSchema.safeParse({...base, annotations: [{...recon, from: 10, to: 50}]}).success, false);
  });

  it('checks that every place rides on a plate the model covers, and that they differ from the fixed one', async () => {
    const problems = (annotation: object) => geoProblems(primitiveSchema.parse({...base, annotations: [annotation]}) as any, geoWithPlates);
    assert.deepEqual(problems(recon), []);
    assert.match(problems({...recon, entities: ['country:CHN']})[0], /not on a plate the reconstruction model covers/);
    assert.match(problems({...recon, entities: ['country:TZA']})[0], /same plate as country:ZAF/);
  });

  it('lets the director state the ages, and keeps the places it was given', () => {
    const lesotho = geoResearchSchema.parse(read('research/geographica/lesotho-enclave.json'));
    const {places, datasets} = resolveResearchPlaces(lesotho, geo);
    const withMadagascar = new Map(places).set('country:MDG', geo.entities.get('country:MDG') as any);
    const primitive = shotToPrimitive({camera: [{target: 'world', at: 0}], annotations: [{...recon, text: '180 MYA'}]}, {places: withMadagascar, research: lesotho, datasets});
    assert.equal((primitive.annotations[0] as any).from, 180);
    assert.throws(() => shotToPrimitive({camera: [{target: 'world', at: 0}], annotations: [{...recon, text: '90 MYA', entities: ['country:MDG']}]}, {places: withMadagascar, research: lesotho, datasets}), /states 90/);
  });

  it('does not let a drifting place also be highlighted, labelled or pointed at', () => {
    const conflicts = (extra: object) => reconstructionConflicts(primitiveSchema.parse({...base, ...extra, annotations: [recon, ...((extra as any).annotations ?? [])]}) as any);
    assert.deepEqual(conflicts({}), []);
    assert.deepEqual(conflicts({highlights: [{entity: 'country:MDG', style: 'fill', at: 0.2}]}), ['country:MDG']);
    assert.deepEqual(conflicts({annotations: [{type: 'label', anchor: 'country:MDG', text: 'MADAGASCAR', at: 0.3}]}), ['country:MDG']);
    assert.deepEqual(conflicts({highlights: [{entity: 'country:MOZ', style: 'outline', at: 0.2}]}), []);
  });

  it('asks the camera to hold the whole journey, from the oldest position to today', () => {
    const places = new Map<string, any>([['country:MDG', geoWithPlates.entities.get('country:MDG') as any], ['country:ZAF', geoWithPlates.entities.get('country:ZAF') as any]]);
    const boxes = new Map<string, [number, number, number, number]>();
    const shot = (bbox: number[]) => primitiveSchema.parse({...base, camera: [{target: {bbox}, at: 0}], annotations: [recon]}) as any;
    assert.equal(unframedJourneys(shot([44, -26, 51, -12]), places, boxes, geoWithPlates).length, 1, 'tight on today\'s Madagascar misses where it started');
    assert.equal(unframedJourneys(shot([28, -30, 62, 8]), places, boxes, geoWithPlates).length, 0);
  });

  it('credits the plate model in the episode, and blocks release without the credit', () => {
    const manifest = read('videos/geographica/lesotho-enclave/video.json');
    const reconstructing = {...manifest, scenes: manifest.scenes.map((scene: any, index: number) => (index === 0 ? {...scene, primitive: {...scene.primitive, annotations: [...scene.primitive.annotations.slice(0, 3), {...recon, fixed: 'country:ZAF'}]}} : scene))};
    assert.ok(publishBlockers({...reconstructing, rights: {...manifest.rights, releaseStatus: 'cleared', publicReleaseApproved: true}}, geo).some((blocker: string) => blocker.startsWith('plate-model:')));
    const credited = {...reconstructing.rights, releaseStatus: 'cleared', publicReleaseApproved: true, assets: [...reconstructing.rights.assets, plateRightsAsset(geoWithPlates)]};
    assert.ok(!publishBlockers({...reconstructing, rights: credited}, geo).some((blocker: string) => blocker.startsWith('plate-model:')));
    assert.match(plateRightsAsset(geoWithPlates).notes, /Müller et al\. \(2016\).*CC BY 4\.0/);
  });
});

describe('map devices', () => {
  const scene = (primitive: object) => ({id: 's', primitive: {kind: 'geo-map', camera: [], highlights: [], annotations: [], ...primitive}});
  const lines = [{type: 'line', degrees: 0, at: .1}, {type: 'ring', center: 'country:FRA', radiusKm: 5, at: .1}, {type: 'timeline', steps: [], active: 0, at: .1}];

  it('counts what a scene does beyond highlights and labels', async () => {
    const {mapDevices} = await import('../scripts/lib/map-variety.mjs');
    assert.deepEqual([...mapDevices(scene({annotations: [{type: 'label'}, {type: 'arrow'}]}).primitive)], []);
    assert.deepEqual([...mapDevices(scene({annotations: lines, data: {view: 'bubbles'}, surface: {kind: 'flood'}, morph: true, streets: {city: 'x'}, flags: true, globe: true}).primitive)].sort(), ['data-bubbles', 'flags', 'globe', 'line', 'morph', 'ring', 'streets', 'surface-flood', 'timeline']);
  });

  it('asks an episode that is all highlights and labels for more, and says which fit', async () => {
    const {mapDeviceProblems} = await import('../scripts/lib/map-variety.mjs');
    const plain = {scenes: [scene({globe: true}), ...Array.from({length: 5}, () => scene({annotations: [{type: 'label'}]}))]};
    const [problem] = mapDeviceProblems(plain);
    assert.match(problem, /looks like every other episode/);
    assert.match(problem, /Use at least 3 more/);
    assert.match(problem, /"truesize"/);
    assert.match(problem, /Do not add one the narration does not call for/);
  });

  it('is content with three different devices, not counting the globe or flags', async () => {
    const {mapDeviceProblems} = await import('../scripts/lib/map-variety.mjs');
    const filler = Array.from({length: 4}, () => scene({}));
    assert.deepEqual(mapDeviceProblems({scenes: [scene({globe: true, flags: true}), scene({annotations: lines}), ...filler]}), []);
    assert.equal(mapDeviceProblems({scenes: [scene({annotations: lines.slice(0, 2)}), scene({globe: true}), ...filler]}).length, 1);
    assert.deepEqual(mapDeviceProblems({scenes: [scene({}), scene({}), scene({})]}), [], 'a short sketch is not held to it');
  });
});
