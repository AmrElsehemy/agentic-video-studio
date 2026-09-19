import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const findManifest = (episodeId) => {
  const matches = [];
  for (const show of fs.readdirSync(path.join(root, 'videos'), {withFileTypes: true})) {
    if (!show.isDirectory()) continue;
    const candidate = path.join(root, 'videos', show.name, episodeId, 'video.json');
    if (fs.existsSync(candidate)) matches.push(candidate);
  }
  if (matches.length !== 1) {
    throw new Error(matches.length === 0 ? `Unknown episode: ${episodeId}` : `Episode ID is not unique: ${episodeId}`);
  }
  return {root, manifestPath: matches[0]};
};

