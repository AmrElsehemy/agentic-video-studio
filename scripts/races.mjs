// Ranked races: many Pokémon in one video, kept apart from the one-Pokémon episodes (videos/, drafts/).
//   npm run races:prepare               download and pin public/pokedex/dex.json from PokéAPI (commit the result)
//   npm run races:verify                check the pinned table against its checksum (no network)
//   npm run races:candidates            score every race the table allows; write research/races/candidates.json
//   npm run races:new -- <race-id>      write races/pokepulses/<race-id>.json, e.g. both-psychic-top-hp
//   npm run races:render -- <race-id>   check it against the table and render out/pokepulses-races/<race-id>/<race-id>.mp4
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {allRaces, buildRace, checkRace, dexRow, parseCandidateId, raceBeats, shortlist, tableChecksum} from './lib/dex.mjs';
import {writeAudioBed} from './lib/audio-bed.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tablePath = path.join(root, 'public', 'pokedex', 'dex.json');
const candidatesPath = path.join(root, 'research', 'races', 'candidates.json');
const raceDir = path.join(root, 'races', 'pokepulses');
const show = JSON.parse(fs.readFileSync(path.join(root, 'shows', 'pokepulses.json'), 'utf8'));
const LAST_ID = 251;

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

const readTable = () => {
  if (!fs.existsSync(tablePath)) throw new Error('public/pokedex/dex.json is missing. Run: npm run races:prepare');
  const table = JSON.parse(fs.readFileSync(tablePath, 'utf8'));
  if (table.sha256 !== tableChecksum(table)) throw new Error('public/pokedex/dex.json does not match its checksum. Regenerate it with: npm run races:prepare');
  return table;
};

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`);
};

const [command, arg] = process.argv.slice(2);

if (command === 'prepare') {
  const pokemon = [];
  const ids = Array.from({length: LAST_ID}, (_, index) => index + 1);
  for (let start = 0; start < ids.length; start += 25) {
    pokemon.push(...await Promise.all(ids.slice(start, start + 25).map(async (id) => dexRow(
      await fetchJson(`https://pokeapi.co/api/v2/pokemon/${id}`),
      await fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
    ))));
    console.log(`  ${pokemon.length}/${ids.length}`);
  }
  const table = {source: 'PokéAPI', url: 'https://pokeapi.co', fetchedAt: new Date().toISOString().slice(0, 10), note: 'Base stats as in the current games. Height in decimetres, weight in hectograms (PokéAPI units).', pokemon};
  table.sha256 = tableChecksum(table);
  writeJson(tablePath, table);
  console.log(`✓ public/pokedex/dex.json: ${pokemon.length} Pokémon, ${table.fetchedAt}`);
} else if (command === 'verify') {
  try {
    const table = readTable();
    console.log(`✓ dex.json is intact (${table.pokemon.length} Pokémon, fetched ${table.fetchedAt})`);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
} else if (command === 'candidates') {
  const table = readTable();
  const races = allRaces(table.pokemon);
  const picked = shortlist(races);
  const raceable = races.filter((race) => race.score >= 0);
  writeJson(candidatesPath, {table: {fetchedAt: table.fetchedAt, sha256: table.sha256}, counts: {all: races.length, ties: races.length - raceable.length, raceable: raceable.length, shortlist: picked.length}, shortlist: picked, raceable});
  console.log(`${races.length} races, ${races.length - raceable.length} tie for first, ${raceable.length} raceable, ${picked.length} on the shortlist\n`);
  for (const race of picked.slice(0, Number(arg) || 25)) console.log(`${race.score.toFixed(1).padStart(4)}  ${race.id.padEnd(34)} ${race.winner} ${race.value} vs ${race.runnerUp} ${race.runnerUpValue} (${race.why.join(', ')})`);
  console.log(`\nAll of them: research/races/candidates.json. Make one: npm run races:new -- <race-id>`);
} else if (command === 'new') {
  if (!arg) throw new Error('Usage: npm run races:new -- <race-id>   (see npm run races:candidates)');
  const manifest = buildRace(readTable(), parseCandidateId(arg));
  const file = path.join(raceDir, `${manifest.id}.json`);
  writeJson(file, manifest);
  console.log(`✓ ${path.relative(root, file)}: ${manifest.racers.map((racer) => racer.name).join(', ')}`);
  console.log(`  Headlines and the question can be edited by hand. Render: npm run races:render -- ${manifest.id}`);
} else if (command === 'render') {
  if (!arg) throw new Error('Usage: npm run races:render -- <race-id>');
  const file = path.join(raceDir, `${arg}.json`);
  if (!fs.existsSync(file)) throw new Error(`No race ${arg}. Make it with: npm run races:new -- ${arg}`);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = checkRace(readTable(), manifest);
  if (problems.length) {
    console.error(`✗ ${arg} no longer matches the pinned table:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exit(1);
  }
  // Artwork is downloaded into public/generated (git-ignored), so the render needs no network.
  const art = path.join(root, 'public', 'generated', 'races');
  fs.mkdirSync(art, {recursive: true});
  for (const racer of manifest.racers) {
    const target = path.join(art, `${racer.id}.png`);
    if (fs.existsSync(target)) continue;
    const response = await fetch(racer.artworkUrl);
    if (!response.ok) throw new Error(`Could not download artwork for ${racer.name}: ${response.status}`);
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  }
  const audioId = `race-${manifest.id}`;
  writeAudioBed({root, episodeId: audioId, manifest: {audio: {bed: show.music}, scenes: raceBeats(manifest)}});
  const props = {
    manifest: {...manifest, racers: manifest.racers.map((racer) => ({...racer, artwork: `generated/races/${racer.id}.png`}))},
    brand: {wordmark: show.wordmark, palette: show.palette},
    audio: {music: `generated/${audioId}-bed.wav`, sfx: `generated/${audioId}-sfx.wav`, musicVolume: 0.42, sfxVolume: 0.5},
  };
  const outDir = path.join(root, 'out', 'pokepulses-races', manifest.id);
  fs.mkdirSync(outDir, {recursive: true});
  const propsPath = path.join(outDir, 'props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props));
  const output = path.join(outDir, `${manifest.id}.mp4`);
  const renderArgs = ['remotion', 'render', 'src/races/index.ts', 'RankedRace', output, `--props=${propsPath}`, '--codec=h264', '--crf=18', '--pixel-format=yuv420p'];
  if (process.env.REMOTION_BROWSER_EXECUTABLE) renderArgs.push(`--browser-executable=${process.env.REMOTION_BROWSER_EXECUTABLE}`);
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', renderArgs, {cwd: root, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`✓ ${path.relative(root, output)}`);
} else {
  console.error('Usage: node scripts/races.mjs <prepare|verify|candidates|new|render> [race-id]');
  process.exit(1);
}
