import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {videoSchema} from '../src/schema';
import {findManifest, listManifests, resolveEpisodeId} from './catalog.mjs';
import {paletteMode, paletteProblems} from './lib/palette.mjs';
import {twinProblems} from './lib/twins.mjs';

/**
 * Validate the catalog, or only one episode when `requested` is given: then
 * no other manifest is opened, so a broken one can't block this episode.
 */
export const validateCatalog = ({videosDir, requested, log = console.log}: {videosDir?: string; requested?: string; log?: (line: string) => void} = {}) => {
  const manifests = requested ? [findManifest(requested, videosDir).manifestPath] : listManifests(videosDir);
  if (manifests.length === 0) throw new Error('No video manifests found.');
  for (const manifestPath of manifests) {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (requested && raw.id !== requested) throw new Error(`${manifestPath} has id "${raw.id}", expected "${requested}".`);
    const parsed = videoSchema.parse(raw);
    const seconds = parsed.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
    if (seconds > 60) throw new Error(`${parsed.id} is ${seconds}s; short-form episodes must be 60s or less.`);
    if (new Set(parsed.scenes.map((scene) => scene.id)).size !== parsed.scenes.length) throw new Error(`${parsed.id} has duplicate scene IDs.`);
    // Text and accents must read on a light palette as well as a dark one (#92).
    const faint = paletteProblems(parsed.palette);
    if (faint.length) throw new Error(`${parsed.id}'s palette is too low-contrast: ${faint.join('; ')}.`);
    if (parsed.twinOf) {
      const twin = (() => { try { return JSON.parse(fs.readFileSync(findManifest(parsed.twinOf, videosDir).manifestPath, 'utf8')); } catch { return undefined; } })();
      const problems = twinProblems(parsed, twin);
      if (problems.length) throw new Error(`${parsed.id} isn't a usable twin: ${problems.join('; ')}.`);
    }
    log(`✓ ${parsed.id}: ${parsed.scenes.length} scenes, ${seconds.toFixed(1)}s, ${paletteMode(parsed.palette)} palette`);
  }
  return manifests.length;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) validateCatalog({requested: process.argv[2] && resolveEpisodeId(process.argv[2])});
