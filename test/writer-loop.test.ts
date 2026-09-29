import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {CREATIVE_CRITERIA} from '../scripts/lib/creative-critic.mjs';
import {runNewEpisode} from '../scripts/lib/new-episode.mjs';
import {researchPokemon} from '../scripts/lib/pokeapi.mjs';
import {patchLines, writeEpisode} from '../scripts/lib/writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {responses} = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/pokeapi.json'), 'utf8')) as {responses: Record<string, unknown>};
const fetchJson = async (url: string) => structuredClone(responses[url]);
const goodReply = () => JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/writer-zacian.json'), 'utf8'));
const research888 = () => researchPokemon(888, {fetchJson});
type Request = {system: string; messages: {role: string; content: string}[]};

/** A writer that returns each reply in turn and records every request. */
const scripted = (replies: string[]) => {
  const calls: Request[] = [];
  const complete = async (request: Request) => {
    calls.push(structuredClone(request));
    const reply = replies[calls.length - 1];
    if (reply === undefined) throw new Error('Scripted writer ran out of replies');
    return reply;
  };
  return {complete, calls};
};

/** A verifier that marks claims containing `bad` unsupported and the rest supported. */
const verifierRejecting = (bad: RegExp) => async ({messages}: {messages: {content: string}[]}) => {
  const claims = JSON.parse(messages[0].content.split('Text to check:\n')[1]) as {id: string; text: string}[];
  return JSON.stringify(claims.map(({id, text}) => bad.test(text)
    ? {id, verdict: 'unsupported', evidence: [], note: 'Not in the research.'}
    : {id, verdict: 'supported', evidence: ['types[0]'], note: ''}));
};
const critic = (score: number) => {
  const calls: unknown[] = [];
  const complete = async (request: unknown) => {
    calls.push(request);
    return JSON.stringify(Object.fromEntries(Object.keys(CREATIVE_CRITERIA).map((criterion) => [criterion, {score, quote: 'q', revision: ''}])));
  };
  return {complete, calls};
};

describe('patching single lines', () => {
  it('replaces top-level and scene lines, and drops emptied facts labels', () => {
    const reply = goodReply();
    const hook = reply.scenes[0].id;
    const withFacts = reply.scenes.find((scene: {facts?: string[]}) => (scene.facts?.length ?? 0) >= 2);
    const {creative, unknown} = patchLines(reply, {
      payoff: 'New payoff.',
      [`scenes.${hook}.caption`]: 'NEW CAPTION',
      [`scenes.${withFacts.id}.facts[0]`]: '',
      'scenes.nope.caption': 'x',
      [`scenes.${hook}.facts[9]`]: 'x',
    });
    assert.equal(creative.payoff, 'New payoff.');
    assert.equal(creative.scenes[0].caption, 'NEW CAPTION');
    assert.deepEqual(creative.scenes.find((scene: {id: string}) => scene.id === withFacts.id).facts, withFacts.facts.slice(1));
    assert.deepEqual(unknown, ['scenes.nope.caption', `scenes.${hook}.facts[9]`]);
    assert.equal(reply.payoff, goodReply().payoff, 'the original is untouched');
  });
});

