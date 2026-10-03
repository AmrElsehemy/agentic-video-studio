import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {geoResearchSchema} from '../scripts/geo-research-schema.mjs';
import {primitiveNumbers, primitiveSchema, primitiveText, type GeoMapPrimitive} from '../scripts/primitive-schema.mjs';
import {geoResearchNumbers, resolveResearchPlaces, shotToPrimitive, textNumbers} from '../scripts/lib/geo-director.mjs';
import {geoProblems, loadGeoData} from '../scripts/lib/geo-primitives.mjs';
import {formatValue} from '../src/video/geo/GeoMap';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const geo = loadGeoData(root);
const research = read('research/geographica/lesotho-enclave.json');
const {places, datasets} = resolveResearchPlaces(research, geo);
const shot = (extra: object) => shotToPrimitive({camera: [{target: 'country:ZAF', at: 0}], ...extra}, {places, research, datasets});

describe('data maps (#91): sourced datasets', () => {
  it('requires every dataset to cite a listed source', () => {
    const broken = {...research, datasets: {x: {label: 'X', source: 'nowhere', values: {Lesotho: 1, Botswana: 2}}}};
    assert.match(JSON.stringify(geoResearchSchema.safeParse(broken).error?.issues), /cites \\"nowhere\\"/);
  });

  it('resolves each dataset place to a map id, and refuses places the map can\'t show', () => {
    assert.deepEqual(datasets.get('lowest-points')?.values.find(({entity}) => entity === 'country:LSO'), {entity: 'country:LSO', value: 1400});
    const bad = geoResearchSchema.parse({...research, datasets: {x: {label: 'X', source: 'wikipedia-lesotho', values: {Lesotho: 1, Atlantis: 2}}}});
    assert.throws(() => resolveResearchPlaces(bad, geo), /dataset "x" names places the map can't show/);
  });
});

describe('data maps: the director copies values, never the model', () => {
  it('builds the data layer from the research dataset named in the shot', () => {
    const primitive = shot({data: {dataset: 'lowest-points', at: .3}});
    assert.equal(primitive.data?.label, 'LOWEST POINT');
    assert.equal(primitive.data?.at, .3);
    assert.deepEqual(primitive.data?.values.map(({value}) => value).sort((a, b) => a - b), [0, 0, 0, 21, 162, 513, 1400]);
  });

  it('ignores numbers the model writes into the shot', () => {
    const primitive = shot({data: {dataset: 'lowest-points', values: [{entity: 'country:LSO', value: 9999}]}});
    assert.ok(!primitive.data?.values.some(({value}) => value === 9999));
  });

  it('rejects a dataset the research doesn\'t have', () => {
    assert.throws(() => shot({data: 'population'}), /data: "population" isn't one of the research datasets \(lowest-points\)/);
  });

  it('only shows numbers that are in the research', () => {
    const primitive = shot({data: 'lowest-points'});
    const sourced = geoResearchNumbers(research);
    for (const number of primitiveNumbers(primitive)) assert.ok(sourced.has(number), `${number} is in the research`);
    // The legend shows the lowest and highest value.
    for (const number of textNumbers(`${formatValue(0, 'm')} ${formatValue(1400, 'm')}`)) assert.ok(sourced.has(number));
    assert.match(primitiveText(primitive), /LOWEST POINT: country:LSO 1400 m/);
  });
});

describe('data maps: schema and map data', () => {
  const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}]};
  it('needs at least two places and known map ids', () => {
    assert.equal(primitiveSchema.safeParse({...base, data: {label: 'X', values: [{entity: 'country:LSO', value: 1}]}}).success, false);
    const primitive = primitiveSchema.parse({...base, data: {label: 'X', values: [{entity: 'country:LSO', value: 1}, {entity: 'country:NOPE', value: 2}]}}) as GeoMapPrimitive;
    assert.match(geoProblems(primitive, geo).join('\n'), /data\.values\[1\]\.entity: unknown geo entity "country:NOPE"/);
  });

  it('formats legend values the way the narration says them', () => {
    assert.equal(formatValue(1400, 'm'), '1,400 M');
    assert.equal(formatValue(0, 'm'), '0 M');
    assert.equal(formatValue(3.5), '3.5');
  });
});
