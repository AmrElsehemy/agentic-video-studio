// Render only the frames a review looks at: one per scene (the frames the video
// critic and contact sheet read) plus the cover, for one or more episodes.
// Bundles once and reuses one browser, so checking several episodes costs
// seconds each instead of a full MP4 render each. CI uses it for the golden set.
// Usage: npm run frames -- <episode-id> [<episode-id> ...] [--voice=none]
// Then: npm run sheet -- <id> --frames; npm run critic:video -- <id> --frames
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {framePath, prepareRenderProps, reviewFrames} from './lib/render-props.mjs';
import {resolveEpisodeId} from './catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const episodeIds = args.filter((arg) => !arg.startsWith('--')).map((arg) => resolveEpisodeId(arg));
const voice = args.find((arg) => arg.startsWith('--voice='))?.split('=')[1] ?? process.env.VOICE_PROVIDER ?? 'auto';
if (episodeIds.length === 0) throw new Error('Usage: npm run frames -- <episode-id> [<episode-id> ...]');

const started = Date.now();
const failed = [];
// Prepare every episode first: this generates its music bed and sound effects
// into public/, and the bundle only serves the public files present when it's built.
const prepared = [];
for (const episodeId of episodeIds) {
  try {
    prepared.push({episodeId, manifest: prepareRenderProps(episodeId, {voice}).manifest});
  } catch (error) {
    console.error(`✗ ${episodeId}: ${error.message}`);
    failed.push(episodeId);
  }
}

const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts')});
const browser = await openBrowser('chrome', {browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null});
try {
  for (const {episodeId, manifest} of prepared) {
    try {
      const inputProps = {manifest};
      const episode = await selectComposition({serveUrl, id: 'VerticalEpisode', inputProps, puppeteerInstance: browser});
      const frames = reviewFrames(manifest);
      fs.rmSync(path.dirname(framePath(root, episodeId, 0)), {recursive: true, force: true});
      fs.mkdirSync(path.dirname(framePath(root, episodeId, 0)), {recursive: true});
      for (const {index, frame} of frames) {
        await renderStill({composition: episode, serveUrl, inputProps, frame: Math.min(frame, episode.durationInFrames - 1), output: framePath(root, episodeId, index), imageFormat: 'png', puppeteerInstance: browser, overwrite: true});
      }
      const cover = await selectComposition({serveUrl, id: 'EpisodeCover', inputProps, puppeteerInstance: browser});
      await renderStill({composition: cover, serveUrl, inputProps, frame: 0, output: path.join(root, 'out', `${episodeId}-cover.png`), imageFormat: 'png', puppeteerInstance: browser, overwrite: true});
      console.log(`✓ ${episodeId}: ${frames.length} scene frames + cover in out/${episodeId}-frames/`);
    } catch (error) {
      console.error(`✗ ${episodeId}: ${error.message}`);
      failed.push(episodeId);
    }
  }
} finally {
  await browser.close({silent: true});
}
console.log(`frame check took ${((Date.now() - started) / 1000).toFixed(0)}s`);
if (failed.length) {
  console.error(`Frame check failed for: ${failed.join(', ')}`);
  process.exit(1);
}