describe('writer loop', () => {
  it('repairs a few unsupported lines of an approved story without rewriting it', async () => {
    const bad = goodReply();
    bad.payoff = 'A totally invented payoff.';
    const {complete, calls} = scripted([JSON.stringify(bad), JSON.stringify({payoff: goodReply().payoff})]);
    const story = critic(4);
    const result = await writeEpisode({research: await research888(), complete, verify: verifierRejecting(/invented/), critique: story.complete, directing: ''});
    assert.equal(result.attempts, 2);
    assert.deepEqual(result.repaired, ['payoff']);
    assert.equal(result.draft.payoff, goodReply().payoff);
    assert.equal(story.calls.length, 1, 'the approved story is not judged again');
    assert.match(calls[1].messages.at(-1)!.content, /Only these lines are not supported[\s\S]*payoff says "A totally invented payoff\."/);
  });

  it('sends fact and story problems back together', async () => {
    const bad = goodReply();
    bad.payoff = 'A totally invented payoff.';
    const {complete, calls} = scripted([JSON.stringify(bad), JSON.stringify(goodReply())]);
    let judged = 0;
    const critique = async () => {
      const first = judged++ === 0;
      return JSON.stringify(Object.fromEntries(Object.keys(CREATIVE_CRITERIA).map((criterion) => [criterion, {score: first && criterion === 'surprise' ? 2 : 4, quote: 'q', revision: ''}])));
    };
    const result = await writeEpisode({research: await research888(), complete, verify: verifierRejecting(/invented/), critique, directing: ''});
    assert.equal(result.attempts, 2);
    const feedback = calls[1].messages.at(-1)!.content;
    assert.match(feedback, /payoff says "A totally invented payoff\."/);
    assert.match(feedback, /Creative surprise scored 2\/5/);
  });

  it('reports the best attempt when every attempt fails', async () => {
    const bad = goodReply();
    bad.payoff = 'A totally invented payoff.';
    const {complete} = scripted(['not json', JSON.stringify(bad)]);
    await assert.rejects(writeEpisode({research: await research888(), complete, verify: verifierRejecting(/invented/), critique: critic(2).complete, directing: '', maxAttempts: 2}), (error: Error & {attempts: number; best: {production: boolean; factProblems: number; score: number}}) => {
      assert.equal(error.attempts, 2);
      assert.deepEqual([error.best.production, error.best.factProblems, error.best.score], [true, 1, 40]);
      return true;
    });
  });
});

describe('revision history', () => {
  it('sends only the brief, the latest draft and its problems, however many revisions', async () => {
    const drafts = [1, 2, 3].map((n) => ({...goodReply(), title: `Draft ${n}`, scenes: []}));
    const {complete, calls} = scripted([...drafts.map((draft) => JSON.stringify(draft)), JSON.stringify(goodReply())]);
    const result = await writeEpisode({research: await research888(), complete, directing: '', maxAttempts: 4});
    assert.equal(result.attempts, 4);
    assert.deepEqual(calls.map((call) => call.messages.length), [1, 3, 3, 3]);
    assert.deepEqual(calls[3].messages[0], calls[0].messages[0], 'the brief is always first');
    assert.match(calls[3].messages[1].content, /Draft 3/);
    assert.doesNotMatch(JSON.stringify(calls[3].messages), /Draft 1|Draft 2/);
  });
});

describe('episode:new writer budget', () => {
  it('stops at the budget and saves the closest draft', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-'));
    const angle = (id: string) => ({id, hook: `hook ${id}`, premise: `premise ${id}`, archetype: 'profile', evidence: ['pokedexEntries[0].text'], visualIdea: 'art'});
    const score = (id: string) => ({id, uniqueness: 5, surprise: 4, specificity: 4, visual: 4, support: 5, note: ''});
    const ideate = async (request: {system: string}) => request.system.includes('You find angles')
      ? JSON.stringify([angle('a'), angle('b'), angle('c')])
      : JSON.stringify({scores: [score('a'), score('b'), score('c')], choice: 'a'});
    const logs: string[] = [];
    const writerCalls: unknown[] = [];
    const complete = async () => {
      writerCalls.push(1);
      const reply = goodReply();
      reply.storyPattern = 'profile';
      return JSON.stringify(reply);
    };
    await assert.rejects(runNewEpisode({number: 888, root: dir, fetchJson, complete, ideate, verify: null, critique: critic(2).complete, direct: null, maxAttempts: 2, maxWriterCalls: 3, log: (line: string) => logs.push(line)}));
    assert.equal(writerCalls.length, 3, 'never more writer calls than the budget');
    assert.ok(logs.some((line) => /writer budget spent \(3 calls\)/.test(line)), logs.join('\n'));
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'out/zacian-888.best-attempt.json'), 'utf8'));
    assert.equal(saved.creativeScore, 40);
    assert.ok(saved.draft.scenes.length > 0);
    assert.ok(logs.some((line) => line.includes('out/zacian-888.best-attempt.json')));
  });
});
