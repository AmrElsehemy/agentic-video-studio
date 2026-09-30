// GeoMotion map data (#70).
//   npm run geo:prepare   download the pinned Natural Earth layers, check their
//                         checksums and write public/geo/ (commit the result)
//   npm run geo:verify    check public/geo/ against its manifest (no network)
// Options for prepare: --from=<dir> reads the source .geojson files from a
// local folder instead of downloading them.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchWithReason} from './lib/net.mjs';
import {NATURAL_EARTH, buildEntities, serialize, sha256, slimCountries, slimDisputed, slimWater} from './lib/geo-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'geo');
const args = process.argv.slice(2);
const from = args.find((arg) => arg.startsWith('--from='))?.slice('--from='.length);
const OUTPUTS = ['countries.geojson', 'water.geojson', 'disputed.geojson', 'entities.json'];

const verify = () => {
  const manifestPath = path.join(outDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('public/geo/manifest.json is missing. Run: npm run geo:prepare');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const problems = [];
  for (const [file, expected] of Object.entries(manifest.files)) {
    const target = path.join(outDir, file);
    if (!fs.existsSync(target)) problems.push(`${file} is missing`);
    else if (sha256(fs.readFileSync(target)) !== expected.sha256) problems.push(`${file} doesn't match its manifest checksum (edited by hand?)`);
  }
  if (problems.length) {
    console.error(`✗ geo assets:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\nRegenerate them with: npm run geo:prepare`);
    process.exit(1);
  }
  console.log(`✓ geo assets match their manifest (${manifest.source.name} ${manifest.source.version}, ${Object.keys(manifest.files).length} files)`);
};

const readSource = async (layer) => {
  const {file, sha256: expected} = NATURAL_EARTH.layers[layer];
  let data;
  if (from) {
    data = fs.readFileSync(path.join(from, file));
  } else {
    const url = `${NATURAL_EARTH.baseUrl}/${file}`;
    const response = await fetchWithReason('Natural Earth', url);
    if (!response.ok) throw new Error(`Natural Earth download failed (${response.status}) for ${url}`);
    data = Buffer.from(await response.arrayBuffer());
  }
  const actual = sha256(data);
  if (actual !== expected) throw new Error(`${file} checksum ${actual} doesn't match the pinned ${expected}. The source changed; review it before updating NATURAL_EARTH in scripts/lib/geo-data.mjs.`);
  return JSON.parse(data.toString('utf8'));
};

const prepare = async () => {
  const countries = slimCountries(await readSource('countries'));
  const water = slimWater(await readSource('water'));
  const disputed = slimDisputed(await readSource('disputed'));
  const entities = buildEntities({countries, water, disputed});
  const contents = {'countries.geojson': countries, 'water.geojson': water, 'disputed.geojson': disputed, 'entities.json': entities};
  fs.mkdirSync(outDir, {recursive: true});
  const files = {};
  for (const file of OUTPUTS) {
    const text = serialize(contents[file]);
    fs.writeFileSync(path.join(outDir, file), text);
    files[file] = {sha256: sha256(text), bytes: Buffer.byteLength(text)};
  }
  const {layers, ...source} = NATURAL_EARTH;
  const manifest = {source: {...source, layers: Object.fromEntries(Object.entries(layers).map(([layer, {file, sha256: hash}]) => [layer, {url: `${NATURAL_EARTH.baseUrl}/${file}`, sha256: hash}]))}, files};
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const review = entities.filter((entity) => entity.review);
  console.log(`✓ public/geo: ${countries.features.length} countries, ${water.features.length} bodies of water, ${disputed.features.length} disputed areas (${Object.values(files).reduce((sum, file) => sum + file.bytes, 0)} bytes)`);
  console.log(`  ${review.length} countries flagged for editorial review of disputed areas: ${review.map((entity) => entity.name).join(', ')}`);
};

if (args.includes('--verify')) verify();
else await prepare();
