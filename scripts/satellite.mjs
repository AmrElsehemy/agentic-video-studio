// Satellite stills from NASA GIBS, stored with their credit.
//   npm run satellite -- layers                                              the layers and their dates
//   npm run satellite -- add <set> --layer=<layer> --bbox=west,south,east,north --dates=2000-08-15,2024-08-15 [--zoom=N] [--caption="..."]
//   npm run satellite -- probe --layer=<layer> --bbox=... --dates=a,b,c --out=sheet.png   a labelled contact sheet of candidate dates at low resolution, to pick a clear one
//   npm run satellite -- verify                                              check the files against public/satellite/index.json (no network)
// Needs ImageMagick (`magick`) to stitch the tiles.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fetchWithReason} from './lib/net.mjs';
import {sha256} from './lib/geo-data.mjs';
import {DATE, LAYERS, TILE, chooseZoom, tilePlan, tileUrl} from './lib/satellite.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'satellite');
const indexPath = path.join(dir, 'index.json');
const [command, ...rest] = process.argv.slice(2);
const words = rest.filter((arg) => !arg.startsWith('--'));
const option = (name) => rest.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
// ImageMagick has no default font on some machines: use a system one for the probe labels when there is one.
const LABEL_FONT = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find((font) => fs.existsSync(font));
const readIndex = () => (fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : {source: 'NASA EOSDIS Global Imagery Browse Services (GIBS)', sets: {}});

const download = async (url, file) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetchWithReason('NASA GIBS', url, {headers: {'user-agent': 'agentic-video-studio/0.1 (explainer videos)'}});
    if (response.ok) {fs.writeFileSync(file, Buffer.from(await response.arrayBuffer())); return;}
    if (response.status === 404) throw new Error(`NASA has no tile for ${url} (404): that date has no image for this layer`);
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(`NASA GIBS would not answer for ${url}`);
};

/** One dated still: fetch the tiles, stitch them, crop to the box, write a JPEG. */
const stitch = async (layer, date, zoom, plan, outFile) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gibs-'));
  try {
    const jobs = plan.rows.flatMap((row) => plan.columns.map((column) => ({row, column})));
    let next = 0;
    await Promise.all(Array.from({length: 6}, async () => {
      while (next < jobs.length) {
        const {row, column} = jobs[next++];
        await download(tileUrl(layer, date, zoom, column, row), path.join(work, `${row}_${column}.${layer.ext}`));
      }
    }));
    const rowFiles = plan.rows.map((row) => {
      const file = path.join(work, `row-${row}.png`);
      execFileSync('magick', [...plan.columns.map((column) => path.join(work, `${row}_${column}.${layer.ext}`)), '+append', file]);
      return file;
    });
    const {x, y, width, height} = plan.crop;
    execFileSync('magick', [...rowFiles, '-append', '-crop', `${width}x${height}+${x}+${y}`, '+repage', '-background', 'black', '-flatten', '-quality', '88', outFile]);
  } finally {
    fs.rmSync(work, {recursive: true, force: true});
  }
};

