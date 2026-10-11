// Yearly figures per country from the World Bank.
//   npm run series:prepare   download and pin public/geo/series.json (commit the result)
//   npm run series:verify    check the file is well formed and its checksum matches (no network)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from './lib/geo-data.mjs';
import {FIRST_YEAR, INDICATORS, lastCompleteYear, pivot} from './lib/series.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public', 'geo', 'series.json');
const entities = JSON.parse(fs.readFileSync(path.join(root, 'public', 'geo', 'entities.json'), 'utf8'));
const iso3 = entities.filter((entity) => entity.kind === 'country' && entity.iso3).map((entity) => entity.iso3);

const fetchJson = async (url) => {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(`Could not fetch ${url}`);
};

const body = (made) => JSON.stringify({...made, sha256: undefined});

if (process.argv.includes('--verify')) {
  if (!fs.existsSync(output)) throw new Error('public/geo/series.json is missing. Run: npm run series:prepare');
  const made = JSON.parse(fs.readFileSync(output, 'utf8'));
  if (made.sha256 !== sha256(Buffer.from(body(made)))) {
    console.error('✗ series.json does not match its checksum. Regenerate it with: npm run series:prepare');
    process.exit(1);
  }
  console.log(`✓ series.json is intact (${Object.keys(made.indicators).join(', ')}; ${made.firstYear}–${made.lastYear})`);
} else {
  const thisYear = new Date().getFullYear();
  const indicators = {};
  let lastYear = 0;
  for (const [id, spec] of Object.entries(INDICATORS)) {
    const rows = [];
    const first = await fetchJson(`https://api.worldbank.org/v2/country/all/indicator/${spec.code}?format=json&per_page=20000&date=${FIRST_YEAR}:${thisYear}`);
    const pages = first[0].pages;
    rows.push(...first[1]);
    for (let page = 2; page <= pages; page++) rows.push(...(await fetchJson(`https://api.worldbank.org/v2/country/all/indicator/${spec.code}?format=json&per_page=20000&page=${page}&date=${FIRST_YEAR}:${thisYear}`))[1]);
    const table = pivot(rows, {iso3, lastYear: thisYear});
    const complete = lastCompleteYear(table);
    const keep = complete - FIRST_YEAR + 1;
    indicators[id] = {name: spec.name, unit: spec.unit, decimals: spec.decimals, code: spec.code, years: table.years.slice(0, keep), countries: Object.fromEntries(Object.entries(table.countries).map(([code, values]) => [code, values.slice(0, keep)]))};
    lastYear = Math.max(lastYear, complete);
    console.log(`  ${id}: ${Object.keys(table.countries).length} countries, ${FIRST_YEAR}–${complete}`);
  }
  const made = {
    source: 'World Bank, World Development Indicators',
    url: 'https://databank.worldbank.org/source/world-development-indicators',
    license: 'CC BY 4.0',
    attribution: 'Data: World Bank, World Development Indicators (CC BY 4.0).',
    fetchedAt: new Date().toISOString().slice(0, 10),
    firstYear: FIRST_YEAR,
    lastYear,
    indicators,
  };
  made.sha256 = sha256(Buffer.from(body(made)));
  fs.writeFileSync(output, `${JSON.stringify(made)}\n`);
  console.log(`✓ wrote ${path.relative(root, output)} (${(fs.statSync(output).size / 1024).toFixed(0)} KB)`);
}
