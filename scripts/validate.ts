import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {videoSchema} from '../src/schema';
import {resolveEpisodeId} from './catalog.mjs';

/** Every videos/<show>/<episode>/video.json under a folder. */
const allManifests = (videosDir: string) => {
  const manifests: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name === 'video.json') manifests.push(target);
    }
  };
  walk(videosDir);
  return manifests;
};

/** The one manifest for an episode, found by folder so no other manifest is read. */
const episodeManifest = (videosDir: string, episodeId: string) => {
  const matches = fs.readdirSync(videosDir, {withFileTypes: true})
    .filter((show) => show.isDirectory())
    .map((show) => path.join(videosDir, show.name, episodeId, 'video.json'))
    .filter((candidate) => fs.existsSync(candidate));
  if (matches.length !== 1) throw new Error(matches.length === 0 ? `Unknown episode: ${episodeId}` : `Episode ID is not unique: ${episodeId}`);
  return matches[0];
};

/**
 * Validate the catalog, or only one episode when `requested` is given: then
 * no other manifest is opened, so a broken one can't block this episode.
 */
export const validateCatalog = ({videosDir = path.resolve('videos'), requested, log = console.log}: {videosDir?: string; requested?: string; log?: (line: string) => void} = {}) => {
  const manifests = requested ? [episodeManifest(videosDir, requested)] : allManifests(videosDir);
  if (manifests.length === 0) throw new Error('No video manifests found.');
  for (const manifestPath of manifests) {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (requested && raw.id !== requested) throw new Error(`${manifestPath} has id "${raw.id}", expected "${requested}".`);
    const parsed = videoSchema.parse(raw);
    const seconds = parsed.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
    if (seconds > 60) throw new Error(`${parsed.id} is ${seconds}s; short-form episodes must be 60s or less.`);
    if (new Set(parsed.scenes.map((scene) => scene.id)).size !== parsed.scenes.length) throw new Error(`${parsed.id} has duplicate scene IDs.`);
    log(`✓ ${parsed.id}: ${parsed.scenes.length} scenes, ${seconds.toFixed(1)}s`);
  }
  return manifests.length;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) validateCatalog({requested: process.argv[2] && resolveEpisodeId(process.argv[2])});
