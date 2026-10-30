// Fine coastlines (GSHHG, LGPL) for close-up map shots.
//   npm run coast:fine                build public/geo/fine/ from the pinned GSHHG download (cached in .cache/)
//   npm run coast:fine -- --zip=<file> use a copy of gshhg-shp-2.3.7.zip you already have
//   npm run coast:fine:verify         check the tiles on disk against public/geo/fine/index.json (no network)
// The tiles are generated, not committed (about 90 MB): a fresh checkout runs `npm run coast:fine` once.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {FINE_COAST, buildTiles} from './lib/fine-coast.mjs';
import {sha256} from './lib/geo-data.mjs';
import {readShapefile} from './lib/shapefile.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'geo', 'fine');
const cacheDir = path.join(root, '.cache', 'gshhg');
const indexPath = path.join(outDir, 'index.json');
const args = process.argv.slice(2);
const zipArg = args.find((arg) => arg.startsWith('--zip='))?.slice(6);

/** One digest over every tile file, so a hand-edited or missing tile is caught without a long index. */
const digestOf = (level, keys) => {
  const parts = keys.map((key) => `${key}:${sha256(fs.readFileSync(path.join(outDir, level, `${key}.json`)))}`);
  return sha256(Buffer.from(parts.join('\n')));
};

if (args.includes('--verify')) {
  if (!fs.existsSync(indexPath)) throw new Error('public/geo/fine/index.json is missing. Run: npm run coast:fine');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const problems = [];
  if (index.sourceSha256 !== FINE_COAST.sha256) problems.push('the tiles were built from a different download than the pinned one');
  for (const [level, entry] of Object.entries(index.levels)) {
    const missing = entry.tiles.filter((key) => !fs.existsSync(path.join(outDir, level, `${key}.json`)));
    if (missing.length) problems.push(`${level}: ${missing.length} tiles missing (${missing.slice(0, 3).join(', ')}...)`);
    else if (digestOf(level, entry.tiles) !== entry.digest) problems.push(`${level}: tiles don't match their checksum (edited by hand?)`);
  }
  if (problems.length) { console.error(`✗ fine coast:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`); process.exit(1); }
  console.log(`✓ fine coast matches its index (${Object.entries(index.levels).map(([level, entry]) => `${level}: ${entry.tiles.length} tiles`).join(', ')}; ${index.attribution})`);
} else {
  fs.mkdirSync(cacheDir, {recursive: true});
  let zip = zipArg ? path.resolve(zipArg) : path.join(cacheDir, 'gshhg-shp-2.3.7.zip');
  if (!fs.existsSync(zip)) {
    console.log(`▶ downloading ${FINE_COAST.sourceUrl} (about 150 MB)`);
    const response = await fetch(FINE_COAST.sourceUrl);
    if (!response.ok || !response.body) throw new Error(`GSHHG download failed (${response.status}).`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(zip));
  }
  const digest = sha256(fs.readFileSync(zip));
  if (digest !== FINE_COAST.sha256) throw new Error(`${path.basename(zip)} has checksum ${digest}, not the pinned ${FINE_COAST.sha256}. Changing the source is a deliberate update: edit FINE_COAST in scripts/lib/fine-coast.mjs.`);
  fs.rmSync(outDir, {recursive: true, force: true});
  const index = {source: `${FINE_COAST.name} ${FINE_COAST.version}`, license: FINE_COAST.license, licenseUrl: FINE_COAST.licenseUrl, attribution: FINE_COAST.attribution, sourceSha256: FINE_COAST.sha256, tile: FINE_COAST.tile, margin: FINE_COAST.margin, levels: {}};
  for (const [level, spec] of Object.entries(FINE_COAST.levels)) {
    const inner = `GSHHS_shp/${spec.folder}/${spec.file}`;
    execFileSync('unzip', ['-o', '-q', zip, inner, '-d', cacheDir]);
    // Antarctica (below 60°S) has no use for a country map and would double the size.
    const polygons = readShapefile(path.join(cacheDir, inner)).filter((polygon) => polygon.bbox[1] > -60);
    const tiles = buildTiles(polygons, {tolerance: spec.tolerance, decimals: spec.decimals});
    fs.mkdirSync(path.join(outDir, level), {recursive: true});
    let bytes = 0;
    for (const [key, rings] of tiles) {
      const body = JSON.stringify(rings);
      bytes += body.length;
      fs.writeFileSync(path.join(outDir, level, `${key}.json`), body);
    }
    const keys = [...tiles.keys()].sort();
    index.levels[level] = {tolerance: spec.tolerance, decimals: spec.decimals, maxSpan: spec.maxSpan, tiles: keys, digest: digestOf(level, keys)};
    console.log(`✓ ${level}: ${keys.length} tiles, ${(bytes / 1e6).toFixed(1)} MB`);
  }
  fs.writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
}
