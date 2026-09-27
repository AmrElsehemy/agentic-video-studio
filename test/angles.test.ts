import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {describeAngle, findAngle, isGeneric, MIN_ANGLE_SCORE, rankCandidates, validateCandidates} from '../scripts/lib/angles.mjs';
import {runNewEpisode} from '../scripts/lib/new-episode.mjs';
import type {Research} from '../scripts/lib/pokeapi.mjs';
import {buildWriterPrompt, writeEpisode} from '../scripts/lib/writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {responses} = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/pokeapi.json'), 'utf8')) as {responses: Record<string, unknown>};
const fetchJson = async (url: string) => structuredClone(responses[url]);
const goodReply = () => JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/writer-zacian.json'), 'utf8'));

const art = 'https://example.com/art.png';
const gimmighoul: Research = {
  schemaVersion: 1,
  id: 'gimmighoul-999',
  number: 999,
  index: '#999',
  name: 'Gimmighoul',
  slug: 'gimmighoul',
  category: 'Coin Chest Pokémon',
  generation: 'Generation IX',
  isLegendary: false,
  isMythical: false,
  types: ['Ghost'],
  heightMeters: 0.3,
  weightKg: 5,
  artworkUrl: art,
  pokedexEntries: [{game: 'Scarlet', text: 'This Pokémon was born inside a treasure chest about 1,500 years ago.'}],
  evolutionChain: [
    {name: 'Gimmighoul', index: '#999', stage: 1, types: ['Ghost'], artworkUrl: art, isSubject: true},
    {name: 'Gholdengo', index: '#1000', stage: 2, evolvesFrom: 'Gimmighoul', method: 'Level Up, 999 Gimmighoul Coins', types: ['Steel', 'Ghost'], artworkUrl: art, isSubject: false},
  ],
  varieties: [],
  sources: [],
};

const coins = {id: 'coins', premise: 'Pokémon #999 needs 999 coins to evolve into #1000.', hook: 'This Pokémon needs 999 coins to evolve.', archetype: 'mechanic', evidence: ['evolutionChain[1].method', 'evolutionChain[1].index'], visualIdea: 'A coin counter climbing to 999.'};
const ghostType = {id: 'ghost-type', premise: 'Gimmighoul is a Ghost-type Pokémon.', hook: 'Meet a spooky Ghost-type.', archetype: 'profile', evidence: ['types[0]', 'category'], visualIdea: 'Gimmighoul in the dark.'};
const score = (id: string, [uniqueness, surprise, specificity, visual, support]: number[], note = '') => ({id, uniqueness, surprise, specificity, visual, support, note});

type Request = {system: string; messages: {role: string; content: string}[]};
/** Scripted models routed by role (generator, critic, writer), recording each request. */
const scripted = (replies: {generator?: unknown[]; critic?: unknown[]; writer?: unknown[]}) => {
  const calls: Record<string, Request[]> = {generator: [], critic: [], writer: []};
  const complete = async (request: Request) => {
    const role = request.system.includes('You find angles') ? 'generator' : request.system.includes('creative director of PokePulses') ? 'critic' : 'writer';
    calls[role].push(structuredClone(request));
    const reply = replies[role as keyof typeof replies]?.[calls[role].length - 1];
    if (reply === undefined) throw new Error(`Scripted ${role} ran out of replies`);
    return typeof reply === 'string' ? reply : JSON.stringify(reply);
  };
  return {complete, calls};
};

