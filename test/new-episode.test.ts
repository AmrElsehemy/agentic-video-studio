import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {compileEpisode, manifestDrift} from '../scripts/lib/compiler.mjs';
import {runNewEpisode} from '../scripts/lib/new-episode.mjs';
import {researchPokemon} from '../scripts/lib/pokeapi.mjs';
import {artworkRights, assembleDraft, buildWriterPrompt, evaluateDraft, factCheck, parseReply, writeEpisode} from '../scripts/lib/writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {responses} = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/pokeapi.json'), 'utf8')) as {responses: Record<string, unknown>};
const fetchJson = async (url: string) => {
  if (!(url in responses)) throw new Error(`No fixture for ${url}`);
  return structuredClone(responses[url]);
};
const goodReply = () => JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/writer-zacian.json'), 'utf8'));
const research888 = () => researchPokemon(888, {fetchJson});

/** A scripted model: returns each reply in turn and records what it was sent. */
const scriptedWriter = (replies: string[]) => {
  const calls: {system: string; messages: {role: string; content: string}[]}[] = [];
  const complete = async (request: {system: string; messages: {role: string; content: string}[]}) => {
    calls.push(structuredClone(request));
    const reply = replies[calls.length - 1];
    if (reply === undefined) throw new Error('Scripted writer ran out of replies');
    return reply;
  };
  return {complete, calls};
};

describe('research', () => {
  it('collects a legendary with an alternate form', async () => {
    const research = await research888();
    assert.equal(research.id, 'zacian-888');
    assert.equal(research.index, '#888');
    assert.equal(research.category, 'Warrior Pokémon');
    assert.equal(research.generation, 'Generation VIII');
    assert.equal(research.isLegendary, true);
    assert.deepEqual(research.types, ['Fairy']);
    assert.equal(research.weightKg, 110);
    assert.deepEqual(research.varieties.map((variety) => [variety.name, variety.types, variety.weightKg]), [['Zacian Crowned', ['Fairy', 'Steel'], 355]]);
  });

  it('keeps English Pokédex entries once each, with clean whitespace', async () => {
    const research = await research888();
    assert.equal(research.pokedexEntries.length, 2);
    assert.ok(research.pokedexEntries.every((entry) => !/[\n\f]/.test(entry.text) && !entry.text.includes('not English')));
  });

  it('follows an evolution chain with its method', async () => {
    const research = await researchPokemon(333, {fetchJson});
    assert.deepEqual(research.evolutionChain.map((member) => [member.name, member.stage, member.isSubject]), [['Swablu', 1, true], ['Altaria', 2, false]]);
    assert.equal(research.evolutionChain[1].evolvesFrom, 'Swablu');
    assert.equal(research.evolutionChain[1].method, 'Level Up, level 35');
  });

  it('cites its sources', async () => {
    const research = await research888();
    assert.ok(research.sources.some((source) => source.url === 'https://www.pokemon.com/us/pokedex/zacian'));
  });

  it('rejects a bad Pokédex number', async () => {
    await assert.rejects(researchPokemon(0, {fetchJson}), /National Pokédex number/);
  });
});

