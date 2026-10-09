// Where an episode's generated files live: out/<show>/<episode>/. The file names inside keep the
// old flat spelling (<id>.mp4, <id>-cover.png, ...), so a file is easy to find from either side.
import fs from 'node:fs';
import path from 'node:path';

const subfolders = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name) : []);

/** The show an episode belongs to, from its compiled manifest or its draft; null when neither exists. */
export const showOfEpisode = (root, episodeId) => {
  for (const show of subfolders(path.join(root, 'videos'))) {
    if (fs.existsSync(path.join(root, 'videos', show, episodeId, 'video.json'))) return show;
  }
  for (const show of subfolders(path.join(root, 'drafts'))) {
    if (fs.existsSync(path.join(root, 'drafts', show, `${episodeId}.json`))) return show;
  }
  return null;
};

/** out/<show>/<episode>/ (not created); out/_unsorted/<episode>/ for an id with no manifest or draft. */
export const episodeOutDir = (root, episodeId) => path.join(root, 'out', showOfEpisode(root, episodeId) ?? '_unsorted', episodeId);

/** A file or folder inside the episode's output folder. */
export const episodeOutPath = (root, episodeId, ...parts) => path.join(episodeOutDir(root, episodeId), ...parts);

/** Like episodeOutPath, but creates the episode's folder first: use it for a file about to be written. */
export const episodeOutFile = (root, episodeId, ...parts) => {
  const file = episodeOutPath(root, episodeId, ...parts);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  return file;
};

/**
 * The same path, falling back to the old flat out/<file> when only that exists. Reading another
 * checkout (the visual review's base branch) needs this until that branch has the nested layout too.
 */
export const episodeOutPathOrLegacy = (root, episodeId, ...parts) => {
  const nested = episodeOutPath(root, episodeId, ...parts);
  const flat = path.join(root, 'out', ...parts);
  return !fs.existsSync(nested) && fs.existsSync(flat) ? flat : nested;
};