describe('angle candidates', () => {
  it('treats angles resting only on fields every Pokémon has as generic', () => {
    assert.equal(isGeneric(['types[0]', 'category']), true);
    assert.equal(isGeneric(['evolutionChain[1].types[0]']), true);
    assert.equal(isGeneric(['types[0]', 'evolutionChain[1].method']), false);
    assert.equal(isGeneric(['pokedexEntries[0].text']), false);
  });

  it('drops broken evidence and rejects unusable candidates', () => {
    const {candidates, rejected} = validateCandidates([
      {...coins, evidence: ['evolutionChain[1].method', 'evolutionChain[7].method']},
      {...ghostType, id: 'no-evidence', evidence: ['moves[0]']},
      {...coins, id: 'bad-shape', archetype: 'documentary'},
      {...coins},
      {id: 'incomplete'},
    ], gimmighoul);
    assert.deepEqual(candidates.map((candidate) => [candidate.id, candidate.evidence, candidate.generic]), [['coins', ['evolutionChain[1].method'], false]]);
    assert.deepEqual(rejected.map((item) => item.id), ['no-evidence', 'bad-shape', 'coins', 'incomplete']);
    assert.match(rejected[0].reason, /none of its evidence exists/);
    assert.match(rejected[1].reason, /unknown story shape "documentary"/);
    assert.equal(rejected[2].reason, 'duplicate id');
  });

  it('applies a forced story shape to every candidate', () => {
    const {candidates} = validateCandidates([coins, ghostType], gimmighoul, {storyPattern: 'mystery'});
    assert.deepEqual(candidates.map((candidate) => candidate.archetype), ['mystery', 'mystery']);
  });
});

describe('angle critic', () => {
  it('caps the uniqueness of a generic angle, whatever the critic says', () => {
    const {candidates} = validateCandidates([ghostType, coins], gimmighoul);
    const ranked = rankCandidates(candidates, {scores: [score('ghost-type', [5, 5, 5, 5, 5]), score('coins', [5, 5, 4, 4, 5])], choice: 'ghost-type'});
    assert.deepEqual(ranked.map((candidate) => [candidate.id, candidate.total]), [['coins', 23], ['ghost-type', 22]]);
    assert.equal(ranked[1].scores.uniqueness, 2);
    assert.match(ranked[1].note, /capped at 2/);
  });

  it("breaks ties with the critic's choice and ignores malformed scores", () => {
    const {candidates} = validateCandidates([coins, {...coins, id: 'gholdengo'}], gimmighoul);
    const ranked = rankCandidates(candidates, {scores: [score('coins', [4, 4, 4, 4, 4]), score('gholdengo', [4, 4, 4, 4, 4]), {id: 'coins', uniqueness: 9}], choice: 'gholdengo'});
    assert.deepEqual(ranked.map((candidate) => candidate.id), ['gholdengo', 'coins']);
    assert.deepEqual(rankCandidates(candidates, 'nonsense'), []);
  });
});

