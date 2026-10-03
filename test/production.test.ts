import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {createCompletion} from '../scripts/lib/llm.mjs';
import {appendProduction, modelCost, modelEntry, readProduction, summarizeProduction, type ProductionEntry} from '../scripts/lib/production.mjs';

const prices = {checked: '2026-10-03', models: {'claude-opus-5-5': {inputPerMillion: 4, outputPerMillion: 20}, 'gpt-5.6-terra': {inputPerMillion: 2, outputPerMillion: 12}}, speech: {'gpt-4o-mini-tts': {perMinute: .015}}};
const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'production-'));
const reply = (body: unknown) => async () => new Response(JSON.stringify(body), {status: 200, headers: {'content-type': 'application/json'}});
const claude = (text: string, input: number, output: number) => reply({content: [{type: 'text', text}], stop_reason: 'end_turn', usage: {input_tokens: input, output_tokens: output}});
const openai = (text: string, input: number, output: number) => reply({choices: [{message: {content: text}, finish_reason: 'stop'}], usage: {prompt_tokens: input, completion_tokens: output}});

describe('production log', () => {
  it('hears the token usage of every model call, from either provider', async () => {
    const calls: ProductionEntry[] = [];
    const writer = createCompletion({role: 'writer', provider: 'anthropic', apiKey: 'k', env: {}, fetchImpl: claude('draft', 12000, 3000) as typeof fetch, onUsage: (usage) => calls.push(modelEntry(usage))});
    const critic = createCompletion({role: 'critic', provider: 'openai', apiKey: 'k', env: {}, fetchImpl: openai('ok', 5000, 400) as typeof fetch, onUsage: (usage) => calls.push(modelEntry(usage))});
    assert.equal(await writer({system: 's', messages: [{role: 'user', content: 'go'}]}), 'draft');
    assert.equal(await critic({system: 's', messages: [{role: 'user', content: 'go'}]}), 'ok');
    assert.deepEqual(calls, [
      {kind: 'model', role: 'writer', provider: 'anthropic', model: 'claude-opus-5-5', inputTokens: 12000, outputTokens: 3000},
      {kind: 'model', role: 'critic', provider: 'openai', model: 'gpt-5.6-terra', inputTokens: 5000, outputTokens: 400},
    ]);
  });

  it('builds a complete log for a scripted episode run and totals it', async () => {
    const root = tempRoot();
    const calls: ProductionEntry[] = [];
    // A scripted episode:new: the writer twice, the verifier and critic once each.
    for (const [role, input, output] of [['writer', 10000, 2000], ['writer', 11000, 2100], ['verifier', 6000, 300], ['critic', 7000, 500]] as const) {
      await createCompletion({role, provider: 'anthropic', apiKey: 'k', env: {}, fetchImpl: claude('{}', input, output) as typeof fetch, onUsage: (usage) => calls.push(modelEntry(usage))})({system: 's', messages: [{role: 'user', content: 'go'}]});
    }
    const clock = ['2026-10-03T10:00:00.000Z', '2026-10-03T10:00:01.000Z', '2026-10-03T10:00:02.000Z', '2026-10-03T10:00:03.000Z', '2026-10-03T11:00:00.000Z', '2026-10-03T11:30:00.000Z', '2026-10-03T12:00:00.000Z'];
    const now = () => clock.shift()!;
    appendProduction(root, 'pokepulses', 'ivysaur-002', calls, {now});
    // The pipeline: approval, paid narration, a render.
    appendProduction(root, 'pokepulses', 'ivysaur-002', [{kind: 'approval', what: 'paid narration'}], {now});
    appendProduction(root, 'pokepulses', 'ivysaur-002', [{kind: 'narration', provider: 'openai', model: 'gpt-4o-mini-tts', voice: 'marin', characters: 420, seconds: 30, scenes: 6}], {now});
    appendProduction(root, 'pokepulses', 'ivysaur-002', [{kind: 'render', seconds: 190.5, narration: 'yes'}], {now});

    const log = readProduction(root, 'pokepulses', 'ivysaur-002');
    assert.equal(log.entries.length, 7);
    assert.equal(log.entries[0].at, '2026-10-03T10:00:00.000Z');
    assert.ok(fs.existsSync(path.join(root, 'analytics', 'pokepulses', 'ivysaur-002.production.json')));

    const summary = summarizeProduction(log, {prices});
    assert.deepEqual(summary.models.writer, {calls: 2, inputTokens: 21000, outputTokens: 4100, cost: .166, models: ['claude-opus-5-5']});
    assert.equal(summary.models.verifier.calls, 1);
    assert.deepEqual(summary.narration, {characters: 420, seconds: 30, cost: .0075, providers: ['openai (gpt-4o-mini-tts)']});
    assert.deepEqual(summary.renders, {count: 1, lastSeconds: 190.5});
    assert.deepEqual(summary.approvals, [{what: 'paid narration', date: '2026-10-03'}]);
    // 21000×4 + 4100×20 + 6000×4 + 300×20 + 7000×4 + 500×20 = 234,000 → $0.234, plus $0.0075 narration.
    assert.equal(summary.cost, .2415);
    assert.deepEqual(summary.unpriced, []);
  });

  it('logs a model without a price, says so, and leaves it out of the cost', () => {
    const log = {episodeId: 'x', show: 'pokepulses', entries: [{at: '2026-10-03T10:00:00Z', ...modelEntry({role: 'writer', provider: 'openai', model: 'mystery-model', inputTokens: 100, outputTokens: 100})}]};
    const summary = summarizeProduction(log, {prices});
    assert.equal(summary.models.writer.calls, 1);
    assert.equal(summary.cost, 0);
    assert.deepEqual(summary.unpriced, ['writer: mystery-model']);
    assert.equal(modelCost({model: 'claude-opus-5-5', inputTokens: null, outputTokens: 10}, prices), null);
  });

  it('counts local narration as free, and reads reviews from the manifest', () => {
    const log = {episodeId: 'x', show: 'geographica', entries: [{at: '2026-10-03T10:00:00Z', kind: 'narration' as const, provider: 'local', characters: 300, seconds: 20, scenes: 7}]};
    const summary = summarizeProduction(log, {prices, manifest: {rights: {bordersReview: {reviewer: 'Amr Elsehemy', date: '2026-10-03'}}}});
    assert.equal(summary.narration.cost, 0);
    assert.deepEqual(summary.approvals, [{what: 'borders review', date: '2026-10-03', by: 'Amr Elsehemy'}]);
  });

  it('adds nothing when there is nothing to log', () => {
    const root = tempRoot();
    appendProduction(root, 'pokepulses', 'x', []);
    assert.equal(fs.existsSync(path.join(root, 'analytics', 'pokepulses', 'x.production.json')), false);
  });
});
