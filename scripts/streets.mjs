// Street-map data from OpenStreetMap (© OpenStreetMap contributors, ODbL).
//   npm run streets:prepare [-- <city>...]   fetch the cities in scripts/lib/streets-cities.json (all by default), write public/geo/streets/ (commit it)
//   npm run streets:verify                   check the files against public/geo/streets/index.json (no network)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchWithReason} from './lib/net.mjs';
import {sha256} from './lib/geo-data.mjs';
import {OSM, boxOf, compactStreets, overpassQuery} from './lib/streets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'geo', 'streets');
const indexPath = path.join(dir, 'index.json');
const cities = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'lib', 'streets-cities.json'), 'utf8'));
const args = process.argv.slice(2);

if (args.includes('--verify')) {
  if (!fs.existsSync(indexPath)) throw new Error('public/geo/streets/index.json is missing. Run: npm run streets:prepare');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const problems = [];
  for (const [id, entry] of Object.entries(index.cities)) {
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) problems.push(`${id}.json is missing`);
    else if (sha256(fs.readFileSync(file)) !== entry.sha256) problems.push(`${id}.json doesn't match its checksum (edited by hand?)`);
  }
  for (const id of Object.keys(cities)) if (!index.cities[id]) problems.push(`${id} is in streets-cities.json but not fetched (npm run streets:prepare ${id})`);
  if (problems.length) {console.error(`✗ street data:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`); process.exit(1);}
  console.log(`✓ street data matches its index (${Object.keys(index.cities).length} cities, ${index.source})`);
} else {
  fs.mkdirSync(dir, {recursive: true});
  const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : {source: `${OSM.name}, ${OSM.license}`, attribution: OSM.attribution, licenseUrl: OSM.licenseUrl, cities: {}};
  const wanted = args.filter((arg) => !arg.startsWith('--'));
  for (const id of wanted.length ? wanted : Object.keys(cities)) {
    const city = cities[id];
    if (!city) throw new Error(`Unknown city ${id}. Add it to scripts/lib/streets-cities.json first.`);
    // Overpass is a shared server: a busy one answers 429/504, so try each mirror a few times.
    let reply;
    const failures = [];
    for (let attempt = 0; attempt < 6 && !reply; attempt++) {
      const endpoint = OSM.overpass[attempt % OSM.overpass.length];
      try {
        const response = await fetchWithReason('Overpass', endpoint, {
          method: 'POST',
          headers: {'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'agentic-video-studio/0.1 (street maps for explainer videos)'},
          body: `data=${encodeURIComponent(overpassQuery(city.center, city.radiusKm))}`,
        });
        if (response.ok) reply = await response.json();
        else failures.push(`${new URL(endpoint).host} ${response.status}`);
      } catch (error) {
        failures.push(`${new URL(endpoint).host} ${error instanceof Error ? error.message : error}`);
      }
      if (!reply) await new Promise((resolve) => setTimeout(resolve, 4000 * (attempt + 1)));
    }
    if (!reply) throw new Error(`Overpass would not answer for ${id}: ${failures.join('; ')}`);
    const streets = compactStreets(reply.elements);
    const body = `${JSON.stringify({id, name: city.name, center: city.center, radiusKm: city.radiusKm, box: boxOf(city.center, city.radiusKm), osmTimestamp: reply.osm3s?.timestamp_osm_base, ...streets})}\n`;
    fs.writeFileSync(path.join(dir, `${id}.json`), body);
    index.cities[id] = {name: city.name, center: city.center, radiusKm: city.radiusKm, box: boxOf(city.center, city.radiusKm), osmTimestamp: reply.osm3s?.timestamp_osm_base, sha256: sha256(Buffer.from(body)), bytes: body.length};
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 1)}\n`);
    console.log(`✓ ${id}: ${streets.roads.flat().length} roads, ${streets.buildings.length} buildings, ${streets.water.length} water areas (${(body.length / 1024).toFixed(0)} KB)`);
  }
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 1)}\n`);
}