describe('finding an angle', () => {
  it('chooses the coin count for Gimmighoul, not "a Ghost-type Pokémon"', async () => {
    const {complete, calls} = scripted({
      generator: [[ghostType, coins]],
      critic: [{scores: [score('ghost-type', [4, 3, 4, 4, 5]), score('coins', [5, 5, 5, 5, 5])], choice: 'coins'}],
    });
    const {chosen, rounds} = await findAngle({research: gimmighoul, generate: complete});
    assert.equal(chosen.id, 'coins');
    assert.equal(chosen.archetype, 'mechanic');
    assert.equal(chosen.belowBar, undefined);
    assert.equal(rounds.length, 1);
    assert.doesNotMatch(calls.critic[0].messages[0].content, /"generic"/, 'the critic judges angles, not our flags');
  });

  it('asks for stronger angles when none reaches the bar, passing on the feedback', async () => {
    const {complete, calls} = scripted({
      generator: [`Sure:\n${JSON.stringify([ghostType])}`, {angles: [coins]}],
      critic: [
        {scores: [score('ghost-type', [2, 2, 2, 3, 5])], choice: 'ghost-type', request: 'Find the rule that makes it unique.'},
        {scores: [score('coins', [5, 5, 5, 4, 5])], choice: 'coins'},
      ],
    });
    const {chosen, rounds} = await findAngle({research: gimmighoul, generate: complete});
    assert.equal(chosen.id, 'coins');
    assert.equal(rounds.length, 2);
    assert.ok(rounds[0].candidates.every((candidate) => 'total' in candidate && candidate.total < MIN_ANGLE_SCORE));
    const retry = calls.generator[1].messages[0].content;
    assert.match(retry, /Find the rule that makes it unique/);
    assert.match(retry, /"Gimmighoul is a Ghost-type Pokémon\." scored 14\/25/);
  });

  it('uses the best angle found, marked below the bar, when rounds run out', async () => {
    const {complete} = scripted({
      generator: [[ghostType], 'not json'],
      critic: [{scores: [score('ghost-type', [3, 3, 3, 3, 3])], choice: 'ghost-type'}],
    });
    const {chosen, rounds} = await findAngle({research: gimmighoul, generate: complete});
    assert.equal(chosen.id, 'ghost-type');
    assert.equal(chosen.belowBar, true);
    assert.match(rounds[1].error!, /angle generator failed/);
  });

  it('fails clearly when no round produces a scored angle', async () => {
    const {complete} = scripted({generator: [[{...coins, evidence: ['moves[0]']}], [coins]], critic: ['{}']});
    await assert.rejects(findAngle({research: gimmighoul, generate: complete}), (error: Error) => {
      assert.match(error.message, /Could not find an angle after 2 rounds/);
      assert.match(error.message, /round 1: No usable angles: coins \(none of its evidence exists/);
      assert.match(error.message, /round 2: The angle critic scored none of the candidates/);
      return true;
    });
  });

  it('can use a different model as the critic', async () => {
    const generator = scripted({generator: [[coins]]});
    const critic = scripted({critic: [{scores: [score('coins', [5, 5, 5, 5, 5])], choice: 'coins'}]});
    await findAngle({research: gimmighoul, generate: generator.complete, critique: critic.complete});
    assert.equal(generator.calls.critic.length, 0);
    assert.equal(critic.calls.critic.length, 1);
  });
});

describe('writing from an angle', () => {
  it('briefs the writer with the angle, its resolved evidence and its story shape', () => {
    const {system} = buildWriterPrompt({research: gimmighoul, directing: '', angle: coins});
    assert.match(system, /# The angle/);
    assert.match(system, /Premise: Pokémon #999 needs 999 coins/);
    assert.match(system, /- evolutionChain\[1\]\.method: "Level Up, 999 Gimmighoul Coins"/);
    assert.match(system, /Use storyPattern "mechanic"/);
    assert.equal(describeAngle(coins, gimmighoul).split('\n').at(-1), '- evolutionChain[1].index: "#1000"');
  });

  it("rejects a draft that ignores the angle's story shape", async () => {
    const research = await import('../scripts/lib/pokeapi.mjs').then(({researchPokemon}) => researchPokemon(888, {fetchJson}));
    const angle = {...coins, evidence: ['varieties[0].weightKg'], archetype: 'mechanic'};
    const {complete} = scripted({writer: [goodReply(), {...goodReply(), storyPattern: 'mechanic'}]});
    await assert.rejects(writeEpisode({research, complete, verify: null, directing: '', angle, maxAttempts: 1}), /storyPattern is "transformation", but this episode must use "mechanic"/);
    // With the matching shape the same reply passes.
    const ok = scripted({writer: [goodReply()]});
    const result = await writeEpisode({research, complete: ok.complete, verify: null, directing: '', angle: {...angle, archetype: 'transformation'}});
    assert.equal(result.attempts, 1);
  });

  it('finds an angle, saves it with the research and writes to it in episode:new', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'angles-'));
    const crowned = {id: 'crowned', premise: 'Zacian more than triples its weight when it takes up its sword.', hook: 'This hero triples its weight to fight.', archetype: 'transformation', evidence: ['weightKg', 'varieties[0].weightKg'], visualIdea: 'A weight meter jumping from 110 to 355 kg.'};
    const {complete, calls} = scripted({
      generator: [[crowned]],
      critic: [{scores: [score('crowned', [5, 4, 5, 5, 5])], choice: 'crowned'}],
      writer: [goodReply()],
    });
    const logs: string[] = [];
    const result = await runNewEpisode({number: 888, root: dir, verify: null, fetchJson, complete, log: (line: string) => logs.push(line)});
    assert.equal(result.angle!.id, 'crowned');
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'research/pokepulses/zacian-888.angles.json'), 'utf8'));
    assert.equal(saved.chosen.id, 'crowned');
    assert.equal(saved.rounds[0].candidates[0].total, 24);
    assert.match(calls.writer[0].system, /Premise: Zacian more than triples its weight/);
    assert.match(calls.writer[0].messages[0].content, /## Darmanitan \(transformation\)/, 'references follow the angle\'s story shape');
    assert.ok(logs.some((line) => /✓ angle: "Zacian more than triples its weight.*\[transformation, 24\/25\]/.test(line)));
  });
});