describe('draft assembly', () => {
  it('fills identity, artwork, rights and sources from the research', async () => {
    const research = await research888();
    const {draft, problems} = assembleDraft(goodReply(), research);
    assert.deepEqual(problems, []);
    assert.deepEqual(draft.subject, {name: 'Zacian', category: 'Warrior Pokémon', artworkUrl: research.artworkUrl, identifier: '#888'});
    assert.deepEqual(draft.related.map((item) => [item.name, item.relation, item.identifier]), [['Zacian Crowned', 'form', '#888']]);
    assert.equal(draft.scenes[3].artworkUrl, research.varieties[0].artworkUrl);
    // PokePulses records a legal review of its artwork (shows/pokepulses.json), so the art is approved but unlicensed...
    assert.deepEqual(draft.rights.assets.map((asset) => [asset.licenseStatus, asset.publicReleaseApproved]), [['permission-required', true], ['permission-required', true]]);
    assert.equal(draft.rights.artworkReview?.date, '2026-09-30');
    // ...and the episode itself still waits for a person to approve its release.
    assert.equal(draft.rights.publicReleaseApproved, false);
    assert.equal(draft.rights.releaseStatus, 'internal-prototype');
    assert.deepEqual(draft.sources, research.sources);
  });

  it('orders and labels related subjects in a branched evolution line', async () => {
    const research = await researchPokemon(333, {fetchJson});
    const art = (n: number) => `https://example.com/${n}.png`;
    const member = (name: string, index: string, stage: number, isSubject = false) => ({name, index, stage, types: ['Normal'], artworkUrl: art(stage), isSubject});
    // A made-up line: Base → Middle (the subject), Middle's sibling Branch, → Final.
    research.evolutionChain = [member('Base', '#001', 1), member('Middle', '#002', 2, true), member('Branch', '#003', 2), member('Final', '#004', 3)];
    research.varieties = [];
    const reply = {...goodReply(), scenes: goodReply().scenes.map((scene: {artwork: string}) => ({...scene, artwork: 'Swablu'}))};
    const {draft} = assembleDraft(reply, {...research, name: 'Middle'} as typeof research);
    assert.deepEqual(draft.related.map((item) => [item.name, item.relation]), [['Final', 'evolves-to'], ['Base', 'evolves-from'], ['Branch', 'related']]);
  });

  it('puts later evolutions first so the before/after reveal uses them', async () => {
    const research = await researchPokemon(333, {fetchJson});
    const reply = {...goodReply(), scenes: goodReply().scenes.map((scene: {artwork: string}) => ({...scene, artwork: 'Swablu'}))};
    assert.deepEqual(assembleDraft(reply, research).draft.related.map((item) => [item.name, item.relation]), [['Altaria', 'evolves-to']]);
  });

  it('reports artwork that does not exist', async () => {
    const reply = goodReply();
    reply.scenes[1].artwork = 'Zamazenta';
    const {problems} = assembleDraft(reply, await research888());
    assert.match(problems[0], /artwork "Zamazenta".*Choose one of: Zacian, Zacian Crowned/);
  });

  it('passes every gate for a well-written reply', async () => {
    const research = await research888();
    const {problems, audit} = evaluateDraft(assembleDraft(goodReply(), research).draft, research);
    assert.deepEqual(problems, []);
    assert.equal(audit!.score, 100);
  });
});

describe('fact check', () => {
  it('rejects numbers that are not in the research', async () => {
    const research = await research888();
    const {draft} = assembleDraft(goodReply(), research);
    draft.scenes[2].narration = 'It has guarded the land for 1000 years.';
    draft.scenes[4].facts = ['245 KG GAINED'];
    const problems = factCheck(draft, research);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /number 1000/);
    assert.match(problems[1], /number 245/);
  });

  it('also checks the audience promise and voice instructions', async () => {
    const research = await research888();
    const {draft} = assembleDraft(goodReply(), research);
    draft.audiencePromise = 'Reveal its 7 secret forms.';
    draft.voice.instructions = 'Speak at 150 words per minute.';
    const problems = factCheck(draft, research);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /audiencePromise states the number 7/);
    assert.match(problems[1], /voiceInstructions states the number 150/);
  });

  it('accepts simple counts of types, evolution stages and forms', async () => {
    const research = await research888();
    const {draft} = assembleDraft(goodReply(), research);
    draft.scenes[3].narration = 'Zacian has 2 forms, and its Crowned form has 2 types.';
    assert.deepEqual(factCheck(draft, research), []);
  });

  it('accepts researched numbers, including decimals', async () => {
    const research = await research888();
    const {draft} = assembleDraft(goodReply(), research);
    draft.scenes[1].narration = 'Standing 2.8 meters tall, it weighs 110 kilograms.';
    assert.deepEqual(factCheck(draft, research), []);
  });
});

