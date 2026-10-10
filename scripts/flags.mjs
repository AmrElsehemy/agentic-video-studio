// Flags for the map's countries, from the flag-icons package (MIT; the flags themselves are public-domain artwork).
//   npm run flags:prepare   write public/flags/<iso2>.svg and public/flags/index.json (country id -> flag file); commit the result
//   npm run flags:verify    check every indexed flag exists and matches its checksum (no network except to read Natural Earth once)
// Natural Earth's own codes link a map id (country:FRA, its ADM0_A3) to the flag's two-letter code (ISO_A2_EH),
// read from the pinned countries source, so a country is only ever given the flag of its own code.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchWithReason} from './lib/net.mjs';
import {NATURAL_EARTH, sha256} from './lib/geo-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'flags');
const indexPath = path.join(outDir, 'index.json');
const source = path.join(root, 'node_modules', 'flag-icons', 'flags', '4x3');
const args = process.argv.slice(2);

if (args.includes('--verify')) {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const problems = [];
  for (const [code, hash] of Object.entries(index.files)) {
    const file = path.join(outDir, `${code}.svg`);
    if (!fs.existsSync(file)) problems.push(`${code}.svg is missing`);
    else if (sha256(fs.readFileSync(file)) !== hash) problems.push(`${code}.svg doesn't match its checksum`);
  }
  for (const [id, code] of Object.entries(index.countries)) if (!index.files[code]) problems.push(`${id} points at ${code}, which has no flag file`);
  if (problems.length) {console.error(`✗ flags:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`); process.exit(1);}
  console.log(`✓ flags match their index (${Object.keys(index.countries).length} countries, ${Object.keys(index.files).length} flags)`);
} else {
  const {file, sha256: expected} = NATURAL_EARTH.layers.countries;
  const response = await fetchWithReason('Natural Earth', `${NATURAL_EARTH.baseUrl}/${file}`);
  if (!response.ok) throw new Error(`Natural Earth download failed (${response.status})`);
  const data = Buffer.from(await response.arrayBuffer());
  if (sha256(data) !== expected) throw new Error(`${file} doesn't match its pinned checksum; review before updating NATURAL_EARTH.`);
  const countries = {};
  for (const {properties} of JSON.parse(data.toString('utf8')).features) {
    const code = String(properties.ISO_A2_EH ?? '').toLowerCase();
    if (/^[a-z]{2}$/.test(code) && fs.existsSync(path.join(source, `${code}.svg`))) countries[`country:${properties.ADM0_A3}`] = code;
  }
  fs.mkdirSync(outDir, {recursive: true});
  const files = {};
  for (const code of [...new Set(Object.values(countries))].sort()) {
    const svg = fs.readFileSync(path.join(source, `${code}.svg`));
    fs.writeFileSync(path.join(outDir, `${code}.svg`), svg);
    files[code] = sha256(svg);
  }
  const version = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'flag-icons', 'package.json'), 'utf8')).version;
  fs.writeFileSync(indexPath, `${JSON.stringify({source: `flag-icons ${version} (MIT)`, licenseUrl: 'https://github.com/lipis/flag-icons/blob/main/LICENSE', attribution: `Flags: flag-icons ${version} (MIT).`, countries, files}, null, 1)}\n`);
  console.log(`✓ ${Object.keys(countries).length} countries, ${Object.keys(files).length} flags → public/flags (${(fs.readdirSync(outDir).reduce((sum, name) => sum + fs.statSync(path.join(outDir, name)).size, 0) / 1024).toFixed(0)} KB)`);
}
