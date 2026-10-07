import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {buildDiagramDirectorPrompt, canvasAfter, directDiagram, repairActions, shotToActions} from '../scripts/lib/diagram-director.mjs';
import {importDrawio} from '../scripts/lib/drawio.mjs';
import {starterDraft} from '../scripts/lib/drawio-draft.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const reply = (id: string) => fs.readFileSync(path.join(root, `test/fixtures/diagram-director/${id}.reply.json`), 'utf8');

type Action = {do: string; target?: string; edge?: string; step?: string; edges?: string[]; focus?: string[] | 'all'; at?: unknown};
type Scene = {id: string; narration: string; primitive: {kind: string; actions: Action[]}};

// Three systems: a laid-out pipeline, an Azure reference architecture drawn with icons, and a plain-box draw.io diagram.
const systems = {
  'how-avs-works': load('drafts/under-the-hood/how-avs-works.json'),
  'azure-cache-aside': load('drafts/under-the-hood/azure-cache-aside.json'),
  'url-shortener': load('drafts/under-the-hood/url-shortener.json'),
};
/** A draft as the writer hands it over: narration, no actions yet. */
const undirected = (draft: {scenes: Scene[]}) => ({...draft, scenes: draft.scenes.map((scene) => ({...scene, primitive: {kind: 'diagram', actions: [{do: 'camera', focus: 'all', at: 0}]}}))});

/** Everything the episode puts on the picture by its end. */
const everything = (spec: {nodes: {id: string}[]; steps?: {id: string}[]}) => [...spec.nodes.map((node) => node.id), ...(spec.steps ?? []).map((step) => step.id)];

