import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {diagramActionProblems, diagramActionSchema} from '../scripts/diagram-schema.mjs';
import {archActionProblems} from '../scripts/diagram-arch-schema.mjs';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {resolveActions, withDiagramTimes} from '../scripts/lib/diagram-timing.mjs';
import {wordMatches} from '../scripts/diagram-schema.mjs';
import {archState} from '../src/video/arch/state';
import {dimmed, DIM_DEPTH, emphasisLevel, placeCallout, pulseDots} from '../src/video/canvas/emphasis';
import {calloutBox, canvasState} from '../src/video/diagram/state';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draft = (id: string) => JSON.parse(fs.readFileSync(path.join(root, `drafts/under-the-hood/${id}.json`), 'utf8'));
/** An episode with `actions` added to one scene, compiled and timed as the render props are. */
const withActions = (id: string, sceneId: string, actions: object[], tweak: (raw: any) => void = () => {}) => {
  const raw = draft(id);
  tweak(raw);
  raw.scenes.find((scene: {id: string}) => scene.id === sceneId).primitive.actions.push(...actions);
  return withDiagramTimes(compileEpisode(raw, {showId: 'under-the-hood'}).manifest) as any;
};
const lastFrame = (manifest: any, index: number) => Math.round(manifest.scenes[index].durationSeconds * 30) - 12;

describe('diagram vocabulary: dim, pulse, circle and callouts', () => {
  it('parses the new verbs, with until', () => {
    for (const action of [{do: 'dim', keep: ['qa'], at: .1, until: .8}, {do: 'pulse', edge: 'e8', at: {word: 'checks'}}, {do: 'circle', target: 'qa', at: 'scene-end'}]) {
      assert.ok(diagramActionSchema.safeParse(action).success, JSON.stringify(action));
    }
    assert.ok(!diagramActionSchema.safeParse({do: 'dim', keep: [], at: 0}).success, 'dim keeps at least one element');
  });

  it('checks targets exist and are on screen before they are circled or pulsed', () => {
    const spec = draft('how-avs-works').diagram;
    const scene = (actions: object[]) => [{id: 's', narration: 'the critic checks it', primitive: {kind: 'diagram', actions}}];
    const problems = diagramActionProblems(spec, scene([{do: 'circle', target: 'qa', at: 0}, {do: 'pulse', edge: 'e8', at: 0}, {do: 'dim', keep: ['nowhere'], at: 0}]));
    assert.ok(problems.some((problem: string) => /circles "qa" before it is on screen/.test(problem)));
    assert.ok(problems.some((problem: string) => /pulses along "e8" before it is drawn/.test(problem)));
    assert.ok(problems.some((problem: string) => /names "nowhere", which isn't in the diagram/.test(problem)));
    const arch = draft('url-shortener').diagram;
    const archProblems = archActionProblems(arch, [{id: 's', narration: 'x', primitive: {kind: 'diagram', actions: [{do: 'pulse', edge: 'r1', at: 0}, {do: 'circle', target: 'r1', at: 0}]}}], wordMatches);
    assert.ok(archProblems.some((problem: string) => /pulses along "r1", which isn't an edge/.test(problem)));
    assert.ok(archProblems.some((problem: string) => /circles "r1", which isn't a component/.test(problem)));
  });

  it('times emphasis until its anchor, or the end of the scene', () => {
    const words = [{text: 'the', start: 0, end: .2}, {text: 'critic', start: .3, end: .7}, {text: 'checks', start: 1, end: 1.4}];
    const [dim, pulse] = resolveActions([{do: 'dim', keep: ['qa'], at: {word: 'critic'}, until: {word: 'checks'}}, {do: 'pulse', edge: 'e8', at: .1}], {words, duration: 4});
    assert.deepEqual([dim.start, dim.until], [.24, .94]);
    assert.equal(pulse.until, undefined);
    assert.equal(emphasisLevel(2, {start: .4, end: 1}, 4), 1);
    assert.equal(emphasisLevel(5, {start: .4, end: 1}, 4), 0, 'it fades once its scene is over');
  });

  it('dims everything a laid-out canvas does not keep', () => {
    const manifest = withActions('how-avs-works', 'check', [{do: 'dim', keep: ['remotion', 'qa'], at: .1}]);
    const index = manifest.scenes.findIndex((scene: {id: string}) => scene.id === 'check');
    const state = canvasState(manifest, index, lastFrame(manifest, index), 30);
    assert.equal(state.dim.level, 1);
    assert.equal(dimmed(state.dim, 'qa'), 1);
    assert.equal(dimmed(state.dim, 'planner'), 1 - DIM_DEPTH);
    // The next scene opens undimmed.
    assert.equal(canvasState(manifest, index + 1, 20, 30).dim.level, 0);
  });

  it('streams pulses and draws rings on an architecture', () => {
    const manifest = withActions('url-shortener', 'verdict', [{do: 'pulse', edge: 'e-queue-wh', at: .1}, {do: 'circle', target: 'redis', at: .1}, {do: 'annotate', target: 'redis', text: 'most redirects end here', at: .1}]);
    const index = manifest.scenes.length - 1;
    const state = archState(manifest, index, lastFrame(manifest, index), 30, {width: 1920, height: 1080});
    assert.deepEqual(state.pulses.map((pulse) => pulse.edge), ['e-queue-wh']);
    assert.deepEqual(state.circles.map((ring) => [ring.target, ring.progress]), [['redis', 1]]);
    assert.deepEqual(state.notes.map((note) => note.target), ['redis']);
    const dots = pulseDots(2, 1, 400);
    assert.equal(dots.length, 3);
    assert.ok(dots.every((share) => share >= 0 && share < 1));
  });

  it('places a callout on the clear side of its target, inside the picture', () => {
    const target = {x: 100, y: 100, w: 100, h: 60};
    const bounds = {x: 0, y: 0, w: 1000, h: 600};
    assert.equal(placeCallout(target, {w: 200, h: 60}, [], bounds, 20).box.x, 220, 'right when nothing is there');
    assert.equal(placeCallout(target, {w: 200, h: 60}, [{x: 210, y: 0, w: 300, h: 210}], bounds, 20).box.y, 180, 'below when the right and above are taken');
    const {box} = calloutBox(withActions('how-avs-works', 'check', []).diagram.layout, 'qa', 'blocks a render that fails a check');
    assert.ok(box.x >= 0 && box.w > 100);
  });

  it('leaves episodes without the new verbs exactly as they compiled before', () => {
    for (const id of ['how-avs-works', 'azure-cache-aside', 'url-shortener']) {
      const committed = JSON.parse(fs.readFileSync(path.join(root, `videos/under-the-hood/${id}/video.json`), 'utf8'));
      assert.deepEqual(compileEpisode(draft(id), {showId: 'under-the-hood'}).manifest, committed, id);
    }
  });
});
