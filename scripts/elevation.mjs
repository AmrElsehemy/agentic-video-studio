// Elevation and sea-level-rise data from NOAA ETOPO 2022 (public domain).
//   npm run elevation:prepare   download the model at 0.05 degrees, check it, write public/geo/elevation.json (commit it)
//   npm run elevation:verify    check public/geo/elevation.json is the pinned model's (no network)
// The grid is not kept in the repo (it is 50 MB); its checksum is pinned here, so a different download is refused.
// Options for prepare: --from=<file> reads a grid saved earlier (Int16, row 0 at the north) instead of downloading.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchWithReason} from './lib/net.mjs';
import {sha256} from './lib/geo-data.mjs';
import {CELL, ELEVATION_LEVELS, ETOPO, FLOOD_LEVELS, HEIGHT, STEP, WIDTH, elevationBands, floodBands, parseDods} from './lib/elevation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public', 'geo', 'elevation.json');
const cacheDir = path.join(root, 'out', 'cache');
const args = process.argv.slice(2);
const from = args.find((arg) => arg.startsWith('--from='))?.slice('--from='.length);
/** The sha256 of the grid (Int16 little-endian, row 0 at the north); set after the first download. */
const GRID_SHA256 = '4b6d8fa1cc5c3511e4de09860256d02d13060c8491184ffeda1c3a129681250e';

const download = async () => {
  const rows = 100;
  const south = new Int16Array(WIDTH * HEIGHT);
  for (let first = 0; first < HEIGHT; first += rows) {
    const last = Math.min(HEIGHT, first + rows) - 1;
    const url = `${ETOPO.url}.dods?z[${first * STEP}:${STEP}:${last * STEP}][0:${STEP}:${WIDTH * STEP - 1}]`;
    const response = await fetchWithReason('NOAA', url);
    if (!response.ok) throw new Error(`NOAA elevation download failed (${response.status}) for ${url}`);
    const values = parseDods(Buffer.from(await response.arrayBuffer()));
    if (values.length !== (last - first + 1) * WIDTH) throw new Error(`Expected ${(last - first + 1) * WIDTH} elevations, got ${values.length}`);
    for (let k = 0; k < values.length; k++) south[first * WIDTH + k] = Math.round(values[k]);
    process.stdout.write(`\r  rows ${last + 1}/${HEIGHT}`);
  }
  process.stdout.write('\n');
  // The model's first row is the south pole; the map's is the north.
  const grid = new Int16Array(WIDTH * HEIGHT);
  for (let j = 0; j < HEIGHT; j++) grid.set(south.subarray((HEIGHT - 1 - j) * WIDTH, (HEIGHT - j) * WIDTH), j * WIDTH);
  return grid;
};

if (args.includes('--verify')) {
  if (!fs.existsSync(output)) throw new Error('public/geo/elevation.json is missing. Run: npm run elevation:prepare');
  const made = JSON.parse(fs.readFileSync(output, 'utf8'));
  const problems = [];
  if (made.source?.url !== ETOPO.url) problems.push('it was made from a different model');
  if (made.gridSha256 !== GRID_SHA256 && GRID_SHA256) problems.push('its grid checksum is not the pinned one');
  if (made.elevation?.length !== ELEVATION_LEVELS.length || made.flood?.length !== FLOOD_LEVELS.length) problems.push('its levels are not the current ones');
  if (problems.length) {console.error(`✗ elevation.json: ${problems.join('; ')}. Regenerate with: npm run elevation:prepare`); process.exit(1);}
  console.log(`✓ elevation.json matches ${made.source.name} (${made.elevation.length} elevation bands, ${made.flood.length} flood levels)`);
} else {
  let grid;
  if (from) grid = new Int16Array(fs.readFileSync(path.resolve(from)).buffer.slice(0));
  else grid = await download();
  const hash = sha256(Buffer.from(grid.buffer));
  console.log(`grid sha256 ${hash}`);
  if (GRID_SHA256 && hash !== GRID_SHA256) throw new Error(`The grid checksum ${hash} doesn't match the pinned ${GRID_SHA256}. The source changed; review it before updating GRID_SHA256 in scripts/elevation.mjs.`);
  fs.mkdirSync(cacheDir, {recursive: true});
  fs.writeFileSync(path.join(cacheDir, `etopo-${CELL.toFixed(2)}.i16`), Buffer.from(grid.buffer));
  fs.writeFileSync(output, `${JSON.stringify({
    source: {...ETOPO, attribution: 'Elevation: NOAA NCEI ETOPO 2022 (public domain).'},
    cellDegrees: CELL,
    gridSha256: hash,
    elevation: elevationBands(grid),
    flood: floodBands(grid),
  })}\n`);
  console.log(`✓ wrote ${path.relative(root, output)} (${(fs.statSync(output).size / 1024 / 1024).toFixed(1)} MB)`);
}
