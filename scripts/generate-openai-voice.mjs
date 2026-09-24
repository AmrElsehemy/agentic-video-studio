import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const episodeId = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
if (!episodeId) throw new Error('Usage: npm run voice:openai -- <episode-id>');

const certify = spawnSync(process.execPath, ['scripts/certify-episode.mjs', '--fast', episodeId], {cwd: root, stdio: 'inherit'});
if (certify.status !== 0) {
  console.error('\nPaid TTS blocked: episode certification did not pass.');
  process.exit(certify.status ?? 1);
}

console.log('\n✓ Certification passed. Paid TTS is now allowed.');
const generate = spawnSync(process.execPath, ['scripts/generate-voice.mjs', '--provider=openai', episodeId], {cwd: root, stdio: 'inherit'});
process.exit(generate.status ?? 1);
