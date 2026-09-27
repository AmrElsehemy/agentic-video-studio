import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCompletion} from './lib/llm.mjs';
import {runNewEpisode} from './lib/new-episode.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
const flag = (name) => args.includes(`--${name}`);
const number = Number(args.find((arg) => !arg.startsWith('--')));
if (!Number.isInteger(number) || number < 1) {
  console.error(`Usage: npm run episode:new -- <pokedex-number> [options]

  --pattern=<archetype>   force a story shape (default: the chosen angle's)
  --voice=local|openai    generate narration after certifying (openai is paid)
  --render                render the video after certifying
  --refresh-research      refetch PokéAPI data instead of reusing research/
  --overwrite             replace an existing draft

Requires ANTHROPIC_API_KEY or OPENAI_API_KEY for the writer.
Optional: WRITER_PROVIDER (anthropic | openai), WRITER_MODEL.`);
  process.exit(1);
}
const voice = option('voice');
if (voice && !['local', 'openai'].includes(voice)) throw new Error(`Unsupported --voice=${voice}; use local or openai.`);

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PokéAPI request failed (${response.status}) for ${url}`);
  return response.json();
};

const run = (label, script, scriptArgs) => {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {cwd: root, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
};

console.log(`▶ Creating an episode for Pokédex #${number}`);
let id;
try {
  const complete = createCompletion();
  console.log(`  writer: ${complete.provider} (${complete.model})`);
  ({id} = await runNewEpisode({
    number,
    fetchJson,
    complete,
    storyPattern: option('pattern') || undefined,
    refreshResearch: flag('refresh-research'),
    overwrite: flag('overwrite'),
  }));
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exit(1);
}

run('Certify', 'scripts/certify-episode.mjs', [id, '--fast']);
if (voice) run(`Narration (${voice})`, 'scripts/generate-voice.mjs', [id, `--provider=${voice}`]);
if (flag('render')) run('Render', 'scripts/render.mjs', [id, `--voice=${voice ?? 'none'}`]);

console.log(`\n✓ ${id} is ready.`);
if (!flag('render')) console.log(`  Review drafts/pokepulses/${id}.json, then: npm run voice:local -- ${id} && npm run video:local -- ${id}`);
