import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {archetypes} from '../scripts/archetypes.mjs';
import {runNewEpisode} from '../scripts/lib/new-episode.mjs';
import {researchPokemon} from '../scripts/lib/pokeapi.mjs';
import {loadReferences, selectReferences} from '../scripts/lib/references.mjs';
import {buildWriterPrompt} from '../scripts/lib/writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {responses} = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/pokeapi.json'), 'utf8')) as {responses: Record<string, unknown>};
const fetchJson = async (url: string) => structuredClone(responses[url]);
const references = loadReferences();

describe('creative references', () => {
  it('loads the curated winners, not Swablu', () => {
    const ids = references.map((reference) => reference.id);
    for (const id of ['bulbasaur-001', 'darmanitan-555', 'gimmighoul-999']) assert.ok(ids.includes(id), id);
    assert.ok(!ids.includes('swablu-333'));
  });

  it('explains a missing references folder', () => {
    assert.throws(() => loadReferences(path.join(root, 'no-such-folder')), /Creative references folder not found/);
  });

  it('only names archetypes that exist', () => {
    for (const reference of references) {
      for (const archetype of reference.archetypes) assert.ok(archetype in archetypes, `${reference.id} names unknown archetype ${archetype}`);
    }
  });

  it('points at a real source episode', () => {
    for (const reference of references) assert.ok(fs.existsSync(path.join(root, reference.source)), reference.source);
  });

  it('selects references by archetype', () => {
    assert.deepEqual(selectReferences(references, 'mechanic').map((reference) => reference.id), ['gimmighoul-999']);
    assert.deepEqual(selectReferences(references, 'transformation').map((reference) => reference.id), ['darmanitan-555']);
    assert.deepEqual(selectReferences(references, 'profile').map((reference) => reference.id), ['bulbasaur-001']);
  });

  it('falls back to the whole library when no reference matches or no shape is forced', () => {
    assert.equal(selectReferences(references, 'mystery').length, references.length);
    assert.equal(selectReferences(references, undefined).length, references.length);
  });

  it('gives the writer the references with their curator notes', async () => {
    const research = await researchPokemon(888, {fetchJson});
    const {user} = buildWriterPrompt({research, directing: '', references: selectReferences(references, 'mechanic'), storyPattern: 'mechanic'});
    assert.match(user, /## Gimmighoul \(mechanic\)/);
    assert.match(user, /Why it works:\n- The whole story is one strange number/);
    assert.match(user, /Never copy their content/);
    assert.doesNotMatch(user, /Swablu|Darmanitan/);
  });

  it('sends the matching references through episode:new', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'references-'));
    const sent: string[] = [];
    const reply = fs.readFileSync(path.join(root, 'test/fixtures/writer-zacian.json'), 'utf8');
    await runNewEpisode({number: 888, root: dir, fetchJson, storyPattern: 'transformation', log: () => {}, complete: async ({messages}) => {
      sent.push(messages[0].content);
      return reply;
    }});
    assert.match(sent[0], /## Darmanitan \(transformation\)/);
    assert.doesNotMatch(sent[0], /## Gimmighoul|## Bulbasaur/);
  });
});
