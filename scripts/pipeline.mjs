// Run an episode from draft to MP4, skipping every stage whose inputs haven't
// changed since it last succeeded (#23). The lock is build/<id>/lock.json.
//   npm run pipeline -- <id>                          compile → lint → preview → render (no narration)
//   npm run pipeline -- <id> --voice=openai           …stops at approve until a person approves this version
//   npm run pipeline -- <id> --voice=openai --approve approve the current version, then voice and render
//   npm run pipeline -- <id> --until=preview          stop after a stage
//   npm run pipeline -- <id> --force=render           re-run a stage (comma-separated) even if unchanged
//   npm run pipeline -- <id> --dry-run                show what would run
// Research and drafting are npm run episode:new; publishing is npm run youtube:upload.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {appendProduction} from './lib/production.mjs';
import {approvalHash, episodeStages, PAID_VOICES, PIPELINE_VOICES, readLock, runPipeline, STAGES, writeLock} from './lib/pipeline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const target = args.find((arg) => !arg.startsWith('--'));
if (!target) {
  console.error(`Usage: npm run pipeline -- <episode-id> [--voice=${PIPELINE_VOICES.join('|')}] [--until=${STAGES.join('|')}] [--force=<stage,...>] [--approve] [--dry-run]`);
  process.exit(1);
}
const episodeId = resolveEpisodeId(target);
const showOf = (id) => path.basename(path.dirname(path.dirname(findManifest(id).manifestPath)));
const voice = option('voice') ?? 'none';
const until = option('until') ?? 'render';
const force = option('force')?.split(',').filter(Boolean) ?? [];
for (const stage of [until, ...force]) if (!STAGES.includes(stage)) { console.error(`✗ unknown stage "${stage}". Stages: ${STAGES.join(', ')}.`); process.exit(1); }

const lockFile = path.join(root, 'build', episodeId, 'lock.json');
const lock = readLock(lockFile);
const stages = episodeStages({root, episodeId, voice});
const common = {stages, force, lock, saveLock: (value) => writeLock(lockFile, value), dryRun: args.includes('--dry-run')};
const started = Date.now();
console.log(`${episodeId}: ${STAGES.slice(0, STAGES.indexOf(until) + 1).join(' → ')} (voice: ${voice})`);

let result;
if (args.includes('--approve')) {
  if (!PAID_VOICES.includes(voice)) { console.error(`✗ --approve is for paid narration; add --voice=${PAID_VOICES.join(' or --voice=')}.`); process.exit(1); }
  // The approval covers the version the preview showed, so bring everything up to the preview first.
  result = await runPipeline({...common, until: 'preview'});
  if (!result.stoppedAt) {
    lock.approvals ??= {};
    lock.approvals[approvalHash(stages)] = {at: new Date().toISOString()};
    if (!common.dryRun) {
      writeLock(lockFile, lock);
      appendProduction(root, showOf(episodeId), episodeId, [{kind: 'approval', what: 'paid narration'}]);
    }
    console.log('✓ approved this version for paid narration');
    if (STAGES.indexOf(until) > STAGES.indexOf('preview')) result = await runPipeline({...common, until});
  }
} else {
  result = await runPipeline({...common, until});
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (result.failed) { console.error(`\n✗ ${episodeId} stopped: ${result.stoppedAt} failed (${seconds}s). Fix it and run again; finished stages are kept.`); process.exit(1); }
if (result.stoppedAt) { console.log(`\n■ ${episodeId} is waiting at ${result.stoppedAt} (${seconds}s).`); process.exit(0); }
console.log(`\n✓ ${episodeId}: ran ${result.ran.join(', ') || 'nothing'}${result.cached.length ? `; unchanged: ${result.cached.join(', ')}` : ''} (${seconds}s)`);
