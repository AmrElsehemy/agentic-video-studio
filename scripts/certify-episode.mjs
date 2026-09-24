import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const episodeId = args.find((arg) => !arg.startsWith('--'));
const fast = args.includes('--fast');
if (!episodeId) throw new Error('Usage: node scripts/certify-episode.mjs <episode-id> [--fast]');

const run = (label, command, commandArgs) => {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, commandArgs, {cwd: root, stdio: 'inherit'});
  if (result.status !== 0) {
    console.error(`\n✗ Episode certification failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
};

const hasDraft = () => {
  const draftsRoot = path.join(root, 'drafts');
  if (!fs.existsSync(draftsRoot)) return false;
  return fs.readdirSync(draftsRoot, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .some((entry) => fs.existsSync(path.join(draftsRoot, entry.name, `${episodeId}.json`)));
};

if (hasDraft()) run('Draft → compiled artifact parity', process.execPath, ['scripts/compile-episode.mjs', episodeId, '--check']);
run('Schema + structural validation', process.execPath, ['--import', 'tsx', 'scripts/validate.ts', episodeId]);
run('Archetype engagement audit', process.execPath, ['scripts/engagement-audit.mjs', episodeId]);
run('Voice timing preflight', process.execPath, ['scripts/preflight-voice.mjs', episodeId]);
run('TypeScript compatibility', process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '--noEmit']);

if (!fast) run('Zero-token render + media QA', process.execPath, ['scripts/render.mjs', '--voice=none', episodeId]);

console.log(`\n✓ ${episodeId} certified${fast ? ' for paid voice generation' : ' end-to-end without paid TTS'}.`);
