import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {PRIMITIVE_KINDS, primitiveNumbers, primitiveSchema, primitiveText} from '../scripts/primitive-schema.mjs';
import {runNewEpisode} from '../scripts/lib/new-episode.mjs';
import {researchPokemon} from '../scripts/lib/pokeapi.mjs';
import {checkPrimitive, directVisuals, PRIMITIVE_GUIDE} from '../scripts/lib/visual-director.mjs';
import {assembleDraft} from '../scripts/lib/writer.mjs';
import {videoSchema} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {responses} = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/pokeapi.json'), 'utf8')) as {responses: Record<string, unknown>};
const fetchJson = async (url: string) => structuredClone(responses[url]);
const goodReply = () => JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/writer-zacian.json'), 'utf8'));
const research888 = () => researchPokemon(888, {fetchJson});
const weightBars = {kind: 'bars', unit: 'KG', bars: [{label: 'ZACIAN', value: 110}, {label: 'CROWNED', value: 355}]};
const typeShift = {kind: 'type-shift', from: ['Fairy'], to: ['Fairy', 'Steel']};
const directorSaying = (scenes: unknown[]) => async () => `Plan:\n${JSON.stringify({scenes})}`;

describe('visual primitives', () => {
  it('accepts each documented example and rejects malformed data', () => {
    // Map scenes need resolved places, so the Visual Director is taught geo-map separately (#74).
    assert.deepEqual(PRIMITIVE_GUIDE.map(([kind]) => kind), PRIMITIVE_KINDS.filter((kind) => kind !== 'geo-map'));
    for (const [, , example] of PRIMITIVE_GUIDE) assert.ok(primitiveSchema.safeParse(JSON.parse(example)).success, example);
    assert.equal(primitiveSchema.safeParse({kind: 'type-shift', from: ['Fire'], to: ['Plasma']}).success, false);
    assert.equal(primitiveSchema.safeParse({kind: 'meter', label: 'HP', from: 100, to: 150}).success, false);
    assert.equal(primitiveSchema.safeParse({kind: 'counter', to: 999, label: 'COINS', color: 'gold'}).success, false, 'no unknown keys');
    assert.equal(primitiveSchema.safeParse({kind: 'helix'}).success, false);
    assert.equal(primitiveSchema.safeParse({kind: 'meter', label: 'HP', from: 100, to: 50, threshold: 25}).success, false, 'threshold never crossed');
    assert.equal(primitiveSchema.safeParse({kind: 'meter', label: 'HP', from: 100, to: 50, thresholdLabel: 'ZEN'}).success, false, 'label without threshold');
    assert.equal(primitiveSchema.safeParse({kind: 'meter', label: 'HP', from: 50, to: 50}).success, false, 'meter must move');
    assert.equal(primitiveSchema.safeParse({kind: 'meter', label: 'HP', from: 20, to: 80, threshold: 80}).success, true, 'rising, threshold at the end');
  });

  it('lists the numbers and words each primitive states', () => {
    assert.deepEqual(primitiveNumbers({kind: 'meter', label: 'HP', from: 100, to: 50, threshold: 50}), [100, 50, 50]);
    assert.deepEqual(primitiveNumbers({kind: 'bars', bars: [{label: 'ATK', from: 140, value: 30}, {label: 'SPA', value: 140}]}), [30, 140, 140]);
    assert.equal(primitiveText({kind: 'type-shift', from: ['Fire'], to: ['Fire', 'Psychic']}), 'Fire becomes Fire/Psychic');
    assert.equal(primitiveText({kind: 'checklist', items: [{label: 'TRADE', met: false}, {label: '999 COINS', met: true}]}), 'no: TRADE, yes: 999 COINS');
  });

  it('carries primitives from the draft into a valid manifest (the Gimmighoul and Darmanitan episodes)', () => {
    const kinds = (id: string) => {
      const manifest = videoSchema.parse(JSON.parse(fs.readFileSync(path.join(root, `videos/pokepulses/${id}/video.json`), 'utf8')));
      return Object.fromEntries(manifest.scenes.filter((scene) => scene.primitive).map((scene) => [scene.id, scene.primitive!.kind]));
    };
    assert.deepEqual(kinds('gimmighoul-999'), {'not-normal': 'checklist', coins: 'counter', evolution: 'timeline'});
    assert.deepEqual(kinds('darmanitan-555'), {'hp-drop': 'meter', transform: 'type-shift', stats: 'bars'});
  });
});

