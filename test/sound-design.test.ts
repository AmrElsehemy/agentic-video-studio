import assert from 'node:assert/strict';
import test from 'node:test';
import {cueForScene, planSoundEvents, sceneEnergy} from '../scripts/lib/sound-design.mjs';

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
