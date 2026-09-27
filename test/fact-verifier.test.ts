import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {deterministicCheck, extractClaims, parseJsonReply, resolvePointer, verifyDraft} from '../scripts/lib/fact-verifier.mjs';
import {runNewEpisode} from '../scripts/lib/new-episode.mjs';
import {researchPokemon} from '../scripts/lib/pokeapi.mjs';
import {assembleDraft, writeEpisode} from '../scripts/lib/writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {responses} = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/pokeapi.json'), 'utf8')) as {responses: Record<string, unknown>};
const fetchJson = async (url: string) => structuredClone(responses[url]);
const goodReply = () => JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/writer-zacian.json'), 'utf8'));
const research888 = () => researchPokemon(888, {fetchJson});
const draft888 = async () => assembleDraft(goodReply(), await research888()).draft;

/** A verifier model that marks every claim with the same verdict and evidence. */
const verifierSaying = (verdict: string, evidence: string[] = ['types[0]']) => async ({messages}: {messages: {content: string}[]}) => {
  const claims = JSON.parse(messages[0].content.split('Text to check:\n')[1]) as {id: string}[];
  return `Here you go:\n${JSON.stringify(claims.map(({id}) => ({id, verdict, evidence, note: ''})))}`;
};

describe('fact verifier', () => {
  it('extracts every piece of text with where it lives', async () => {
    const claims = extractClaims(await draft888());
    assert.ok(claims.some((claim) => claim.where === 'scenes.hook.narration'));
    assert.ok(claims.some((claim) => claim.where === 'scenes.weight.facts[0]' && claim.text === '110 KG'));
    assert.ok(claims.every((claim, index) => claim.id === `c${index + 1}`));
  });

  it('resolves evidence pointers into the research', async () => {
    const research = await research888();
    assert.equal(resolvePointer(research, 'types[0]'), 'Fairy');
    assert.equal(resolvePointer(research, 'varieties[0].weightKg'), 355);
    assert.match(String(resolvePointer(research, 'pokedexEntries[0].text')), /legendary hero/);
    assert.equal(resolvePointer(research, 'evolutionChain[4].method'), undefined);
    assert.equal(resolvePointer(research, 'moves[0]'), undefined);
  });

  it('rejects a type the research never mentions, without a model', async () => {
    const research = await research888();
    const result = deterministicCheck({id: 'c1', where: 'scenes.hook.narration', text: 'Zacian is a Steel and Dragon Pokémon.'}, research);
    assert.equal(result?.verdict, 'unsupported');
    assert.match(result!.note, /Dragon type, which appears nowhere/);
    assert.doesNotMatch(result!.note, /Steel and/, 'Steel is in the research (Crowned form)');
  });

  it('catches "Mew is a Steel Pokémon" in a full draft', async () => {
    const draft = await draft888();
    draft.scenes[1].narration = 'Zacian is a Ghost Pokémon that haunts old castles.';
    const report = await verifyDraft({draft, research: await research888()});
    assert.equal(report.unsupported.length, 1);
    assert.equal(report.unsupported[0].where, 'scenes.warrior.narration');
    assert.deepEqual(report.unsupported[0].evidence, ['types']);
  });

  it('uses model verdicts with evidence pointers', async () => {
    const report = await verifyDraft({draft: await draft888(), research: await research888(), complete: verifierSaying('supported')});
    assert.equal(report.unsupported.length, 0);
    assert.equal(report.uncertain.length, 0);
    assert.ok(report.claims.every((claim) => claim.checkedBy === 'model' && claim.evidence[0] === 'types[0]'));
  });

  it('downgrades "supported" with missing or non-existent evidence to uncertain', async () => {
    const research = await research888();
    const draft = await draft888();
    for (const evidence of [[], ['legends[0]']]) {
      const report = await verifyDraft({draft, research, complete: verifierSaying('supported', evidence)});
      assert.equal(report.uncertain.length, report.claims.length);
    }
  });

  it('marks everything uncertain when no model is configured', async () => {
    const report = await verifyDraft({draft: await draft888(), research: await research888()});
    assert.equal(report.uncertain.length, report.claims.length);
    assert.match(report.uncertain[0].note, /no verifier model/);
  });

  it('ignores verdict lists of the wrong shape instead of crashing', async () => {
    for (const reply of ['{"claims": {"c1": "supported"}}', '{"verdicts": "none"}', '"just a string"', '[1, 2, {"id": "c1"}]']) {
      const report = await verifyDraft({draft: await draft888(), research: await research888(), complete: async () => reply});
      assert.equal(report.uncertain.length, report.claims.length, reply);
    }
  });

  it('keeps the rules and marks the rest uncertain when the verifier model fails', async () => {
    const draft = await draft888();
    draft.scenes[1].narration = 'Zacian is a Ghost Pokémon that haunts old castles.';
    const report = await verifyDraft({draft, research: await research888(), complete: async () => 'I cannot help with that.'});
    assert.match(report.modelError!, /did not contain JSON/);
    assert.equal(report.unsupported.length, 1, 'the rule still rejects the false type');
    assert.match(report.uncertain[0].note, /the verifier model failed/);
  });

  it('reads JSON arrays from chatty or fenced replies', () => {
    assert.deepEqual(parseJsonReply('Sure:\n```json\n[{"id": "c1"}]\n```'), [{id: 'c1'}]);
    assert.throws(() => parseJsonReply('no json'), /did not contain JSON/);
  });
});

describe('fact verifier in the writer loop', () => {
  it('sends unsupported claims back to the writer and accepts the fix', async () => {
    const bad = goodReply();
    bad.scenes[1].narration = 'Zacian is a Ghost Pokémon that haunts old castles.';
    const replies = [JSON.stringify(bad), JSON.stringify(goodReply())];
    const sent: string[] = [];
    const result = await writeEpisode({research: await research888(), directing: '', complete: async ({messages}) => {
      sent.push(messages.at(-1)!.content);
      return replies[sent.length - 1];
    }});
    assert.equal(result.attempts, 2);
    assert.match(sent[1], /scenes\.warrior\.narration says "Zacian is a Ghost Pokémon.*research does not support.*Ghost type/);
  });

  it('does not blame the writer when the verifier model fails', async () => {
    const reply = JSON.stringify(goodReply());
    const result = await writeEpisode({research: await research888(), directing: '', complete: async () => reply, verify: async () => { throw new Error('verifier overloaded'); }});
    assert.equal(result.attempts, 1);
    assert.match(result.verification.modelError!, /verifier overloaded/);
  });

  it('saves the verification report and logs uncertain claims', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-'));
    const logs: string[] = [];
    const reply = JSON.stringify(goodReply());
    await runNewEpisode({number: 888, root: dir, fetchJson, complete: async () => reply, ideate: null, verify: verifierSaying('uncertain'), log: (line) => logs.push(line)});
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'research/pokepulses/zacian-888.verification.json'), 'utf8'));
    assert.equal(saved.episodeId, 'zacian-888');
    assert.equal(saved.uncertain.length, saved.claims.length);
    assert.ok(logs.some((line) => /✓ facts: 0 supported, 0 framing, \d+ uncertain/.test(line)));
    assert.ok(logs.some((line) => line.startsWith('    ? scenes.hook.narration')));
  });
});
