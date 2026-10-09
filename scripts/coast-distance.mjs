// How far inland everywhere is, from the pinned country outlines.
//   npm run coast:prepare   work out public/geo/coast-distance.json (commit the result)
//   npm run coast:verify    check it was made from the country outlines in public/geo/ (no network)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from './lib/geo-data.mjs';
import {bandPolygons, CELL, distanceGrid, farthest, landMask, LEVELS_KM, openSea} from './lib/coast-distance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const countriesPath = path.join(root, 'public', 'geo', 'countries.geojson');
const output = path.join(root, 'public', 'geo', 'coast-distance.json');

const countriesHash = () => sha256(fs.readFileSync(countriesPath));

if (process.argv.includes('--verify')) {
  if (!fs.existsSync(output)) throw new Error('public/geo/coast-distance.json is missing. Run: npm run coast:prepare');
  const made = JSON.parse(fs.readFileSync(output, 'utf8'));
  if (made.derivedFrom !== countriesHash()) {
    console.error('✗ coast-distance.json was made from different country outlines. Regenerate it with: npm run coast:prepare');
    process.exit(1);
  }
  console.log(`✓ coast-distance.json matches the country outlines (${made.bands.length} bands)`);
} else {
  const countries = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
  const mask = landMask(countries);
  const distance = distanceGrid(openSea(mask));
  const pole = farthest(distance, [20, 20, 150, 80]);
  fs.writeFileSync(output, `${JSON.stringify({
    source: 'Distance to the nearest open-sea cell, worked out from the pinned Natural Earth country outlines (public domain).',
    cellDegrees: CELL,
    levelsKm: LEVELS_KM,
    derivedFrom: countriesHash(),
    bands: bandPolygons(distance),
  })}\n`);
  console.log(`✓ wrote ${path.relative(root, output)} (${(fs.statSync(output).size / 1024).toFixed(0)} KB); the farthest from the sea in Eurasia is ${Math.round(pole.km)} km at ${pole.lon.toFixed(1)}°E ${pole.lat.toFixed(1)}°N`);
}
