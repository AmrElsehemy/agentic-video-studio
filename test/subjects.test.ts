import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {episodeDraftSchema} from '../scripts/draft-schema.mjs';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {parseShow} from '../scripts/lib/shows.mjs';
import {upgradeLegacySubject} from '../scripts/subject-schema.mjs';
import {videoSchema} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readDraft = (id: string) => JSON.parse(fs.readFileSync(path.join(root, `drafts/pokepulses/${id}.json`), 'utf8'));
const pokepulses = () => JSON.parse(fs.readFileSync(path.join(root, 'shows/pokepulses.json'), 'utf8'));

/** A draft in the pre-#30 shape: subject.index and an evolutions list. */
const legacyDarmanitan = () => {
  const {subject, related, ...draft} = readDraft('darmanitan-555');
  const {identifier, ...rest} = subject;
  return {...draft, subject: {...rest, index: identifier}, evolutions: related.map(({relation, identifier: index, ...item}: {relation: string; identifier: string}) => ({...item, index}))};
};

/** A car show with no identifier rules, and a car episode. */
const autodex = () => parseShow({
  ...pokepulses(),
  id: 'autodex', name: 'AutoDex', handle: '@AutoDex', description: 'a vertical short-form video series about cars',
  wordmark: {lead: 'AUTO', accent: 'DEX'}, notices: {ownership: 'Car names are trademarks of their owners.', nonAffiliation: 'AutoDex is independent.'},
  subjects: undefined,
});
const carArt = 'https://example.com/cars/f40.png';
const carDraft = () => ({
  ...readDraft('bulbasaur-001'),
  show: undefined,
  id: 'ferrari-f40',
  title: 'The Last Car Enzo Ferrari Approved',
  subject: {name: 'Ferrari F40', category: 'Supercar', artworkUrl: carArt, identifier: 'F40', attributes: {maker: 'Ferrari', year: 1987}},
  related: [{name: 'Ferrari 288 GTO', relation: 'related', artworkUrl: 'https://example.com/cars/288.png'}],
  numberRelevant: false,
  scenes: readDraft('bulbasaur-001').scenes.map((scene: {artworkUrl?: string; facts?: string[]}) => ({...scene, artworkUrl: carArt, ...(scene.facts ? {facts: [...scene.facts.slice(0, 2), 'F40']} : {})})),
});

describe('generic subjects', () => {
  it('upgrades drafts in the old Pokémon-only shape, compiling them exactly like the new shape', () => {
    const legacy = legacyDarmanitan();
    assert.deepEqual(upgradeLegacySubject(legacy).subject.identifier, '#555');
    assert.deepEqual(upgradeLegacySubject(legacy).related, [{name: 'Darmanitan Zen', artworkUrl: readDraft('darmanitan-555').related[0].artworkUrl, relation: 'form', identifier: '#555'}]);
    assert.deepEqual(compileEpisode(legacy, {showId: 'pokepulses'}).manifest, compileEpisode(readDraft('darmanitan-555'), {showId: 'pokepulses'}).manifest);
  });

  it('treats a related entry named after the subject as a form, anything else as an evolution', () => {
    const upgraded = upgradeLegacySubject({subject: {name: 'Eevee', index: '#133'}, evolutions: [{name: 'Vaporeon', index: '#134'}, {name: 'Eevee Gigantamax', index: '#133'}]}) as unknown as {related: {name: string; relation: string}[]};
    assert.deepEqual(upgraded.related.map((item) => [item.name, item.relation]), [['Vaporeon', 'evolves-to'], ['Eevee Gigantamax', 'form']]);
  });

  it("enforces the show's identifier rule, not the core schema", () => {
    const draft = readDraft('mew-151');
    draft.subject.identifier = '151';
    assert.ok(episodeDraftSchema.safeParse(draft).success, 'the core schema accepts any short identifier');
    assert.throws(() => compileEpisode(draft, {showId: 'pokepulses'}), /Mew's identifier "151" isn't a valid Pokédex number for PokePulses/);
  });

  it('compiles a non-Pokémon subject for another show', () => {
    const {manifest} = compileEpisode(carDraft(), {showId: 'autodex', show: autodex()});
    assert.ok(videoSchema.safeParse(manifest).success);
    assert.equal(manifest.schemaVersion, 2);
    assert.deepEqual(manifest.subject, {name: 'Ferrari F40', category: 'Supercar', artworkUrl: carArt, identifier: 'F40', attributes: {maker: 'Ferrari', year: 1987}});
    assert.deepEqual(manifest.related.map((item) => item.relation), ['related']);
    assert.ok(manifest.scenes.every((scene) => !(scene.facts ?? []).includes('F40')), 'the identifier stays off screen unless the story is about it');
  });

  it('rejects manifests in the old shape', () => {
    const current = JSON.parse(fs.readFileSync(path.join(root, 'videos/pokepulses/mew-151/video.json'), 'utf8'));
    const {related, subject: {identifier, ...subject}, ...rest} = current;
    assert.equal(videoSchema.safeParse({...rest, schemaVersion: 1, subject: {...subject, index: identifier}, evolutions: related}).success, false);
  });
});
