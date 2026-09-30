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


/** Every episode id with a draft or a compiled manifest. */
export const episodeIds = () => {
  const ids = new Set();
  const videos = path.join(root, 'videos');
  for (const show of fs.existsSync(videos) ? fs.readdirSync(videos, {withFileTypes: true}) : []) {
    if (!show.isDirectory()) continue;
    for (const episode of fs.readdirSync(path.join(videos, show.name), {withFileTypes: true})) {
      if (episode.isDirectory() && fs.existsSync(path.join(videos, show.name, episode.name, 'video.json'))) ids.add(episode.name);
    }
  }
  const drafts = path.join(root, 'drafts');
  for (const show of fs.existsSync(drafts) ? fs.readdirSync(drafts, {withFileTypes: true}) : []) {
    if (!show.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(drafts, show.name))) {
      if (/^[a-z0-9-]+\.json$/.test(file)) ids.add(file.slice(0, -'.json'.length));
    }
  }
  return [...ids].sort();
};

/**
 * Accept an episode by its id ("charmander-004") or its Pokédex number
 * ("4", "004", "#4"), and return the id. Anything that isn't a number is
 * returned as is, so ids keep working everywhere.
 */
export const resolveEpisodeId = (value, ids = episodeIds()) => {
  const number = String(value ?? '').match(/^#?0*(\d+)$/)?.[1];
  if (!number) return value;
  const suffix = `-${number.padStart(3, '0')}`;
  const matches = ids.filter((id) => id.endsWith(suffix));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new Error(`No episode for Pokédex #${number}. Create it with: npm run episode:new -- ${number}`);
  throw new Error(`Pokédex #${number} matches several episodes (${matches.join(', ')}); use the full id.`);
};
