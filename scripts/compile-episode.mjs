import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileEpisode, manifestDrift, serializeManifest} from './lib/compiler.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const episodeId = args.find((arg) => !arg.startsWith('--'));
const checkOnly = args.includes('--check');
if (!episodeId) throw new Error('Usage: npm run episode:compile -- <episode-id> [--check]');

const findDraft = () => {
  const draftsRoot = path.join(root, 'drafts');
  if (!fs.existsSync(draftsRoot)) throw new Error('No drafts directory exists.');
  for (const show of fs.readdirSync(draftsRoot, {withFileTypes: true})) {
    if (!show.isDirectory()) continue;
    const candidate = path.join(draftsRoot, show.name, `${episodeId}.json`);
    if (fs.existsSync(candidate)) return {draftPath: candidate, showId: show.name};
  }
  throw new Error(`Unknown episode draft: ${episodeId}`);
};

const {draftPath, showId} = findDraft();
const rawDraft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
if (rawDraft.id !== episodeId) throw new Error(`Draft ID ${rawDraft.id} does not match requested ID ${episodeId}.`);
const {manifest, totalSeconds} = compileEpisode(rawDraft, {showId});

const outputDir = path.join(root, 'videos', showId, episodeId);
const outputPath = path.join(outputDir, 'video.json');

if (checkOnly) {
  if (!fs.existsSync(outputPath)) throw new Error(`${episodeId} has a draft but no compiled video.json. Run: npm run episode:compile -- ${episodeId}`);
  let drift;
  try {
    drift = manifestDrift(manifest, fs.readFileSync(outputPath, 'utf8'));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error(`${path.relative(root, outputPath)} is not valid JSON (${error.message}). Run: npm run episode:compile -- ${episodeId}`);
  }
  if (drift) throw new Error(`${episodeId} compiled manifest is stale or hand-edited (first difference at ${drift}). Run: npm run episode:compile -- ${episodeId}`);
  console.log(`✓ compiled artifact matches draft: ${episodeId} (${totalSeconds.toFixed(1)}s)`);
} else {
  fs.mkdirSync(outputDir, {recursive: true});
  fs.writeFileSync(outputPath, serializeManifest(manifest));
  console.log(`✓ compiled ${episodeId}: ${manifest.direction.storyPattern} → ${path.relative(root, outputPath)} (${totalSeconds.toFixed(1)}s)`);
  console.log('Next: npm run episode:check -- ' + episodeId);
}
