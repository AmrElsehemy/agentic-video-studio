import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const episodeId = process.argv[2];
if (!episodeId) throw new Error('Usage: npm run episode:prepare -- <episode-id>');

const run = (label, args) => {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(process.execPath, args, {cwd: root, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('Compile creative draft', ['scripts/compile-episode.mjs', episodeId]);
run('Certify before paid voice', ['scripts/certify-episode.mjs', episodeId, '--fast']);
console.log(`\n✓ ${episodeId} is compiled and certified. Paid voice is now allowed.`);
