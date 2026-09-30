import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The repository root: every path here is resolved from it, so scripts work from any directory. */
export const repoRoot = root;
const defaultVideos = path.join(root, 'videos');
const defaultDrafts = path.join(root, 'drafts');

const folders = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() : []);

/** Every compiled manifest, videos/<show>/<episode>/video.json, in a stable order. */
export const listManifests = (videosDir = defaultVideos) => folders(videosDir)
  .flatMap((show) => folders(path.join(videosDir, show)).map((episode) => path.join(videosDir, show, episode, 'video.json')))
  .filter((file) => fs.existsSync(file));

/** The one compiled manifest for an episode; throws when it is missing or its id is used by two shows. */
export const findManifest = (episodeId, videosDir = defaultVideos) => {
  const matches = listManifests(videosDir).filter((file) => path.basename(path.dirname(file)) === episodeId);
  if (matches.length !== 1) {
    throw new Error(matches.length === 0 ? `Unknown episode: ${episodeId}` : `Episode ID is not unique: ${episodeId}`);
  }
  return {root, manifestPath: matches[0]};
};

/** Every creative draft, drafts/<show>/<id>.json. */
export const listDrafts = (draftsDir = defaultDrafts) => folders(draftsDir).flatMap((showId) => fs.readdirSync(path.join(draftsDir, showId))
  .filter((file) => /^[a-z0-9-]+\.json$/.test(file))
  .sort()
  .map((file) => ({id: file.slice(0, -'.json'.length), showId, draftPath: path.join(draftsDir, showId, file)})));

/** An episode's draft, or undefined when it only has a hand-written manifest. */
export const findDraft = (episodeId, draftsDir = defaultDrafts) => listDrafts(draftsDir).find((draft) => draft.id === episodeId);

/** Every episode id with a draft or a compiled manifest. */
export const episodeIds = () => [...new Set([
  ...listManifests().map((file) => path.basename(path.dirname(file))),
  ...listDrafts().map((draft) => draft.id),
])].sort();

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