if (command === 'layers') {
  for (const [key, layer] of Object.entries(LAYERS)) console.log(`${key.padEnd(15)} ${layer.title} · ${layer.dated === 'none' ? 'undated' : `${layer.dated}, from ${layer.first}`}`);
} else if (command === 'add') {
  const [id] = words;
  if (!/^[a-z0-9-]+$/.test(id ?? '')) throw new Error('Usage: npm run satellite -- add <set> --layer=<layer> --bbox=west,south,east,north --dates=YYYY-MM-DD,... [--zoom=N] [--caption="..."]');
  const defaultLayer = option('layer');
  if (defaultLayer && !LAYERS[defaultLayer]) throw new Error(`--layer must be one of: ${Object.keys(LAYERS).join(', ')}`);
  const bbox = (option('bbox') ?? '').split(',').map(Number);
  if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || Math.abs(bbox[1]) > 80 || Math.abs(bbox[3]) > 80) throw new Error('--bbox must be west,south,east,north with west < east and south < north (within 80° of the equator)');
  // A date may name its own layer ("landsat-annual:1990-12-01"), so a set can compare two sensors; each still keeps its own credit.
  const requested = (option('dates') ?? '').split(',').filter(Boolean).map((item) => {
    const [first, second] = item.includes(':') ? item.split(':') : [defaultLayer, item];
    return {layerKey: first, date: second};
  });
  if (!requested.length || requested.some(({layerKey, date}) => !LAYERS[layerKey ?? ''] || (LAYERS[layerKey].dated !== 'none' && !DATE.test(date)))) throw new Error('--dates must be YYYY-MM-DD dates, comma separated, each optionally "layer:date" (or use --layer)');
  // One zoom for the whole set, so the stills line up: the coarsest any of its layers allows.
  const zoom = option('zoom') ? Number(option('zoom')) : Math.min(...requested.map(({layerKey}) => chooseZoom(bbox, LAYERS[layerKey])));
  const plan = tilePlan(bbox, zoom);
  console.log(`${id}: zoom ${zoom}, ${plan.columns.length}×${plan.rows.length} tiles per date, image ${plan.crop.width}×${plan.crop.height}`);
  fs.mkdirSync(path.join(dir, id), {recursive: true});
  const index = readIndex();
  const entry = {bbox, zoom, width: plan.crop.width, height: plan.crop.height, caption: option('caption') ?? '', dates: {}};
  for (const {layerKey, date} of requested) {
    const layer = LAYERS[layerKey];
    const key = layer.dated === 'none' ? 'static' : date;
    const file = path.join(dir, id, `${key}.jpg`);
    await stitch(layer, date, zoom, plan, file);
    // A date with no pass over the box comes back black or transparent: refuse it rather than store an empty frame.
    const mean = Number(execFileSync('magick', [file, '-format', '%[fx:mean]', 'info:']).toString());
    if (mean < 0.04) {fs.rmSync(file, {force: true}); throw new Error(`${layerKey} ${date}: the image is empty (no data over this box on that date). Try another date.`);}
    const bytes = fs.readFileSync(file);
    entry.dates[key] = {layer: layer.id, layerKey, title: layer.title, credit: layer.credit, sha256: sha256(bytes)};
    console.log(`✓ ${id} ${key} (${layerKey}) → ${path.relative(root, file)} ${(bytes.length / 1024).toFixed(0)} KB`);
  }
  index.sets[id] = entry;
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 1)}\n`);
  console.log('  NASA imagery is free to use with acknowledgement; each still carries its credit.');
} else if (command === 'probe') {
  const layer = LAYERS[option('layer') ?? ''];
  const bbox = (option('bbox') ?? '').split(',').map(Number);
  const dates = (option('dates') ?? '').split(',').filter(Boolean);
  const out = option('out');
  if (!layer || bbox.length !== 4 || !dates.length || !out) throw new Error('Usage: npm run satellite -- probe --layer=<layer> --bbox=w,s,e,n --dates=a,b,c --out=sheet.png');
  const zoom = Math.max(0, chooseZoom(bbox, layer) - 2);
  const plan = tilePlan(bbox, zoom);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gibs-probe-'));
  const cells = [];
  for (const date of dates) {
    const file = path.join(work, `${date}.png`);
    try {
      await stitch(layer, date, zoom, plan, file);
      execFileSync('magick', [file, '-resize', '360x', '-gravity', 'north', '-background', '#222', '-splice', '0x26', ...(LABEL_FONT ? ['-font', LABEL_FONT] : []), '-fill', 'white', '-pointsize', '18', '-annotate', '+0+3', date, file]);
      cells.push(file);
    } catch (error) {console.log(`  ${date}: ${error instanceof Error ? error.message.slice(0, 80) : error}`);}
  }
  if (!cells.length) throw new Error('No date gave an image.');
  execFileSync('magick', [...cells, '+append', path.resolve(out)]);
  console.log(`✓ ${cells.length} of ${dates.length} dates → ${out} (zoom ${zoom})`);
  fs.rmSync(work, {recursive: true, force: true});
} else if (command === 'verify') {
  const index = readIndex();
  const problems = [];
  for (const [id, entry] of Object.entries(index.sets)) {
    for (const [date, {sha256: hash, credit}] of Object.entries(entry.dates)) {
      if (!credit) problems.push(`${id}/${date} has no credit`);
      const file = path.join(dir, id, `${date}.jpg`);
      if (!fs.existsSync(file)) problems.push(`${id}/${date}.jpg is missing`);
      else if (sha256(fs.readFileSync(file)) !== hash) problems.push(`${id}/${date}.jpg doesn't match its checksum`);
    }
  }
  if (problems.length) {console.error(`✗ satellite:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`); process.exit(1);}
  console.log(`✓ satellite stills match their index (${Object.keys(index.sets).length} sets)`);
} else {
  throw new Error('Usage: npm run satellite -- layers | add <set> ... | verify');
}
void TILE;