describe('primitive fact check', () => {
  it('accepts researched numbers and types, and the bounds of a meter or counter', async () => {
    const research = await research888();
    assert.deepEqual(checkPrimitive(primitiveSchema.parse(weightBars), research), []);
    assert.deepEqual(checkPrimitive(primitiveSchema.parse(typeShift), research), []);
    assert.deepEqual(checkPrimitive(primitiveSchema.parse({kind: 'meter', label: 'POWER', from: 0, to: 100}), research), []);
  });

  it('rejects numbers and types the research does not have', async () => {
    const research = await research888();
    assert.deepEqual(checkPrimitive(primitiveSchema.parse({kind: 'counter', to: 1000, label: 'YEARS'}), research), ['states 1000, which is not in the research']);
    assert.deepEqual(checkPrimitive(primitiveSchema.parse({kind: 'meter', label: 'HP', from: 100, to: 37, threshold: 37}), research), ['states 37, which is not in the research', 'states 37, which is not in the research']);
    assert.deepEqual(checkPrimitive(primitiveSchema.parse({kind: 'type-shift', from: ['Fairy'], to: ['Dragon']}), research), ["names the Dragon type, which Zacian's line never has"]);
  });
});

describe('visual director', () => {
  it('assigns valid primitives, rejects the rest, and recompiles', async () => {
    const research = await research888();
    const {draft} = assembleDraft(goodReply(), research);
    const result = await directVisuals({draft, research, complete: directorSaying([
      {id: 'weight', primitive: weightBars, why: 'The weight jump is the story.'},
      {id: 'crowned', primitive: typeShift, why: 'A type is added.'},
      {id: 'metal', primitive: {kind: 'counter', to: 5000, label: 'PARTICLES'}},
      {id: 'verdict', primitive: weightBars},
      {id: 'weight', primitive: typeShift},
      {id: 'sword', primitive: weightBars},
      {id: 'hook', primitive: {kind: 'helix'}},
    ])});
    assert.deepEqual(result.assigned.map((item) => [item.id, item.kind]), [['weight', 'bars'], ['crowned', 'type-shift']]);
    assert.equal(result.assigned[0].why, 'The weight jump is the story.');
    assert.deepEqual(result.rejected.map((item) => item.id), ['metal', 'verdict', 'weight', 'sword', 'hook']);
    assert.match(result.rejected[0].reason, /counter states 5000, which is not in the research/);
    assert.match(result.rejected[1].reason, /last scene/);
    assert.match(result.rejected[2].reason, /names this scene more than once/);
    assert.match(result.rejected[3].reason, /no such scene/);
    assert.equal(result.draft.scenes.find((scene) => scene.id === 'weight')!.primitive!.kind, 'bars');
    assert.equal(result.manifest.scenes.find((scene) => scene.id === 'weight')!.primitive!.kind, 'bars');
    assert.equal(draft.scenes.find((scene) => scene.id === 'weight')!.primitive, undefined, 'the input draft is not mutated');
  });

  it('leaves the draft alone without a model or when the model fails', async () => {
    const research = await research888();
    const {draft} = assembleDraft(goodReply(), research);
    assert.equal((await directVisuals({draft, research})).draft, draft);
    const failed = await directVisuals({draft, research, complete: async () => { throw new Error('overloaded'); }});
    assert.deepEqual([failed.draft === draft, failed.modelError], [true, 'overloaded']);
    const empty = await directVisuals({draft, research, complete: async () => '{"scenes": "none"}'});
    assert.deepEqual([empty.draft === draft, empty.assigned], [true, []]);
  });

  it('directs the visuals in episode:new and saves them with the draft', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visuals-'));
    const logs: string[] = [];
    const result = await runNewEpisode({
      number: 888, root: dir, verify: null, ideate: null, critique: null, fetchJson, log: (line: string) => logs.push(line),
      complete: async () => JSON.stringify(goodReply()),
      direct: directorSaying([{id: 'weight', primitive: weightBars}, {id: 'metal', primitive: {kind: 'counter', to: 5000, label: 'PARTICLES'}}]),
    });
    assert.deepEqual(result.visuals.assigned.map((item) => item.id), ['weight']);
    const draft = JSON.parse(fs.readFileSync(path.join(dir, 'drafts/pokepulses/zacian-888.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'videos/pokepulses/zacian-888/video.json'), 'utf8'));
    assert.equal(draft.scenes[4].primitive.kind, 'bars');
    assert.equal(manifest.scenes[4].primitive.kind, 'bars');
    assert.ok(logs.some((line) => line === '✓ visuals: weight → bars (1 rejected)'));
    assert.ok(logs.some((line) => /✗ metal: counter states 5000/.test(line)));
  });
});