describe('diagram director', () => {
  for (const [id, draft] of Object.entries(systems)) {
    it(`directs ${id} from the saved model reply, every scene accepted`, async () => {
      const result = await directDiagram({draft: undirected(draft), complete: async () => reply(id)});
      assert.equal(result.modelError, undefined);
      assert.deepEqual(result.fallbacks, []);
      assert.equal(result.assigned.length, draft.scenes.length);
      assert.equal(result.manifest.scenes.length, draft.scenes.length);
      const shown = canvasAfter(draft.diagram, result.draft.scenes);
      for (const element of everything(draft.diagram)) assert.ok(shown.has(element), `${element} is on the picture by the end`);
    });

    it(`gives ${id} a complete, compiling episode with no model at all`, async () => {
      const result = await directDiagram({draft: undirected(draft)});
      assert.equal(result.assigned.length, 0);
      assert.deepEqual(new Set(result.fallbacks.map((item: {reason: string}) => item.reason)), new Set(['no model']));
      const scenes = result.draft.scenes as Scene[];
      for (const scene of scenes) assert.equal(scene.primitive.actions[0].do, 'camera', `${scene.id} opens on a camera move`);
      // The picture builds up across the episode rather than all at once, and finishes complete.
      const firstScene = canvasAfter(draft.diagram, scenes.slice(0, 1));
      assert.ok(firstScene.size > 0 && firstScene.size < everything(draft.diagram).length / 2, 'the opening shows only the first parts');
      const shown = canvasAfter(draft.diagram, scenes);
      for (const element of everything(draft.diagram)) assert.ok(shown.has(element), `${element} is on the picture by the end`);
      assert.deepEqual(scenes.at(-1)!.primitive.actions[0].focus, 'all', 'the last scene pulls back to the whole picture');
    });
  }

  it('walks each lane in order in the fallback, timed to the words that name the steps', async () => {
    const result = await directDiagram({draft: undirected(systems['url-shortener'])});
    const flows = (result.draft.scenes as Scene[]).flatMap((scene) => scene.primitive.actions.filter((action) => action.do === 'flow').map((action) => ({scene: scene.id, step: action.step!, at: action.at})));
    const order = (lane: string) => flows.filter((flow) => flow.step.startsWith(lane)).map((flow) => flow.step);
    assert.deepEqual(order('r'), ['r1', 'r2', 'r3', 'r4']);
    assert.deepEqual(order('w'), ['w1', 'w2', 'w3']);
    assert.ok(flows.some((flow) => typeof flow.at === 'object'), 'some steps wait for their word');
    // Write steps never land in a scene about the redirect (read) flow.
    for (const flow of flows.filter((item) => item.step.startsWith('w'))) assert.ok(!['open', 'lookup', 'miss'].includes(flow.scene), `${flow.step} is in ${flow.scene}`);
  });

  it('falls back scene by scene, with the reason, when the model breaks a rule', async () => {
    const draft = undirected(systems['how-avs-works']);
    const bad = {scenes: [
      {id: 'hook', actions: [{do: 'reveal', target: 'prompt', at: {word: 'banana'}}]},
      {id: 'plan', actions: [{do: 'reveal', target: 'nowhere', at: 0}]},
      {id: 'write', actions: [{do: 'connect', edge: 'e9', at: 0}]},
      {id: 'storyboard', actions: [{do: 'teleport', target: 'storyboard', at: 0}]},
      {id: 'ghost', actions: [{do: 'camera', focus: 'all', at: 0}]},
    ]};
    const result = await directDiagram({draft, complete: async () => JSON.stringify(bad)});
    const reason = (id: string) => result.fallbacks.find((item: {id: string}) => item.id === id)?.reason ?? '';
    assert.match(reason('hook'), /waits for "banana"/);
    assert.match(reason('plan'), /"nowhere", which isn't in the diagram/);
    assert.match(reason('write'), /draws "e9" before/);
    assert.match(reason('storyboard'), /actions\[0/);
    assert.equal(reason('ghost'), 'no such scene');
    assert.equal(reason('assets'), 'the model gave no actions');
    // The fallbacks still make a complete episode.
    assert.equal(result.manifest.scenes.length, draft.scenes.length);
  });

  it('survives a model that answers with no JSON', async () => {
    const result = await directDiagram({draft: undirected(systems['azure-cache-aside']), complete: async () => 'Sorry, I cannot help.'});
    assert.ok(result.modelError);
    assert.equal(result.assigned.length, 0);
    assert.equal(result.manifest.scenes.length, systems['azure-cache-aside'].scenes.length);
  });

  it('repairs only what is unambiguous, and says so', () => {
    const spec = systems['azure-cache-aside'].diagram;
    const scene = {id: 'hook', narration: 'Every read that hits your database costs time and money.'};
    const {actions, repairs} = repairActions([
      {do: 'reveal', target: 'client', at: {word: 'read', nth: 2}},
      {do: 'highlight', target: 'app', at: {word: 'hits'}},
      {do: 'reveal', target: 'r1', at: {word: 'database'}},
      {do: 'reveal', target: 'cosmos', at: {word: 'money', nth: 3}},
    ], {spec, scene, previous: []});
    assert.deepEqual(actions[0].at, {word: 'read'});
    assert.deepEqual(actions[1], {do: 'reveal', target: 'app', at: {word: 'hits'}});
    assert.equal(actions[2].do, 'flow');
    assert.equal(actions[2].step, 'r1');
    assert.equal(repairs.length, 4);
    // A flow without routes takes its step's own route, and the result passes every check.
    const {primitive} = shotToActions({actions: [{do: 'camera', focus: ['client', 'app'], at: 0}, ...actions]}, {spec, scene, previous: []});
    assert.deepEqual(primitive.actions[3], {do: 'flow', step: 'r1', edges: ['client-app'], at: {word: 'database', nth: 1}});
    // A word the scene never says is not guessed at.
    assert.throws(() => shotToActions({actions: [{do: 'reveal', target: 'client', at: {word: 'cache'}}]}, {spec, scene, previous: []}), /waits for "cache"/);
  });

  it('waits for the first said word of a several-word anchor, keeping a valid nth', () => {
    const spec = systems['azure-cache-aside'].diagram;
    const scene = {id: 'miss', narration: 'On a miss, it reads Cosmos DB, then Cosmos DB again.'};
    const {actions, repairs} = repairActions([
      {do: 'reveal', target: 'cosmos', at: {word: 'Cosmos DB'}},
      {do: 'highlight', target: 'cosmos', at: {word: 'Cosmos DB', nth: 2}},
      {do: 'highlight', target: 'cosmos', at: {word: 'Cosmos DB', nth: 3}},
      {do: 'reveal', target: 'redis', at: {word: 'Azure Redis'}},
    ], {spec, scene, previous: []});
    assert.deepEqual(actions.map((action: Action) => action.at), [{word: 'Cosmos'}, {word: 'Cosmos', nth: 2}, {word: 'Cosmos', nth: 2}, {word: 'Azure Redis'}]);
    assert.ok(repairs.some((repair: string) => /"Cosmos DB" is several words; it waits for "Cosmos"/.test(repair)));
    // A phrase none of whose words is said is left for the checks to reject.
    assert.throws(() => shotToActions({actions: [{do: 'camera', focus: 'all', at: 0}, actions[3]]}, {spec, scene, previous: []}), /waits for "Azure Redis"/);
  });

  it('frames what a scene draws when the model left it out of the camera', () => {
    const spec = systems['url-shortener'].diagram;
    const previous = (systems['url-shortener'].scenes as Scene[]).slice(0, 6);
    const scene = {id: 'analytics', narration: 'The queue is batched into the analytics warehouse, away from the redirect path.'};
    const {actions, repairs} = repairActions([
      {do: 'camera', focus: ['queue'], padding: .2, at: 0},
      {do: 'reveal', target: 'warehouse', at: {word: 'warehouse'}},
      {do: 'flow', step: 'w3', edges: ['e-queue-wh'], at: {after: 'warehouse'}},
    ], {spec, scene, previous});
    assert.deepEqual(actions[0].focus, ['queue', 'warehouse', 'w3']);
    assert.match(repairs.join('\n'), /framed "warehouse", "w3" too/);
    // A wide shot already frames everything.
    assert.deepEqual(repairActions([{do: 'camera', focus: 'all', at: 0}, {do: 'reveal', target: 'warehouse', at: 0}], {spec, scene, previous}).repairs, []);
  });

  it('directs a freshly imported draw.io diagram (placeholder narration) with no model', async () => {
    const {spec} = importDrawio(fs.readFileSync(path.join(root, 'test/fixtures/drawio/url-shortener.drawio'), 'utf8'), {file: 'url-shortener.drawio'});
    const draft = starterDraft({id: 'imported', title: 'How a URL Shortener Works', show: systems['url-shortener'].show, spec, file: 'url-shortener.drawio'});
    const result = await directDiagram({draft});
    assert.equal(result.manifest.scenes.length, draft.scenes.length);
  });

  it('tells the model the ids, the scenes and the rules, never coordinates', () => {
    const {system, messages} = buildDiagramDirectorPrompt({draft: systems['url-shortener'], showId: 'under-the-hood'});
    const content = messages[0].content;
    for (const id of ['user', 'cdn', 'api', 'net', 'r1', 'w3', 'e-api-redis']) assert.match(content, new RegExp(`- ${id} \\(`));
    assert.match(content, /"narration": "Opening a short link starts at the CDN edge/);
    assert.match(system, /"flow"/);
    assert.match(system, /Never write coordinates/);
    assert.doesNotMatch(content, /"at": \[/);
    // A laid-out diagram has no steps to walk.
    assert.doesNotMatch(buildDiagramDirectorPrompt({draft: systems['how-avs-works']}).system, /"do": "flow"/);
  });
});
