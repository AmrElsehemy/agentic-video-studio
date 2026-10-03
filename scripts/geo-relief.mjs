// GeoMotion relief (#91): shaded relief under the map, from Natural Earth's
// public-domain 1:10m shaded relief raster (SR_HR, 1 arc-minute).
//   npm run geo:relief                 download the pinned raster (cached in .cache/geo/),
//                                      check its checksum and write public/geo/relief/ (commit it)
//   npm run geo:relief -- --from=<zip> read the raster zip from a local file instead
// The raster is plate carrée; the map is Web Mercator, so every output image is
// reprojected row by row (Mercator only stretches latitudes), then stored with
// its box so the renderer can place it exactly. Flat ground is shifted to
// neutral grey, so blending it changes only slopes. Output: one coarse global
// image, and full-detail crops for the regions episodes zoom into.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchWithReason} from './lib/net.mjs';
import {RELIEF, reliefRows, sha256} from './lib/geo-relief.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'geo', 'relief');
const cacheDir = path.join(root, '.cache', 'geo');
const from = process.argv.slice(2).find((arg) => arg.startsWith('--from='))?.slice('--from='.length);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {maxBuffer: 1024 * 1024 * 1024, ...options});
  if (result.status !== 0) throw new Error(`${command} failed: ${String(result.stderr).slice(-800)}`);
  return result.stdout;
};

// 1. The pinned source.
fs.mkdirSync(cacheDir, {recursive: true});
const zipPath = from ?? path.join(cacheDir, 'SR_HR.zip');
if (!fs.existsSync(zipPath)) {
  console.log(`▶ downloading ${RELIEF.url}`);
  const response = await fetchWithReason('Natural Earth', RELIEF.url);
  if (!response.ok) throw new Error(`Natural Earth download failed (${response.status}) for ${RELIEF.url}`);
  fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
}
const actual = sha256(fs.readFileSync(zipPath));
if (actual !== RELIEF.sha256) throw new Error(`SR_HR.zip checksum ${actual} doesn't match the pinned ${RELIEF.sha256}. Review the new release before updating RELIEF in scripts/lib/geo-relief.mjs.`);
run('unzip', ['-o', '-q', zipPath, 'SR_HR.tif', '-d', cacheDir]);
const tif = path.join(cacheDir, 'SR_HR.tif');

// 2. Each output: crop (and for the global image, average down) with ffmpeg, then reproject rows.
fs.rmSync(outDir, {recursive: true, force: true});
fs.mkdirSync(outDir, {recursive: true});
const files = {};
const images = {};
for (const image of RELIEF.images) {
  const [west, south, east, north] = image.bbox;
  const perDegree = RELIEF.pixelsPerDegree;
  const crop = {x: Math.round((west + 180) * perDegree), y: Math.round((90 - north) * perDegree), width: Math.round((east - west) * perDegree), height: Math.round((north - south) * perDegree)};
  const width = Math.round(crop.width / image.downsample);
  const height = Math.round(crop.height / image.downsample);
  const source = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', tif, '-vf', `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${width}:${height}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const {pixels, outHeight} = reliefRows(source, {width, height, south, north, flat: RELIEF.flat, gain: RELIEF.gain});
  const file = `${image.id}.jpg`;
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${width}x${outHeight}`, '-i', '-', '-q:v', '3', path.join(outDir, file)], {input: pixels});
  const data = fs.readFileSync(path.join(outDir, file));
  files[file] = {sha256: sha256(data), bytes: data.length};
  images[image.id] = {file, bbox: image.bbox, width, height: outHeight, arcMinutes: image.downsample};
  console.log(`✓ ${file}: ${width}×${outHeight}, ${(data.length / 1024).toFixed(0)} KB`);
}

const manifest = {
  source: {name: 'Natural Earth', dataset: 'SR_HR (1:10m shaded relief)', version: RELIEF.version, license: 'Public domain', url: RELIEF.url, sha256: RELIEF.sha256, attribution: 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.'},
  projection: 'Web Mercator rows; each image spans its bbox [west, south, east, north]',
  neutral: 128,
  images,
  files,
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✓ public/geo/relief/manifest.json (${Object.keys(images).length} images)`);
