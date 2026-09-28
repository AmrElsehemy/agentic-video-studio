import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {calibrateCritic, CREATIVE_CRITERIA, creativeProblems, critiqueDraft, deterministicCritique, referenceStory} from '../scripts/lib/creative-critic.mjs';
import {runNewEpisode} from '../scripts/lib/new-episode.mjs';
import {researchPokemon} from '../scripts/lib/pokeapi.mjs';
import {loadReferences} from '../scripts/lib/references.mjs';
import {assembleDraft, evaluateDraft, writeEpisode} from '../scripts/lib/writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {responses} = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/pokeapi.json'), 'utf8')) as {responses: Record<string, unknown>};
const fetchJson = async (url: string) => structuredClone(responses[url]);
const goodReply = () => JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/writer-zacian.json'), 'utf8'));
const research888 = () => researchPokemon(888, {fetchJson});
const criteria = Object.keys(CREATIVE_CRITERIA);

/** A critic that gives every criterion the same score, or per-criterion overrides. */
const criticScoring = (score: number, overrides: Record<string, number> = {}) => async () => JSON.stringify(Object.fromEntries(criteria.map((criterion) => [criterion, {
  score: overrides[criterion] ?? score,
  quote: `quote for ${criterion}`,
  revision: (overrides[criterion] ?? score) < 5 ? `revise ${criterion}` : '',
}])));

/** The Zacian reply rewritten as a fact list: structurally identical, creatively empty. */
const factListReply = () => {
  const reply = goodReply();
  const lines = ['Zacian is a Fairy type Pokémon.', 'It is known as the Warrior Pokémon.', 'It has a Crowned form as well.', 'It weighs 110 kilograms normally.', 'It is a Legendary Pokémon too.'];
  reply.scenes.slice(1, -1).forEach((scene: {narration: string}, index: number) => {
    scene.narration = lines[index % lines.length];
  });
  return reply;
};

describe('deterministic creative checks', () => {
  it('flags narration that reads as a list of stats', async () => {
    const {draft} = assembleDraft(factListReply(), await research888());
    const [finding] = deterministicCritique(draft);
    assert.equal(finding.criterion, 'escalation');
    assert.match(finding.note, /middle scenes read as stat statements/);
  });

  it('flags a scene that restates another', async () => {
    const {draft} = assembleDraft(goodReply(), await research888());
    draft.scenes[3].narration = draft.scenes[2].narration.replace(/\.$/, ' again.');
    const findings = deterministicCritique(draft);
    assert.ok(findings.some((finding) => finding.criterion === 'variety' && finding.note.includes(`"${draft.scenes[3].id}" repeats scene "${draft.scenes[2].id}"`)));
  });

  it('finds nothing wrong with the curated references or the committed drafts', () => {
    for (const reference of loadReferences()) assert.deepEqual(deterministicCritique(referenceStory(reference)), [], reference.id);
    for (const file of fs.readdirSync(path.join(root, 'drafts/pokepulses'))) {
      assert.deepEqual(deterministicCritique(JSON.parse(fs.readFileSync(path.join(root, 'drafts/pokepulses', file), 'utf8'))), [], file);
    }
  });

  it('handles subject names with regex characters', () => {
    const scenes = ['Hook.', 'Mr. Mime is odd.', 'Which?'].map((narration, index) => ({id: `s${index}`, headline: '', caption: '', narration}));
    assert.equal(deterministicCritique({subject: {name: 'Mr. Mime'}, scenes}).length, 1);
  });
});

