import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {diagramActionProblems, diagramProblems, diagramSpecSchema, wordMatches} from '../scripts/diagram-schema.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {layoutDiagram, layoutProblems, nodeSize, ranks} from '../scripts/lib/diagram-layout.mjs';
import {resolveActions, WORD_LEAD, withDiagramTimes} from '../scripts/lib/diagram-timing.mjs';
import {videoSchema} from '../src/schema';
import {fitBox, mixViews, viewAt} from '../src/video/canvas/camera';
import {canvasState} from '../src/video/diagram/state';
import {continuesMap} from '../src/video/geo/camera';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draft = () => JSON.parse(fs.readFileSync(path.join(root, 'drafts/under-the-hood/how-avs-works.json'), 'utf8'));
const chain = (ids: string[]) => diagramSpecSchema.parse({
  nodes: ids.map((id) => ({id, label: id.toUpperCase(), kind: 'process'})),
  edges: ids.slice(1).map((id, index) => ({id: `e${index + 1}`, from: ids[index], to: id})),
});

describe('diagram spec', () => {
  it('accepts the prototype episode and finds broken references and loops', () => {
    assert.deepEqual(diagramProblems(diagramSpecSchema.parse(draft().diagram)), []);
    const spec = chain(['a', 'b', 'c']);
    assert.deepEqual(diagramProblems({...spec, edges: [...spec.edges, {id: 'back', from: 'c', to: 'a', style: 'solid'}]}), ['the edges loop back on themselves; feedback edges come with the layered layout (#131)']);
    assert.match(diagramProblems({...spec, edges: [{id: 'x', from: 'a', to: 'zz', style: 'solid'}]}).join(), /points at "zz", which isn't a node/);
    assert.match(diagramProblems({...spec, nodes: [...spec.nodes, {id: 'a', label: 'A', kind: 'user'}]}).join(), /"a" is defined twice/);
  });

  it('checks actions against the spec and the narration', () => {
    const spec = chain(['a', 'b']);
    const scene = (actions: unknown[], narration = 'Here is a planner and a writer.') => [{id: 's', narration, primitive: primitiveSchema.parse({kind: 'diagram', actions})}];
    assert.deepEqual(diagramActionProblems(spec, scene([{do: 'reveal', target: 'a', at: 0}, {do: 'reveal', target: 'b', at: {word: 'planner'}}, {do: 'connect', edge: 'e1', at: {after: 'b'}}])), []);
    assert.match(diagramActionProblems(spec, scene([{do: 'reveal', target: 'a', at: 0}, {do: 'connect', edge: 'e1', at: .5}])).join(), /draws "e1" before "b" is on screen/);
    assert.match(diagramActionProblems(spec, scene([{do: 'highlight', target: 'a', at: 0}])).join(), /highlights "a" before it is on screen/);
    assert.match(diagramActionProblems(spec, scene([{do: 'reveal', target: 'a', at: {word: 'critic'}}])).join(), /waits for "critic", which the narration doesn't say/);
    assert.match(diagramActionProblems(spec, scene([{do: 'reveal', target: 'q', at: 0}])).join(), /names "q", which isn't in the diagram/);
    assert.ok(wordMatches('storyboards', 'storyboard') && wordMatches('Remotion,', 'remotion') && !wordMatches('writing', 'writer') && !wordMatches('art', 'a'));
  });
});

describe('diagram layout', () => {
  it('ranks by longest path and lays a valid, deterministic picture', () => {
    const spec = diagramSpecSchema.parse(draft().diagram);
    assert.deepEqual([...ranks(spec)].filter(([, rank]) => rank === 4).map(([id]) => id), ['voice', 'music']);
    const layout = layoutDiagram(spec);
    assert.deepEqual(layoutProblems(spec, layout), []);
    assert.deepEqual(layoutDiagram(spec), layout);
    assert.ok(layout.nodes.voice.x + layout.nodes.voice.w < layout.nodes.music.x, 'a rank sits side by side');
    assert.equal(layout.edges.e1.points.length, 2, 'aligned nodes get a straight edge');
    assert.equal(layout.edges.e4.points.length, 4, 'offset nodes get an orthogonal elbow');
    assert.ok(layout.groups.assets.y < layout.nodes.voice.y && layout.groups.assets.x < layout.nodes.voice.x);
  });

  it('sizes boxes from their text and reports nodes that run off the canvas', () => {
    assert.equal(nodeSize({id: 'a', label: 'A', kind: 'tool'}).w, 300);
    assert.ok(nodeSize({id: 'a', label: 'A much longer label!!', kind: 'tool'}).w > 300);
    const wide = diagramSpecSchema.parse({nodes: ['a', 'b', 'c', 'd'].map((id) => ({id, label: `${id} long label here`, kind: 'tool'}))});
    assert.match(layoutProblems(wide, layoutDiagram(wide)).join(), /runs off the side of the canvas/);
  });
});

describe('diagram timing', () => {
  const words = [{text: 'Remotion', start: .2, end: .7}, {text: 'renders', start: .7, end: 1.1}, {text: 'it', start: 1.1, end: 1.2}, {text: 'again', start: 1.6, end: 2}];
  it('resolves word, chained, fractional and end anchors to seconds', () => {
    const times = resolveActions([
      {do: 'reveal', target: 'r', at: {word: 'remotion'}},
      {do: 'connect', edge: 'e', at: {after: 'r', delay: .1}},
      {do: 'highlight', target: 'r', at: .5, until: {word: 'again'}},
      {do: 'camera', focus: 'all', at: 'scene-end', dur: 1},
    ], {words, duration: 4});
    assert.deepEqual(times[0], {start: .2 - WORD_LEAD, end: .2 - WORD_LEAD + .7});
    assert.equal(times[1].start, Math.round((times[0].end + .1) * 1000) / 1000);
    assert.deepEqual(times[2], {start: 2, end: 2.35, until: 2.35});
    assert.deepEqual(times[3], {start: 2.8, end: 3.8});
  });

  it('times every diagram scene of a compiled episode', () => {
    const {manifest} = compileEpisode(draft(), {showId: 'under-the-hood'});
    const timed = withDiagramTimes(manifest) as {scenes: {id: string; durationSeconds: number; diagramTimes: {start: number; end: number}[]; primitive: {actions: unknown[]}}[]};
    for (const scene of timed.scenes) {
      assert.equal(scene.diagramTimes.length, scene.primitive.actions.length);
      for (const time of scene.diagramTimes) assert.ok(time.start >= 0 && time.end <= scene.durationSeconds + 1e-9, scene.id);
    }
    assert.ok(videoSchema.safeParse(timed).success);
  });
});

describe('planar camera', () => {
  it('fits boxes, caps the zoom and keeps zooming even', () => {
    assert.deepEqual(fitBox({x: 0, y: 0, w: 1000, h: 100}, {width: 1000, height: 1000}, 0), {x: 500, y: 50, scale: 1});
    assert.equal(fitBox({x: 0, y: 0, w: 10, h: 10}, {width: 1000, height: 1000}).scale, 1.6);
    const [a, b] = [{x: 0, y: 0, scale: 1}, {x: 100, y: 0, scale: 4}];
    assert.equal(mixViews(a, b, .5).scale, 2);
    assert.deepEqual(mixViews(a, b, 1), b);
    assert.deepEqual(mixViews(a, {...b, scale: 1}, .25), {x: 25, y: 0, scale: 1});
    const moves = [{view: a, start: 0, end: 1}, {view: b, start: 2, end: 3}];
    assert.deepEqual(viewAt(moves, 1.5, b), a);
    assert.deepEqual(viewAt(moves, 5, a), b);
  });
});

describe('diagram canvas state', () => {
  const {manifest} = compileEpisode(draft(), {showId: 'under-the-hood'});
  const timed = withDiagramTimes(manifest);
  const index = (id: string) => timed.scenes.findIndex((scene: {id: string}) => scene.id === id);

  it('builds on the previous scenes, as one continuous canvas', () => {
    assert.ok(timed.scenes.every((_: unknown, i: number) => i === 0 || continuesMap(timed.scenes, i)));
    const opening = canvasState(timed, index('write'), 0, 30);
    assert.deepEqual(Object.keys(opening.nodes).filter((id) => opening.nodes[id].progress > 0).sort(), ['planner', 'prompt']);
    assert.equal(opening.nodes.writer.progress, 0, 'what comes later in the scene waits, unseen');
    assert.ok(opening.nodes.prompt.progress === 1 && opening.nodes.planner.progress === 1);
    assert.equal(opening.edges.e1.progress, 1);
    const end = canvasState(timed, timed.scenes.length - 1, Math.round(timed.scenes.at(-1)!.durationSeconds * 30) - 1, 30);
    assert.equal(Object.keys(end.nodes).length, 9, 'the closing frame shows every node');
    assert.ok(Object.values(end.edges).every((edge) => edge.progress === 1 && edge.highlight > 0));
  });

  it('reveals a group with its members and is a pure function of the frame', () => {
    const assets = index('assets');
    const later = canvasState(timed, assets, Math.round(timed.scenes[assets].durationSeconds * 30) - 1, 30);
    assert.equal(later.groups.assets.progress, 1);
    assert.equal(later.nodes.voice.anim, 'fade');
    assert.deepEqual(canvasState(timed, assets, 40, 30), canvasState(timed, assets, 40, 30));
  });
});
