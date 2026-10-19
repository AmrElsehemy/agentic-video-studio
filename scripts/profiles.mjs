// Elevation profiles along a path, from NOAA ETOPO 2022 (public domain).
//   npm run profiles -- add <id> --path="lon,lat;lon,lat;..." [--samples=160] [--caption="..."]
//   npm run profiles -- verify
// The path is 2 to 8 stops joined along great circles; it may not cross the date line. Heights come from the model's
// 1-arc-minute grid (about 1.8 km), so a profile shows the shape of the land, not a surveyed section.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchWithReason} from './lib/net.mjs';
import {sha256} from './lib/geo-data.mjs';
import {parseDods} from './lib/elevation.mjs';
import {MAX_CELLS, PROFILE_SOURCE, densify, sampleProfile, windowOf} from './lib/profiles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'geo', 'profiles');
const indexPath = path.join(dir, 'index.json');
const [command, ...rest] = process.argv.slice(2);
const words = rest.filter((arg) => !arg.startsWith('--'));
const option = (name) => rest.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const readIndex = () => (fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : {source: PROFILE_SOURCE, profiles: {}});

if (command === 'add') {
  const [id] = words;
  if (!/^[a-z0-9-]+$/.test(id ?? '')) throw new Error('Usage: npm run profiles -- add <id> --path="lon,lat;lon,lat;..." [--samples=160] [--caption="..."]');
  const stops = (option('path') ?? '').split(';').filter(Boolean).map((stop) => stop.split(',').map(Number));
  if (stops.length < 2 || stops.length > 8 || stops.some(([lon, lat, extra]) => extra !== undefined || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 89)) throw new Error('--path needs 2 to 8 stops written "lon,lat" and joined with ";"');
  if (stops.some(([lon], index) => index > 0 && Math.abs(lon - stops[index - 1][0]) > 180)) throw new Error('A profile cannot cross the date line');
  const samples = Number(option('samples') ?? 160);
  if (!(samples >= 20 && samples <= 400)) throw new Error('--samples must be between 20 and 400');
  const dense = densify(stops);
  const window = windowOf(dense.points);
  if (window.rows * window.columns > MAX_CELLS) throw new Error(`The path spans ${window.rows}×${window.columns} model cells (more than ${MAX_CELLS}): use a shorter path`);
  // The model's rows run from the south pole; ask NOAA for just the window.
  const url = `${PROFILE_SOURCE.url}.dods?z[${window.row0}:1:${window.row1}][${window.col0}:1:${window.col1}]`;
  const response = await fetchWithReason('NOAA', url);
  if (!response.ok) throw new Error(`NOAA elevation download failed (${response.status}) for ${url}`);
  const grid = parseDods(Buffer.from(await response.arrayBuffer()));
  if (grid.length !== window.rows * window.columns) throw new Error(`Expected ${window.rows * window.columns} heights, got ${grid.length}`);
  const sampled = sampleProfile(grid, window, dense, samples);
  const peak = Math.max(...sampled.elevationM);
  const low = Math.min(...sampled.elevationM);
  const profile = {id, caption: option('caption') ?? '', stops, samples, totalKm: sampled.distanceKm.at(-1), highestM: peak, highestAtKm: sampled.distanceKm[sampled.elevationM.indexOf(peak)], lowestM: low, lowestAtKm: sampled.distanceKm[sampled.elevationM.indexOf(low)], ...sampled};
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `${id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(profile)}\n`);
  const index = readIndex();
  index.profiles[id] = {sha256: sha256(fs.readFileSync(file)), totalKm: profile.totalKm, highestM: peak, lowestM: low, samples};
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 1)}\n`);
  console.log(`✓ ${id}: ${profile.totalKm.toFixed(0)} km, ${samples} samples, ${low} to ${peak} m (highest at ${profile.highestAtKm.toFixed(0)} km) → public/geo/profiles/${id}.json`);
  console.log(`  ${PROFILE_SOURCE.name} (${PROFILE_SOURCE.publisher}, ${PROFILE_SOURCE.license}), 1 arc-minute.`);
} else if (command === 'verify') {
  const index = readIndex();
  const problems = [];
  for (const [id, entry] of Object.entries(index.profiles)) {
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) problems.push(`${id}.json is missing`);
    else if (sha256(fs.readFileSync(file)) !== entry.sha256) problems.push(`${id}.json doesn't match its checksum`);
  }
  if (problems.length) {console.error(`✗ profiles:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`); process.exit(1);}
  console.log(`✓ profiles match their index (${Object.keys(index.profiles).length})`);
} else {
  throw new Error('Usage: npm run profiles -- add <id> --path=... | verify');
}