describe('writer loop', () => {
  it('feeds every problem back and accepts the revision', async () => {
    const bad = goodReply();
    bad.scenes[0].narration = 'This legendary hero from ancient legends more than triples its weight before every single battle.';
    bad.scenes[4].headline = '245 KG HEAVIER';
    const {complete, calls} = scriptedWriter([JSON.stringify(bad), `\`\`\`json\n${JSON.stringify(goodReply())}\n\`\`\``]);
    const result = await writeEpisode({research: await research888(), complete, directing: 'contract'});
    assert.equal(result.attempts, 2);
    assert.equal(result.draft.id, 'zacian-888');
    const feedback = calls[1].messages.at(-1)!.content;
    assert.match(feedback, /rejected/);
    assert.match(feedback, /1\. /);
    assert.match(feedback, /max scene is 6.4s|hook beat allows at most 4.8s/);
    assert.equal(calls[1].messages.length, 3, 'revision request carries the brief, the rejected draft and its problems');
  });

  it('gives up with the remaining problems after the last attempt', async () => {
    const {complete} = scriptedWriter(['not json', '{"title": "x"}']);
    await assert.rejects(writeEpisode({research: await research888(), complete, directing: '', maxAttempts: 2}), (error: Error & {problems: string[]}) => {
      assert.match(error.message, /after 2 attempts/);
      assert.ok(error.problems.length > 0);
      return true;
    });
  });

  it('tells the writer the archetypes, artwork and a forced story shape', async () => {
    const {system} = buildWriterPrompt({research: await research888(), directing: 'CONTRACT', storyPattern: 'mystery'});
    assert.match(system, /CONTRACT/);
    assert.match(system, /- mystery: .*Beats: hook \(1\) → clue \(1-3\)/);
    assert.match(system, /one of: Zacian, Zacian Crowned/);
    assert.match(system, /Use storyPattern "mystery"/);
  });

  it('reads JSON from fenced or chatty replies', () => {
    assert.deepEqual(parseReply('Here you go:\n```json\n{"a": 1}\n```'), {a: 1});
    assert.throws(() => parseReply('no json here'), /did not contain a JSON object/);
  });
});

describe('new episode pipeline', () => {
  const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'new-episode-'));

  it('researches, writes, checks and saves a compiled episode', async () => {
    const dir = tempRoot();
    const {complete} = scriptedWriter([JSON.stringify(goodReply())]);
    const logs: string[] = [];
    const result = await runNewEpisode({number: 888, root: dir, verify: null, ideate: null, critique: null, direct: null, fetchJson, complete, log: (line: string) => logs.push(line)});
    assert.equal(result.id, 'zacian-888');
    const draft = JSON.parse(fs.readFileSync(path.join(dir, 'drafts/pokepulses/zacian-888.json'), 'utf8'));
    const committed = fs.readFileSync(path.join(dir, 'videos/pokepulses/zacian-888/video.json'), 'utf8');
    assert.equal(manifestDrift(compileEpisode(draft, {showId: 'pokepulses'}).manifest, committed), null, 'saved manifest matches its draft');
    assert.ok(fs.existsSync(path.join(dir, 'research/pokepulses/zacian-888.json')));
    assert.ok(logs.some((line) => /attempt 1 passed every check \(production 100\/100\)/.test(line)));
  });

  it('refuses to guess between two cached research files for the same number', async () => {
    const dir = tempRoot();
    fs.mkdirSync(path.join(dir, 'research/pokepulses'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'research/pokepulses/zacian-888.json'), '{}');
    fs.writeFileSync(path.join(dir, 'research/pokepulses/other-888.json'), '{}');
    await assert.rejects(runNewEpisode({number: 888, root: dir, verify: null, ideate: null, critique: null, direct: null, fetchJson, complete: scriptedWriter([]).complete, log: () => {}}), /Several research files match #888/);
  });

  it('reuses cached research and refuses to overwrite a draft', async () => {
    const dir = tempRoot();
    await runNewEpisode({number: 888, root: dir, verify: null, ideate: null, critique: null, direct: null, fetchJson, complete: scriptedWriter([JSON.stringify(goodReply())]).complete, log: () => {}});
    const offline = async () => { throw new Error('network should not be used'); };
    await assert.rejects(runNewEpisode({number: 888, root: dir, verify: null, ideate: null, critique: null, direct: null, fetchJson: offline, complete: scriptedWriter([]).complete, log: () => {}}), /already exists/);
    const again = await runNewEpisode({number: 888, root: dir, verify: null, ideate: null, critique: null, direct: null, fetchJson: offline, complete: scriptedWriter([JSON.stringify(goodReply())]).complete, overwrite: true, log: () => {}});
    assert.equal(again.id, 'zacian-888');
  });
});

describe('artwork rights by show', () => {
  it('leaves art unverified and unapproved for a show without a recorded clearance', () => {
    const {asset, review} = artworkRights('geographica');
    assert.deepEqual([asset.licenseStatus, asset.publicReleaseApproved], ['unverified', false]);
    assert.deepEqual(review, {});
  });
});
