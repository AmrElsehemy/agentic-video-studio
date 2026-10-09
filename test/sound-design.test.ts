import assert from 'node:assert/strict';
import test from 'node:test';
import {cueForScene, MAP_CUE_SPACING, MAP_CUES_PER_SCENE, planMapSoundEvents, planSoundEvents, sceneEnergy} from '../scripts/lib/sound-design.mjs';

test('sound design follows story beats', () => {
  assert.equal(cueForScene({beat: 'hook'}), 'impact');
  assert.equal(cueForScene({beat: 'evidence'}), 'whoosh');
  assert.equal(cueForScene({beat: 'escalation'}), 'riser');
  assert.equal(cueForScene({beat: 'reveal'}), 'reveal');
  assert.equal(cueForScene({beat: 'payoff'}), 'impact');
  assert.equal(cueForScene({beat: 'verdict'}), 'chime');
  assert.equal(cueForScene({role: 'interaction'}), 'chime');
});

test('sound events land at scene boundaries', () => {
  const events = planSoundEvents([
    {id: 'hook', beat: 'hook', durationSeconds: 4},
    {id: 'clue', beat: 'evidence', durationSeconds: 5.5},
    {id: 'reveal', beat: 'reveal', durationSeconds: 3},
  ]);
  assert.deepEqual(events.map(({sceneId, time, cue}) => ({sceneId, time, cue})), [
    {sceneId: 'hook', time: 0, cue: 'impact'},
    {sceneId: 'clue', time: 4, cue: 'whoosh'},
    {sceneId: 'reveal', time: 9.5, cue: 'reveal'},
  ]);
});

test('escalation has more bed energy than interaction', () => {
  assert.ok(sceneEnergy({beat: 'escalation'}) > sceneEnergy({beat: 'interaction'}));
});

const mapScene = (id: string, durationSeconds: number, primitive: object) => ({id, beat: 'evidence', durationSeconds, primitive: {kind: 'geo-map', camera: [{target: 'country:LSO', at: 0}], highlights: [], annotations: [], ...primitive}});

test('a map scene sounds what happens on the map, at the time it happens', () => {
  const events = planMapSoundEvents([
    {id: 'a', beat: 'hook', durationSeconds: 4},
    mapScene('b', 5, {
      highlights: [{entity: 'country:LSO', style: 'fill', at: 0.4}],
      annotations: [{type: 'label', anchor: 'country:LSO', text: 'LESOTHO', at: 0.7}],
    }),
  ]);
  assert.deepEqual(events.map(({sceneId, cue, time}) => ({sceneId, cue, time})), [
    {sceneId: 'b', cue: 'swell', time: 4 + 0.4 * 5},
    {sceneId: 'b', cue: 'pop', time: 4 + 0.7 * 5},
  ]);
});

test('map cues follow a scene that narration stretched', () => {
  const shot = {highlights: [{entity: 'country:LSO', style: 'fill', at: 0.5}]};
  const [short] = planMapSoundEvents([mapScene('b', 4, shot)]);
  const [long] = planMapSoundEvents([mapScene('b', 6, shot)]);
  assert.equal(short.time, 2);
  assert.equal(long.time, 3);
});

test('a trace hisses, a data map rises, a route ticks along its journey, a camera change sweeps', () => {
  const events = planMapSoundEvents([mapScene('b', 8, {
    camera: [{target: 'world', at: 0}, {target: 'country:LSO', at: 0.3}, {target: 'country:ZAF', at: 0.8}],
    highlights: [{entity: 'country:LSO', style: 'trace', at: 0.1}],
    annotations: [{type: 'route', path: ['country:LSO', 'country:ZAF'], at: 0.5, until: 0.9, follow: false}],
    data: {label: 'Height', values: [], at: 0.95},
  })]);
  const cues = events.map((event) => event.cue);
  for (const cue of ['trace', 'sweep', 'travel', 'rise'] as const) assert.ok(cues.includes(cue), `${cue} in ${cues.join(',')}`);
  assert.ok(cues.filter((cue) => cue === 'travel').length >= 2);
});

test('map cues are thinned so they never rattle, and capped per scene', () => {
  const crowded = mapScene('b', 6, {
    highlights: [0, 0.01, 0.02, 0.03].map((at) => ({entity: 'country:LSO', style: 'fill', at})),
    annotations: Array.from({length: 4}, (_, index) => ({type: 'label', anchor: 'country:LSO', text: 'X', at: 0.1 + index * 0.25})),
  });
  const events = planMapSoundEvents([crowded]);
  assert.ok(events.length <= MAP_CUES_PER_SCENE);
  for (let i = 1; i < events.length; i++) assert.ok(events[i].time - events[i - 1].time >= MAP_CUE_SPACING - 1e-9);
});

test('scenes without a map, and a camera move that starts with the scene, add no map cues', () => {
  assert.deepEqual(planMapSoundEvents([{id: 'a', beat: 'hook', durationSeconds: 4}]), []);
  assert.deepEqual(planMapSoundEvents([mapScene('b', 4, {camera: [{target: 'world', at: 0}, {target: 'country:LSO', at: 1}]})]), []);
});
