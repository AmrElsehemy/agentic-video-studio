import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCompletion} from './lib/llm.mjs';
import {fetchWithReason} from './lib/net.mjs';
import {appendProduction, modelEntry} from './lib/production.mjs';
import {runNewEpisode} from './lib/new-episode.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
const flag = (name) => args.includes(`--${name}`);
// Pokédex numbers: "5", "5 6 7" or ranges like "5-9"; each episode runs in turn.
const numbers = args.filter((arg) => !arg.startsWith('--')).flatMap((arg) => {
  const range = arg.match(/^(\d+)-(\d+)$/);
  if (!range) return [Number(arg)];
  const [from, to] = [Number(range[1]), Number(range[2])];
  return from <= to ? Array.from({length: to - from + 1}, (_, index) => from + index) : [NaN];
});
if (!numbers.length || numbers.some((number) => !Number.isInteger(number) || number < 1)) {
  console.error(`Usage: npm run episode:new -- <pokedex-number>... [options]\n\n  Numbers: 5, several (5 6 7) or a range (5-9). A failed episode doesn't stop the rest; a summary follows.\n\n  --pattern=<archetype>   force a story shape (default: the chosen angle's)\n  --voice=local|openai    generate narration after certifying (openai is paid)\n  --render                render the video and cover, then run the video critic\n  --refresh-research      refetch PokéAPI data instead of reusing research/\n  --overwrite             replace an existing draft\n  --strict-story          keep rewriting until the story critic passes (costs more)\n\nRequires ANTHROPIC_API_KEY or OPENAI_API_KEY for the writer.\nOptional: WRITER_PROVIDER (anthropic | openai), WRITER_MODEL.`);
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

/** Run a stage as its own process; returns whether it passed. */
const run = (label, script, scriptArgs) => {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {cwd: root, stdio: 'inherit'});
  return result.status === 0;
};

// Each agent can run on its own model (see "Models" in the README).
// Every call is logged once the episode has an id (production log, #89).
const calls = [];
const models = Object.fromEntries(['writer', 'angles', 'angle-critic', 'verifier', 'critic', 'director'].map((role) => [role, createCompletion({role, onUsage: (usage) => calls.push(modelEntry(usage))})]));
const byModel = new Map();
for (const [role, {provider, model}] of Object.entries(models)) {
  const label = `${provider} (${model})`;
  byModel.set(label, [...(byModel.get(label) ?? []), role]);
}

/** Create, certify and (optionally) voice and render one episode. Returns {id?, failed?: stage}. */
const createEpisode = async (number) => {
  console.log(`▶ Creating an episode for Pokédex #${number}`);
  for (const [label, roles] of byModel) console.log(`  ${roles.join(', ')}: ${label}`);
  let id;
  try {
    ({id} = await runNewEpisode({
      number,
      fetchJson,
      complete: models.writer,
      ideate: models.angles,
      angleCritique: models['angle-critic'],
      verify: models.verifier,
      critique: models.critic,
      direct: models.director,
      storyPattern: option('pattern') || undefined,
      refreshResearch: flag('refresh-research'),
      overwrite: flag('overwrite'),
      // Up to 4 writer calls per angle and 10 in total across angles. The story
      // gets one revision; then the best draft whose facts pass is kept, flagged
      // for review (--strict-story makes the story a hard gate again).
      maxAttempts: 4,
      maxWriterCalls: 10,
      strictStory: flag('strict-story'),
    }));
  } catch (error) {
    console.error(`\n✗ ${error.message}`);
    calls.length = 0;
    return {failed: 'writing'};
  }
  appendProduction(root, 'pokepulses', id, calls.splice(0));

  const stages = [
    ['Certify', 'scripts/certify-episode.mjs', [id, '--fast']],
    ...(voice ? [[`Narration (${voice})`, 'scripts/generate-voice.mjs', [id, `--provider=${voice}`]]] : []),
    ...(flag('render') ? [
      ['Render', 'scripts/render.mjs', [id, `--voice=${voice ?? 'none'}`]],
      ['Cover', 'scripts/render-still.mjs', [id]],
      ['Video critic', 'scripts/video-critic.mjs', [id]],
    ] : []),
  ];
  for (const [label, script, scriptArgs] of stages) {
    if (!run(label, script, scriptArgs)) return {id, failed: label};
  }
  console.log(`\n✓ ${id} is ready.`);
  if (!flag('render')) console.log(`  Review drafts/pokepulses/${id}.json, then: npm run voice:local -- ${id} && npm run video:local -- ${id}`);
  return {id};
};

const results = [];
for (const number of numbers) {
  if (results.length) console.log(`\n${'─'.repeat(60)}\n`);
  results.push({number, ...(await createEpisode(number))});
}
if (numbers.length > 1) {
  console.log(`\n${'─'.repeat(60)}\nSummary: ${results.filter((result) => !result.failed).length}/${results.length} ready`);
  for (const {number, id, failed} of results) console.log(`  ${failed ? '✗' : '✓'} #${number}${id ? ` ${id}` : ''}${failed ? `: failed at ${failed}` : ''}`);
}
process.exit(results.some((result) => result.failed) ? 1 : 0);
