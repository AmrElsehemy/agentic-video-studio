// One command for an episode's whole path, from draft to MP4 (#23). Each stage
// declares what it depends on. A lock file (build/<id>/lock.json) records the
// hash of those inputs when the stage last succeeded, so an unchanged stage is
// skipped. Stages hash their upstream stages' *outputs* (the compiled
// manifest, the narration timing), not the upstream inputs, so a change that
// doesn't alter an output stops there: a new headline re-renders but doesn't
// re-voice.
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {findDraft, listManifests} from '../catalog.mjs';
import {compileEpisode, serializeManifest} from './compiler.mjs';
import {voiceInputHash} from './voice-lock.mjs';

export const STAGES = ['compile', 'lint', 'preview', 'approve', 'voice', 'render'];
export const PIPELINE_VOICES = ['none', 'local', 'openai'];
/** Bump to invalidate every lock when stage behaviour changes. */
export const PIPELINE_VERSION = 1;

export const hashOf = (value) => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 16);

/** A hash of every file under the given paths (files or folders, relative to root), by path and content; missing paths count as absent. */
export const hashFiles = (root, paths) => {
  const files = [];
  const walk = (target) => {
    if (!fs.existsSync(target)) return;
    if (fs.statSync(target).isDirectory()) {
      for (const entry of fs.readdirSync(target).sort()) walk(path.join(target, entry));
    } else files.push(target);
  };
  for (const item of paths) walk(path.join(root, item));
  const hash = crypto.createHash('sha256');
  for (const file of files) hash.update(`${path.relative(root, file)}\0`).update(fs.readFileSync(file)).update('\0');
  return hash.digest('hex').slice(0, 16);
};

export const readLock = (file) => {
  try {
    const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
    return lock.version === PIPELINE_VERSION ? lock : {version: PIPELINE_VERSION, stages: {}, approvals: {}};
  } catch {
    return {version: PIPELINE_VERSION, stages: {}, approvals: {}};
  }
};

