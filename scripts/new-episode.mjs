import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCompletion} from './lib/llm.mjs';
import {fetchWithReason} from './lib/net.mjs';
import {runNewEpisode} from './lib/new-episode.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
const flag = (name) => args.includes(`--${name}`);
const number = Number(args.find((arg) => !arg.startsWith('--')));
if (!Number.isInteger(number) || number < 1) {
  console.error(`Usage: npm run episode:new -- <pokedex-number> [options]\n\n  --pattern=<archetype>   force a story shape (default: the chosen angle's)\n  --voice=local|openai    generate narration after certifying (openai is paid)\n  --render                render the video and cover, then run the video critic\n  --refresh-research      refetch PokéAPI data instead of reusing research/\n  --overwrite             replace an existing draft\n\nRequires ANTHROPIC_API_KEY or OPENAI_API_KEY for the writer.\nOptional: WRITER_PROVIDER (anthropic | openai), WRITER_MODEL.`);
  process.exit(1);
}
const voice = option('voice');
if (voice && !['local', 'openai'].includes(voice)) throw new Error(`Unsupported --voice=${voice}; use local or openai.`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const fetchJson = async (url, {maxAttempts = 4} = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchWithReason('PokéAPI', url);
      if (response.ok) return response.json();
      const error = new Error(`PokéAPI request failed (${response.status}) for ${url}`);
      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) throw error;
    }
    const delay = 500 * (2 ** (attempt - 1));
    console.warn(`  ↻ PokéAPI request failed; retry ${attempt}/${maxAttempts - 1} in ${delay}ms...`);
    await sleep(delay);
  }
  throw lastError;
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
    // Up to 4 writer calls per angle and 10 in total across angles.
    maxAttempts: 4,
    maxWriterCalls: 10,
  }));
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exit(1);
}

run('Certify', 'scripts/certify-episode.mjs', [id, '--fast']);
if (voice) run(`Narration (${voice})`, 'scripts/generate-voice.mjs', [id, `--provider=${voice}`]);
if (flag('render')) {
  run('Render', 'scripts/render.mjs', [id, `--voice=${voice ?? 'none'}`]);
  run('Cover', 'scripts/render-still.mjs', [id]);
  run('Video critic', 'scripts/video-critic.mjs', [id]);
}

console.log(`\n✓ ${id} is ready.`);
if (!flag('render')) console.log(`  Review drafts/pokepulses/${id}.json, then: npm run voice:local -- ${id} && npm run video:local -- ${id}`);