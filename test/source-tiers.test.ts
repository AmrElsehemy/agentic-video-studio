import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {verifyDraft} from '../scripts/lib/fact-verifier.mjs';
import {runNewEpisode} from '../scripts/lib/new-episode.mjs';
import {researchPokemon, type Research} from '../scripts/lib/pokeapi.mjs';
import {DEFAULT_TIERS, isHedged, strongestTier, tierOf} from '../scripts/lib/source-tiers.mjs';
import {assembleDraft, buildWriterPrompt, writeEpisode} from '../scripts/lib/writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {responses} = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/pokeapi.json'), 'utf8')) as {responses: Record<string, unknown>};
const fetchJson = async (url: string) => structuredClone(responses[url]);
const goodReply = () => JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/writer-zacian.json'), 'utf8'));

/** Zacian research with one piece of community lore. */
const researchWithLore = async (): Promise<Research> => ({
  ...(await researchPokemon(888, {fetchJson})),
  lore: [{text: 'Fans believe Zacian is based on the wolf of a legendary hero.', source: {label: 'Community wiki', url: 'https://example.com/lore'}}],
});

/** A verifier that gives chosen claims chosen evidence and marks everything supported. */
const verifierCiting = (evidenceFor: (text: string) => string[]) => async ({messages}: {messages: {content: string}[]}) => {
  const claims = JSON.parse(messages[0].content.split('Text to check:\n')[1]) as {id: string; text: string}[];
  return JSON.stringify(claims.map(({id, text}) => ({id, verdict: 'supported', evidence: evidenceFor(text), note: ''})));
};

describe('source tiers', () => {
  it('assigns each research field a tier', async () => {
    const research = await researchWithLore();
    assert.equal(tierOf('types[0]', research), 'official');
    assert.equal(tierOf('pokedexEntries[1].text', research), 'official');
    assert.equal(tierOf('varieties[0].weightKg', research), 'official');
    assert.equal(tierOf('evolutionChain[1].name', research), 'official');
    assert.equal(tierOf('evolutionChain[1].method', research), 'trusted_secondary', 'the more specific pattern wins');
    assert.equal(tierOf('lore[0].text', research), 'community');
    assert.equal(tierOf('somethingNew', research), 'trusted_secondary');
    assert.equal(tierOf('types[0]', {tiers: {official: [], trusted_secondary: [], community: ['types']}}), 'community', 'a research file can override');
  });

  it('takes the strongest tier among the evidence', async () => {
    const research = await researchWithLore();
    assert.equal(strongestTier(['lore[0].text', 'types[0]'], research), 'official');
    assert.equal(strongestTier(['lore[0].text'], research), 'community');
    assert.equal(strongestTier([], research), undefined);
  });

  it('recognises hedged statements', () => {
    for (const text of ['Some fans believe it is based on a wolf.', 'Legend says it slept for ages.', 'It may be the ancestor of all Pokémon.', 'Its DNA is said to contain every code.']) assert.ok(isHedged(text), text);
    for (const text of ['It is based on a wolf.', 'It could break a boulder.', 'Zacian weighs 110 kilograms.']) assert.ok(!isHedged(text), text);
  });

  it('writes tiers, lore and source tiers into research', async () => {
    const research = await researchPokemon(888, {fetchJson});
    assert.deepEqual(research.tiers, DEFAULT_TIERS);
    assert.deepEqual(research.lore, []);
    assert.deepEqual(research.sources.map((source) => source.tier), ['official', 'trusted_secondary', 'trusted_secondary']);
  });

  it('tells the writer how to treat each tier', async () => {
    const {system} = buildWriterPrompt({research: await researchWithLore(), directing: ''});
    assert.match(system, /# Source tiers/);
    assert.match(system, /- official \(name, .*pokedexEntries.*\): official Pokédex text and game data: state it plainly\./);
    assert.match(system, /- community \(lore\): fan lore and theories: never state it as fact/);
  });
});

describe('verifier and tiers', () => {
  it('reports the tier behind each claim', async () => {
    const research = await researchWithLore();
    const {draft} = assembleDraft(goodReply(), research);
    const report = await verifyDraft({draft, research, complete: verifierCiting(() => ['weightKg'])});
    assert.ok(report.claims.every((claim) => claim.tier === 'official'));
    assert.deepEqual(report.unsupported, []);
  });

  it('flags an unhedged claim resting only on community lore, and accepts it hedged', async () => {
    const research = await researchWithLore();
    const {draft} = assembleDraft(goodReply(), research);
    draft.scenes[2].narration = 'Zacian is based on the wolf of a legendary hero.';
    draft.scenes[3].narration = 'Some fans believe Zacian is based on a legendary wolf.';
    const report = await verifyDraft({draft, research, complete: verifierCiting((text) => (/wolf/.test(text) ? ['lore[0].text'] : ['types[0]']))});
    assert.deepEqual(report.unsupported.map((claim) => claim.where), ['scenes.metal.narration']);
    assert.match(report.unsupported[0].note, /Rests only on community sources \(lore\[0\]\.text\).*Hedge it/);
    const hedged = report.claims.find((claim) => claim.where === 'scenes.crowned.narration')!;
    assert.deepEqual([hedged.verdict, hedged.tier], ['supported', 'community']);
  });

  it('sends the community-lore problem back to the writer', async () => {
    const research = await researchWithLore();
    const unhedged = goodReply();
    unhedged.scenes[2].narration = 'Zacian is based on the wolf of a legendary hero.';
    const replies = [JSON.stringify(unhedged), JSON.stringify(goodReply())];
    const calls: {messages: {content: string}[]}[] = [];
    const complete = async (request: {system: string; messages: {role: string; content: string}[]}) => {
      calls.push(structuredClone(request));
      return replies[calls.length - 1];
    };
    const result = await writeEpisode({research, complete, verify: verifierCiting((text) => (/wolf/.test(text) ? ['lore[0].text'] : ['types[0]'])), directing: ''});
    assert.equal(result.attempts, 2);
    assert.match(calls[1].messages.at(-1)!.content, /states it as fact\. Hedge it/);
  });

  it('logs supported claims by tier in episode:new', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiers-'));
    const logs: string[] = [];
    await runNewEpisode({number: 888, root: dir, ideate: null, critique: null, direct: null, fetchJson, complete: async () => JSON.stringify(goodReply()), verify: verifierCiting(() => ['weightKg']), log: (line: string) => logs.push(line)});
    assert.ok(logs.some((line) => /✓ facts: \d+ supported \(\d+ official\)/.test(line)), logs.join('\n'));
  });
});
