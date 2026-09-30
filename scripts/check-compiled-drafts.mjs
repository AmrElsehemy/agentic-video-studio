import {spawnSync} from 'node:child_process';
import {listDrafts, repoRoot as root} from './catalog.mjs';

const episodeIds = listDrafts().map((draft) => draft.id).sort();
for (const episodeId of episodeIds) {
  const result = spawnSync(process.execPath, ['scripts/compile-episode.mjs', episodeId, '--check'], {cwd: root, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`✓ ${episodeIds.length} compiled draft artifact${episodeIds.length === 1 ? '' : 's'} verified.`);