export const writeLock = (file, lock) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(lock, null, 2)}\n`);
};

/**
 * Run stages in order up to `until`. A stage is skipped when its input hash
 * matches the lock and its outputs exist; `force` re-runs named stages. A gate
 * stage stops the run until its condition holds. Returns what ran, what was
 * cached, what was skipped and where it stopped.
 * @param {{stages: PipelineStage[], until?: string, force?: string[], lock: object, saveLock?: (lock: object) => void, dryRun?: boolean, log?: (line: string) => void}} options
 */
export const runPipeline = async ({stages, until = stages.at(-1).name, force = [], lock, saveLock = () => {}, dryRun = false, log = console.log}) => {
  const last = stages.findIndex((stage) => stage.name === until);
  if (last === -1) throw new Error(`Unknown stage "${until}". Stages: ${stages.map((stage) => stage.name).join(', ')}.`);
  const result = {ran: [], cached: [], skipped: [], stoppedAt: null};
  // In a dry run nothing is rebuilt, so once a stage would run, later stages can't be judged from their inputs.
  let dryUpstream = null;
  for (const stage of stages.slice(0, last + 1)) {
    // After a dry-run stage, inputs may not exist yet (a first compile), so they are only a hint.
    const inputs = dryUpstream ? await Promise.resolve().then(() => stage.inputs()).catch(() => null) : await stage.inputs();
    if (inputs && typeof inputs === 'object' && 'skip' in inputs) {
      log(`– ${stage.name}: ${inputs.skip}`);
      result.skipped.push(stage.name);
      continue;
    }
    if (dryUpstream) {
      log(`▶ ${stage.name} may run (if ${dryUpstream} changes its output)`);
      result.ran.push(stage.name);
      continue;
    }
    const hash = hashOf({stage: stage.name, version: PIPELINE_VERSION, inputs});
    if (stage.gate) {
      const blocked = stage.gate(hash, lock);
      if (blocked) {
        log(`■ ${stage.name}: ${blocked}`);
        result.stoppedAt = stage.name;
        return result;
      }
      log(`✓ ${stage.name}`);
      result.cached.push(stage.name);
      continue;
    }
    const outputs = stage.outputs?.() ?? [];
    const missing = outputs.filter((file) => !fs.existsSync(file));
    if (lock.stages[stage.name]?.hash === hash && !missing.length && !force.includes(stage.name)) {
      log(`✓ ${stage.name} (unchanged)`);
      result.cached.push(stage.name);
      continue;
    }
    const why = force.includes(stage.name) ? 'forced' : !lock.stages[stage.name] ? 'never run' : missing.length ? 'output missing' : 'inputs changed';
    if (dryRun) {
      log(`▶ ${stage.name} would run (${why})`);
      result.ran.push(stage.name);
      dryUpstream ??= stage.name;
      continue;
    }
    log(`\n▶ ${stage.name} (${why})`);
    try {
      await stage.run();
    } catch (error) {
      log(`✗ ${stage.name} failed: ${error instanceof Error ? error.message : String(error)}`);
      delete lock.stages[stage.name];
      saveLock(lock);
      result.stoppedAt = stage.name;
      result.failed = true;
      return result;
    }
    lock.stages[stage.name] = {hash, at: new Date().toISOString()};
    saveLock(lock);
    result.ran.push(stage.name);
  }
  return result;
};

/** Run a command, throwing when it fails (its output goes to the terminal). */
export const execStep = (root, env = {}) => (label, command, args) => {
  console.log(`  · ${label}`);
  const run = spawnSync(command, args, {cwd: root, stdio: 'inherit', env: {...process.env, ...env}});
  if (run.status !== 0) throw new Error(`${label} exited with ${run.status ?? run.signal}`);
};

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
/** Code the render reads: the composition, schemas and the map data. */
const RENDER_CODE = ['src', 'public/geo', 'remotion.config.ts', 'scripts/lib/render-props.mjs', 'scripts/generate-audio.mjs', 'scripts/lib/audio-bed.mjs', 'scripts/lib/sound-design.mjs'];

/**
 * The episode stages. `exec(label, command, args)` runs a step and throws on
 * failure (injectable for tests). Paid OpenAI voice needs the approve stage:
 * a person looks at the preview frames and runs with --approve.
 */
export const episodeStages = ({root, episodeId, voice = 'none', exec = execStep(root, {STUDIO_CHECKED: episodeId})}) => {
  if (!PIPELINE_VOICES.includes(voice)) throw new Error(`Unsupported voice "${voice}". Use one of: ${PIPELINE_VOICES.join(', ')}.`);
  const found = findDraft(episodeId, path.join(root, 'drafts'));
  const draft = found && {showId: found.showId, file: found.draftPath};
  const manifestFile = () => listManifests(path.join(root, 'videos')).find((file) => path.basename(path.dirname(file)) === episodeId)
    ?? (draft && path.join(root, 'videos', draft.showId, episodeId, 'video.json'));
  const manifestText = () => {
    const file = manifestFile();
    if (!file || !fs.existsSync(file)) throw new Error(`${episodeId} has no compiled manifest (videos/<show>/${episodeId}/video.json) and no draft to compile.`);
    return fs.readFileSync(file, 'utf8');
  };
  const manifestHash = () => hashOf(manifestText());
  const timingFile = path.join(root, 'public', 'generated', `${episodeId}-${voice}-timing.json`);

  return [
    {
      name: 'compile',
      inputs: () => (draft
        ? {draft: hashFiles(root, [path.relative(root, draft.file)]), show: hashFiles(root, [`shows/${draft.showId}.json`]), code: hashFiles(root, ['scripts/lib', 'scripts/draft-schema.mjs', 'scripts/primitive-schema.mjs', 'scripts/subject-schema.mjs', 'scripts/show-schema.mjs', 'scripts/archetypes.mjs', 'public/geo/entities.json'])}
        : {skip: 'no draft; using the hand-written manifest'}),
      outputs: () => [manifestFile()],
      run: () => {
        const {manifest, totalSeconds} = compileEpisode(JSON.parse(fs.readFileSync(draft.file, 'utf8')), {showId: draft.showId});
        const output = manifestFile();
        fs.mkdirSync(path.dirname(output), {recursive: true});
        fs.writeFileSync(output, serializeManifest(manifest));
        console.log(`  ✓ ${path.relative(root, output)} (${totalSeconds.toFixed(1)}s)`);
      },
    },
    {
      name: 'lint',
      // TypeScript checks the whole project, so every source file is an input.
      inputs: () => ({manifest: manifestHash(), code: hashFiles(root, ['src', 'scripts', 'tsconfig.json', 'package-lock.json'])}),
      run: () => {
        exec('schema + structure', process.execPath, ['--import', 'tsx', 'scripts/validate.ts', episodeId]);
        exec('engagement audit', process.execPath, ['scripts/engagement-audit.mjs', episodeId]);
        exec('voice timing preflight', process.execPath, ['scripts/preflight-voice.mjs', episodeId]);
        exec('typecheck', npx, ['tsc', '--noEmit']);
      },
    },
    {
      name: 'preview',
      inputs: () => ({manifest: manifestHash(), code: hashFiles(root, RENDER_CODE)}),
      outputs: () => [path.join(root, 'out', `${episodeId}-frames`, '00.png')],
      run: () => exec('review frames (no voice)', process.execPath, ['scripts/frame-check.mjs', episodeId, '--voice=none']),
    },
    {
      name: 'approve',
      inputs: () => (voice === 'openai' ? {manifest: manifestHash()} : {skip: `not needed for ${voice === 'none' ? 'a render without narration' : 'local voice'}`}),
      gate: (hash, lock) => (lock.approvals?.[hash]
        ? null
        : `paid voice needs a person to approve this version. Review out/${episodeId}-frames/ (npm run sheet -- ${episodeId} --frames), then run: npm run pipeline -- ${episodeId} --voice=openai --approve`),
    },
    {
      name: 'voice',
      inputs: () => (voice === 'none' ? {skip: 'no narration (--voice=none)'} : {provider: voice, narration: voiceInputHash(JSON.parse(manifestText()), voice)}),
      outputs: () => [timingFile],
      run: () => exec(`${voice} narration`, process.execPath, ['scripts/generate-voice.mjs', episodeId, `--provider=${voice}`]),
    },
    {
      name: 'render',
      inputs: () => ({manifest: manifestHash(), voice, narration: voice === 'none' ? null : hashFiles(root, [path.relative(root, timingFile)]), code: hashFiles(root, [...RENDER_CODE, 'scripts/render.mjs', 'scripts/qa.mjs'])}),
      outputs: () => [path.join(root, 'out', `${episodeId}.mp4`)],
      run: () => exec('render + media QA', process.execPath, ['scripts/render.mjs', episodeId, `--voice=${voice}`]),
    },
  ];
};

/** The approval key for the current compiled manifest: the approve stage's hash. */
export const approvalHash = (stages) => {
  const stage = stages.find((item) => item.name === 'approve');
  const inputs = stage.inputs();
  if ('skip' in inputs) return null;
  return hashOf({stage: 'approve', version: PIPELINE_VERSION, inputs});
};
