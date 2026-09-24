import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftsRoot = path.join(root, 'drafts');
if (!fs.existsSync(draftsRoot)) process.exit(0);

const episodeIds = [];
for (const show of fs.readdirSync(draftsRoot, {withFileTypes: true})) {
  if (!show.isDirectory()) continue;
  const showDir = path.join(draftsRoot, show.name);
  for (const entry of fs.readdirSync(showDir, {withFileTypes: true})) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    episodeIds.push(entry.name.replace(/\.json$/, ''));
  }
}

for (const episodeId of episodeIds.sort()) {
  const result = spawnSync(process.execPath, ['scripts/compile-episode.mjs', episodeId, '--check'], {cwd: root, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`✓ ${episodeIds.length} compiled draft artifact${episodeIds.length === 1 ? '' : 's'} verified.`);
