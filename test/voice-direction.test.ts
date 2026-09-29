import assert from 'node:assert/strict';
import test from 'node:test';
import {buildVoiceInstructions, sceneDelivery} from '../scripts/lib/voice-direction.mjs';

test('voice direction', async (t) => {
  await t.test('changes delivery by story beat', () => {
    assert.match(sceneDelivery({beat: 'hook'}), /punch and intrigue/i);
    assert.match(sceneDelivery({beat: 'reveal'}), /tiny pause/i);
    assert.match(sceneDelivery({beat: 'payoff'}), /satisfied and decisive/i);
    assert.match(sceneDelivery({beat: 'verdict'}), /genuinely conversational question/i);
    assert.notEqual(sceneDelivery({beat: 'hook'}), sceneDelivery({beat: 'payoff'}));
  });

  await t.test('combines house voice with scene-specific performance direction', () => {
    const instructions = buildVoiceInstructions({
      baseInstructions: 'Fast expressive creator.',
      scene: {beat: 'escalation'},
    });
    assert.match(instructions, /Fast expressive creator\./);
    assert.match(instructions, /short-form creator performance/i);
    assert.match(instructions, /Increase urgency and energy slightly/i);
    assert.match(instructions, /not narration read from a page/i);
  });

  await t.test('falls back to role and then generic delivery', () => {
    assert.match(sceneDelivery({role: 'interaction'}), /viewer’s opinion/i);
    assert.match(sceneDelivery({}), /never fall into neutral TTS cadence/i);
  });
});