describe('creative critic', () => {
  it('passes a strong story and reports per-criterion scores with quotes', async () => {
    const research = await research888();
    const review = await critiqueDraft({draft: assembleDraft(goodReply(), research).draft, research, complete: criticScoring(4, {hook: 5})});
    assert.equal(review.skipped, undefined);
    if (review.skipped) return;
    assert.equal(review.passed, true);
    assert.equal(review.score, 83);
    assert.deepEqual(review.criteria.map((item) => item.criterion), criteria);
    assert.equal(review.criteria[0].quote, 'quote for hook');
    assert.deepEqual(creativeProblems(review), []);
  });

  it('fails a structurally valid fact list, with actionable notes, even when the critic is generous', async () => {
    const research = await research888();
    const {draft} = assembleDraft(factListReply(), research);
    assert.deepEqual(evaluateDraft(draft, research).problems, [], 'passes every production gate');
    const review = await critiqueDraft({draft, research, complete: criticScoring(4)});
    assert.equal(review.passed, false);
    if (review.skipped) return;
    const escalation = review.criteria.find((item) => item.criterion === 'escalation')!;
    assert.deepEqual([escalation.score, escalation.capped], [2, true]);
    const problems = creativeProblems(review);
    assert.match(problems[0], /^Creative escalation scored 2\/5 \("Zacian is a Fairy type Pokémon\."\): .*answer "so what\?"/);
    assert.match(problems.at(-1)!, /Creative score \d+\/100 \(needs 70/);
  });

  it('fails any criterion at the floor even when the total is high', async () => {
    const research = await research888();
    const review = await critiqueDraft({draft: assembleDraft(goodReply(), research).draft, research, complete: criticScoring(5, {question: 2})});
    assert.equal(review.passed, false);
    assert.match(creativeProblems(review)[0], /^Creative question scored 2\/5/);
  });

  it('treats missing criteria as unproven and model failures as not judged', async () => {
    const research = await research888();
    const {draft} = assembleDraft(goodReply(), research);
    const partial = await critiqueDraft({draft, research, complete: async () => JSON.stringify({hook: {score: 5}})});
    if (partial.skipped) assert.fail('should be judged');
    assert.equal(partial.criteria.find((item) => item.criterion === 'payoff')!.score, 3);
    const failed = await critiqueDraft({draft, research, complete: async () => { throw new Error('rate limited'); }});
    assert.deepEqual([failed.skipped, failed.passed, failed.modelError], [true, true, 'rate limited']);
    const none = await critiqueDraft({draft, research});
    assert.deepEqual([none.skipped, none.passed], [true, true]);
  });
});

describe('creative gate in the writer loop', () => {
  it('sends creative notes back to the writer and accepts the revision', async () => {
    const replies = [JSON.stringify(factListReply()), JSON.stringify(goodReply())];
    const writerCalls: {messages: {role: string; content: string}[]}[] = [];
    const complete = async (request: {system: string; messages: {role: string; content: string}[]}) => {
      writerCalls.push(structuredClone(request));
      return replies[writerCalls.length - 1];
    };
    const result = await writeEpisode({research: await research888(), complete, verify: null, critique: criticScoring(4), directing: ''});
    assert.equal(result.attempts, 2);
    assert.equal(result.creative.passed, true);
    assert.match(writerCalls[1].messages.at(-1)!.content, /1\. Creative escalation scored 2\/5/);
  });

  it('saves the creative review in episode:new', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creative-'));
    const logs: string[] = [];
    await runNewEpisode({number: 888, root: dir, verify: null, ideate: null, direct: null, critique: criticScoring(4, {hook: 5}), fetchJson, complete: async () => JSON.stringify(goodReply()), log: (line: string) => logs.push(line)});
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'research/pokepulses/zacian-888.creative.json'), 'utf8'));
    assert.equal(saved.score, 83);
    assert.ok(logs.some((line) => /production 100\/100, creative 83\/100/.test(line)));
    assert.ok(logs.some((line) => /✓ creative: 83\/100 \(weakest: specificity 4\/5, tension 4\/5\)/.test(line)));
  });
});

describe('critic calibration', () => {
  it('requires references to pass and baselines to score below every reference', async () => {
    const [reference] = loadReferences();
    const swablu = JSON.parse(fs.readFileSync(path.join(root, 'drafts/pokepulses/swablu-333.json'), 'utf8'));
    const stories = [
      {label: 'reference', story: referenceStory(reference), expect: 'pass' as const},
      {label: 'swablu', story: swablu, expect: 'lower' as const},
    ];
    const byStory = (scores: Record<string, number>) => async ({messages}: {messages: {content: string}[]}) => criticScoring(messages[0].content.includes('Swablu') ? scores.swablu : scores.reference)();
    assert.equal((await calibrateCritic({stories, complete: byStory({reference: 4, swablu: 3})})).calibrated, true);
    const flat = await calibrateCritic({stories, complete: byStory({reference: 4, swablu: 4})});
    assert.equal(flat.calibrated, false);
    assert.deepEqual(flat.rows.map((row) => row.ok), [true, false]);
  });
});
