import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {geoResearchSchema, type GeoResearch} from '../scripts/geo-research-schema.mjs';
import {directGeoVisuals, resolveResearchPlaces, shotToPrimitive, textNumbers} from '../scripts/lib/geo-director.mjs';
import {loadGeoData} from '../scripts/lib/geo-primitives.mjs';
import {placeKey, resolvePlace, resolvePlaces} from '../scripts/lib/geo-resolver.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const geo = loadGeoData(root);
const georgia = {draft: read('drafts/geographica/georgia-wine.json'), research: read('research/geographica/georgia-wine.json')};
const lesotho = {draft: read('drafts/geographica/lesotho-enclave.json'), research: read('research/geographica/lesotho-enclave.json')};
const reply = (value: unknown) => async () => JSON.stringify(value);
const undirected = (draft: {scenes: object[]}) => ({...draft, scenes: draft.scenes.map(({primitive, ...scene}: any) => scene)});

describe('geo entity resolver', () => {
  it('resolves registry names, ISO codes, Wikidata ids and common aliases', () => {
    assert.equal(placeKey('  The Côte d’Ivoire '), 'cote d ivoire');
    const id = (name: string) => {
      const result = resolvePlace(name, geo);
      return result.status === 'resolved' ? result.id : result.status;
    };
    assert.equal(id('Georgia'), 'country:GEO');
    assert.equal(id('GEO'), 'country:GEO');
    assert.equal(id('Q230'), 'country:GEO');
    assert.equal(id('the Black Sea'), 'water:black-sea');
    assert.equal(id('USA'), 'country:USA');
    assert.equal(id('Ivory Coast'), 'country:CIV');
    assert.equal(id('Vatican City'), 'country:VAT');
  });

  it('reports disputed areas that concern a place', () => {
    const result = resolvePlace('Georgia', geo);
    assert.equal(result.status, 'resolved');
    assert.ok(result.status === 'resolved' && result.review?.some((area) => area.disputed === 'disputed:abkhazia-B35'));
  });

  it('refuses to guess ambiguous or unknown names', () => {
    const {resolved, problems} = resolvePlaces(['Congo', 'Atlantis', 'Lesotho'], geo);
    assert.deepEqual([...resolved.keys()], ['Lesotho']);
    assert.match(problems[0], /"Congo" could be .*country:COD/);
    assert.match(problems[1], /"Atlantis" isn't in the map data/);
  });
});

describe('geography research', () => {
  it('validates both Geographica research files', () => {
    for (const {research} of [georgia, lesotho]) assert.equal(geoResearchSchema.safeParse(research).success, true);
  });

  it('rejects a claim or point citing a missing source', () => {
    const broken = {...lesotho.research, places: {maseru: {...lesotho.research.places.maseru, source: 'nowhere'}}};
    const result = geoResearchSchema.safeParse(broken);
    assert.equal(result.success, false);
    assert.match(JSON.stringify(result.error?.issues), /cites \\"nowhere\\"/);
  });

  it('resolves the subject and regions, adding the disputed areas to review', () => {
    const {subjectId, places, review} = resolveResearchPlaces(geoResearchSchema.parse(georgia.research) as GeoResearch, geo);
    assert.equal(subjectId, 'country:GEO');
    assert.ok(places.has('water:caspian-sea') && places.has('disputed:abkhazia-B35'));
    assert.deepEqual(review.map((item) => item.id), ['country:GEO', 'country:AZE', 'country:RUS']);
  });

  it('stops when the research names a place the map lacks', () => {
    const research = geoResearchSchema.parse({...lesotho.research, regions: ['Congo']}) as GeoResearch;
    assert.throws(() => resolveResearchPlaces(research, geo), /could be/);
  });
});

describe('geo visual director', () => {
  const research = geoResearchSchema.parse(georgia.research) as GeoResearch;
  const {places} = resolveResearchPlaces(research, geo);
  const shot = (value: object) => () => shotToPrimitive({camera: [{target: 'country:GEO', at: 0}], ...value}, {places, research});

  it('turns place ids, named points and "around" framings into a primitive', () => {
    const primitive = shotToPrimitive({
      camera: [{target: 'world', at: 0}, {target: {around: ['country:GEO', 'country:ARM', 'country:AZE']}, at: .5}, {target: {place: 'tbilisi'}, at: .8}],
      highlights: [{entity: 'country:GEO', style: 'trace', at: .1}, {entity: 'disputed:abkhazia-B35', style: 'outline', at: .4}],
      annotations: [{type: 'marker', anchor: {place: 'dig-sites-approx'}, text: 'DIG SITES (APPROX.)', at: .6}, {type: 'arrow', from: {place: 'tbilisi'}, to: {place: 'dig-sites-approx'}, at: .7}],
    }, {places, research});
    const [world, around, point] = primitive.camera;
    assert.equal(world.target, 'world');
    // The box around Georgia, Armenia and Azerbaijan spans all three countries' frames.
    assert.deepEqual(around.target, {bbox: [39.978, 38.399, 50.366, 43.57]});
    assert.deepEqual(point.target, {bbox: [43.817, 40.967, 45.817, 42.467]});
    assert.deepEqual((primitive.annotations[0] as {anchor: unknown}).anchor, {lon: 44.8, lat: 41.3});
  });

  it('rejects coordinates, unlisted places, unlabelled approximate points and unresearched numbers', () => {
    assert.throws(shot({camera: [{target: {bbox: [36, 38, 52, 46]}, at: 0}]}), /isn't one of the episode's places/);
    assert.throws(shot({highlights: [{entity: 'country:FRA', style: 'fill', at: 0}]}), /"country:FRA" isn't one of the episode's places/);
    assert.throws(shot({annotations: [{type: 'label', anchor: 'disputed:abkhazia-B35', text: 'ABKHAZIA', at: 0}]}), /can only be highlighted/);
    assert.throws(shot({annotations: [{type: 'marker', anchor: {place: 'dig-sites-approx'}, text: 'DIG SITES', at: 0}]}), /approximate point/);
    assert.throws(shot({annotations: [{type: 'label', anchor: 'country:GEO', text: '9,000 YEARS OLD', at: 0}]}), /states 9000, which is not in the research/);
    assert.throws(shot({annotations: [{type: 'marker', anchor: {place: 'rome'}, text: 'ROME', at: 0}]}), /no named point "rome"/);
    // Numbers the claims state are fine, however they are written.
    assert.doesNotThrow(shot({annotations: [{type: 'label', anchor: 'country:GEO', text: '6000–5800 BC · 8,000 YRS', at: 0}]}));
    assert.deepEqual(textNumbers('6000–5800 BC, 8,000 years, 1.5 km'), [6000, 5800, 8000, 1.5]);
  });

  it('directs Georgia from a scripted reply, falling back on invalid shots with a reason', async () => {
    const result = await directGeoVisuals({
      draft: undirected(georgia.draft),
      research: georgia.research,
      geo,
      complete: reply({scenes: [
        {id: 'hook', why: 'fly in', camera: [{target: 'world', at: 0}, {target: {around: ['country:GEO', 'country:ARM', 'country:AZE']}, at: .5}, {target: 'country:GEO', at: .85}], highlights: [{entity: 'country:GEO', style: 'fill', at: .8}]},
        {id: 'two-seas', why: 'the seas', camera: [{target: {around: ['water:black-sea', 'water:caspian-sea']}, at: 0, padding: .05}], annotations: [{type: 'label', anchor: 'water:black-sea', text: 'BLACK SEA', at: .1}, {type: 'label', anchor: 'water:caspian-sea', text: 'CASPIAN SEA', at: .3}]},
        {id: 'dig', why: 'the dig', camera: [{target: 'country:GEO', at: 0}, {target: {place: 'tbilisi'}, at: .4}], annotations: [{type: 'marker', anchor: {place: 'tbilisi'}, text: 'TBILISI', at: .4}, {type: 'marker', anchor: {place: 'dig-sites-approx'}, text: 'DIG SITES', at: .6}]},
        {id: 'jars', why: 'invented date', camera: [{target: 'country:GEO', at: 0}], annotations: [{type: 'label', anchor: 'country:GEO', text: '10,000 BC', at: .3}]},
        {id: 'nowhere', camera: [{target: 'country:GEO', at: 0}]},
      ]}),
    });
    assert.deepEqual(result.assigned.map((item) => item.id), ['hook', 'two-seas']);
    const reasons = Object.fromEntries(result.fallbacks.map((item) => [item.id, item.reason]));
    assert.match(reasons.dig, /approximate point/);
    assert.match(reasons.jars, /states 10000/);
    assert.equal(reasons.nowhere, 'no such scene');
    assert.equal(reasons.verdict, 'the model gave no shot');
    // Every scene still has a map, so the episode compiles without artwork.
    assert.ok(result.draft.scenes.every((scene: any) => scene.primitive?.kind === 'geo-map'));
    assert.equal(result.manifest.scenes.length, georgia.draft.scenes.length);
    assert.deepEqual(result.draft.scenes.find((scene: any) => scene.id === 'jars').primitive.annotations, [{type: 'label', anchor: 'country:GEO', text: 'GEORGIA', at: .4}]);
    assert.deepEqual(result.review.map((item) => item.id), ['country:GEO', 'country:AZE', 'country:RUS']);
  });

  it('rebuilds the committed Lesotho draft from its saved reply', async () => {
    const saved = fs.readFileSync(path.join(root, 'test/fixtures/geo-director/lesotho-enclave.reply.json'), 'utf8');
    const result = await directGeoVisuals({draft: undirected(lesotho.draft), research: lesotho.research, geo, complete: async () => saved});
    assert.deepEqual(result.fallbacks, []);
    assert.equal(result.assigned.length, 7);
    assert.deepEqual(result.review, []);
    assert.deepEqual(result.draft, lesotho.draft);
  });

  it('gives every scene the subject map without a model, or when the model fails', async () => {
    const offline = await directGeoVisuals({draft: undirected(lesotho.draft), research: lesotho.research, geo});
    assert.equal(offline.assigned.length, 0);
    assert.ok(offline.fallbacks.every((item) => item.reason === 'no model'));
    assert.deepEqual(offline.draft.scenes[0].primitive.camera.map((key: any) => key.target), ['country:LSO']);
    const failing = await directGeoVisuals({draft: undirected(lesotho.draft), research: lesotho.research, geo, complete: async () => 'no json here'});
    assert.match(failing.modelError ?? '', /JSON/);
    assert.equal(failing.draft.scenes.length, 7);
  });
});
