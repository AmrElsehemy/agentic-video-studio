// Street-map data from OpenStreetMap (© OpenStreetMap contributors, ODbL).
//   npm run streets:prepare [-- <city>...]   fetch the cities in scripts/lib/streets-cities.json (all by default), write public/geo/streets/ (commit it)
//   npm run streets:verify                   check the files against public/geo/streets/index.json (no network)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchWithReason} from './lib/net.mjs';
import {sha256} from './lib/geo-data.mjs';
import {OSM, boundaryLines, boundaryQuery, boxAroundLines, boxOf, compactStreets, overpassQuery} from './lib/streets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'geo', 'streets');
const indexPath = path.join(dir, 'index.json');
const cities = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'lib', 'streets-cities.json'), 'utf8'));
const args = process.argv.slice(2);

/** Overpass is a shared server: a busy one answers 429/504 or an error page, so try each mirror a few times. */
const overpass = async (query, label) => {
  const failures = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const endpoint = OSM.overpass[attempt % OSM.overpass.length];
    try {
      const response = await fetchWithReason('Overpass', endpoint, {
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'agentic-video-studio/0.1 (street maps for explainer videos)'},
        body: `data=${encodeURIComponent(query)}`,
      });
      if (response.ok) {
        const text = await response.text();
        try { return JSON.parse(text); } catch { failures.push(`${new URL(endpoint).host} sent a page, not data`); }
      } else failures.push(`${new URL(endpoint).host} ${response.status}`);
    } catch (error) {
      failures.push(`${new URL(endpoint).host} ${error instanceof Error ? error.message : error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 4000 * (attempt + 1)));
  }
  throw new Error(`Overpass would not answer for ${label}: ${failures.join('; ')}`);
};

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
    const reply = await overpass(overpassQuery(city.center, city.radiusKm), id);
    const streets = compactStreets(reply.elements);
    // A city that is a country in its own right (the Vatican, Gibraltar) also keeps its boundary, to draw on the plan.
    if (city.boundary) {
      const outline = boundaryLines((await overpass(boundaryQuery(city.boundary, city.boundaryLevel), `${id} boundary`)).elements);
      if (!outline.length) throw new Error(`No boundary found for ${city.boundary}`);
      streets.outline = outline;
      streets.outlineBox = boxAroundLines(outline);
    }
    const body = `${JSON.stringify({id, name: city.name, center: city.center, radiusKm: city.radiusKm, box: boxOf(city.center, city.radiusKm), osmTimestamp: reply.osm3s?.timestamp_osm_base, ...streets})}\n`;
    fs.writeFileSync(path.join(dir, `${id}.json`), body);
    index.cities[id] = {name: city.name, center: city.center, radiusKm: city.radiusKm, box: boxOf(city.center, city.radiusKm), ...(streets.outlineBox ? {outlineBox: streets.outlineBox} : {}), osmTimestamp: reply.osm3s?.timestamp_osm_base, sha256: sha256(Buffer.from(body)), bytes: body.length};
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 1)}\n`);
    console.log(`✓ ${id}: ${streets.roads.flat().length} roads, ${streets.buildings.length} buildings, ${streets.water.length} water areas (${(body.length / 1024).toFixed(0)} KB)`);
  }
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 1)}\n`);
}
