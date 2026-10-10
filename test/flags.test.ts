import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {labelNamesCountry, shortCountryName} from '../src/video/geo/Flags';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {shotToPrimitive} from '../scripts/lib/geo-director.mjs';
import {flagRightsAsset} from '../scripts/lib/geo-primitives.mjs';
import {sha256} from '../scripts/lib/geo-data.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const index = read('public/flags/index.json');
const entities = read('public/geo/entities.json') as {id: string; kind: string; name: string; countries?: string[]; review?: unknown[]}[];

describe('flags', () => {
  it('give each country the flag of its own code', () => {
    assert.equal(index.countries['country:FRA'], 'fr');
    assert.equal(index.countries['country:BRA'], 'br');
    assert.equal(index.countries['country:USA'], 'us');
    assert.equal(index.countries['country:KAZ'], 'kz');
  });

  it('leave a place with no flag of its own without one, rather than borrow another', () => {
    for (const id of ['country:BRT', 'country:CNM', 'country:SPI', 'country:USG']) assert.equal(index.countries[id], undefined, id);
  });

  it('have a file with the recorded checksum for every flag, credited to flag-icons', () => {
    assert.match(index.attribution, /flag-icons/);
    for (const [code, hash] of Object.entries(index.files) as [string, string][]) assert.equal(sha256(fs.readFileSync(path.join(root, 'public', 'flags', `${code}.svg`))), hash, code);
    for (const code of Object.values(index.countries) as string[]) assert.ok(index.files[code], code);
  });

  it('cover both sides of every border the map offers that has flags on both', () => {
    const borders = entities.filter((entity) => entity.kind === 'border');
    const covered = borders.filter((border) => (border.countries ?? []).every((code) => index.countries[`country:${code}`]));
    assert.ok(covered.length / borders.length > 0.9, `${covered.length} of ${borders.length} borders`);
    for (const border of borders.slice(0, 5)) assert.equal(border.id.slice('border:'.length), (border.countries ?? []).join('-'));
  });

  it('print a country name the way a chip needs it', () => {
    assert.equal(shortCountryName('United States of America'), 'United States');
    assert.equal(shortCountryName('Democratic Republic of the Congo'), 'Democratic Republic');
    assert.equal(shortCountryName('Kingdom of Eswatini'), 'Eswatini');
    assert.equal(shortCountryName('France'), 'France');
  });

  it('ride only with a label that names the country, never one that merely sits on it', () => {
    assert.equal(labelNamesCountry('MADAGASCAR', 'Madagascar'), true);
    assert.equal(labelNamesCountry('UNITED STATES', 'United States of America'), true);
    assert.equal(labelNamesCountry('KAZAKHSTAN (APPROX.)', 'Kazakhstan'), true);
    assert.equal(labelNamesCountry('ECUADOR = EQUATOR', 'Ecuador'), true);
    assert.equal(labelNamesCountry('AFRICA', 'Mozambique'), false);
    assert.equal(labelNamesCountry('EUROPE CLOSER', 'Iceland'), false);
    assert.equal(labelNamesCountry('N AMERICA PLATE', 'Greenland'), false);
    assert.equal(labelNamesCountry('NIGER', 'Nigeria'), false, 'a whole word, not a prefix');
    assert.equal(labelNamesCountry('44 HECTARES', 'Vatican City'), false);
  });

  it('are opt in per shot, and the director passes them through', () => {
    const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
    assert.ok(primitiveSchema.safeParse({...base, flags: true}).success);
    const places = new Map([['country:FRA', {id: 'country:FRA', kind: 'country', name: 'France', bbox: [-5, 42, 8, 51]}]]);
    const shot = (extra: object) => shotToPrimitive({camera: [{target: 'country:FRA', at: 0}], highlights: [], annotations: [], ...extra}, {places, research: {claims: []}} as never);
    assert.equal(shot({flags: true}).flags, true);
    assert.equal(shot({}).flags, undefined);
    assert.equal(shot({ambience: 'sea'}).ambience, 'sea');
    assert.equal(shot({ambience: 'thunder'}).ambience, undefined);
  });

  it('are credited in the episode that uses them, and only then', () => {
    const draft = read('drafts/geographica/lesotho-enclave.json');
    const withFlags = {...draft, scenes: draft.scenes.map((scene: any, i: number) => (i === 0 ? {...scene, primitive: {...scene.primitive, flags: true}} : scene))};
    const [plain, flagged] = [draft, withFlags].map((d) => compileEpisode(d, {showId: 'geographica'}).manifest);
    assert.ok(!plain.rights.assets.some((asset: any) => /flag-icons/.test(asset.owner)));
    assert.ok(flagged.rights.assets.some((asset: any) => asset.owner === 'flag-icons' && /MIT/.test(asset.notes)));
    assert.match(flagRightsAsset().notes, /MIT/);
  });
});
