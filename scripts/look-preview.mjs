// Render stills of an episode's scenes in each map look, to compare art directions without changing
// the episode. Usage: npm run looks -- <episode-id> [--looks=classic,neon,atlas,terrain] [--scenes=1,2,4] [--voice=none]
// --globe=1,7 draws those scenes on a globe; --at=0.1,0.5,0.9 takes several moments of each scene (default 0.72).
// Writes out/<show>/<id>/looks/<id>-<look>-scene<N>.png (N counts from 1, taken 72% into the scene).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {prepareRenderProps} from './lib/render-props.mjs';
import {resolveEpisodeId} from './catalog.mjs';
import {episodeOutPath} from './lib/out.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const episodeId = resolveEpisodeId(args.find((arg) => !arg.startsWith('--')));
if (!episodeId) throw new Error('Usage: npm run looks -- <episode-id> [--looks=classic,neon,atlas,terrain] [--scenes=1,2,4]');
const looks = option('looks', 'classic,neon,atlas,terrain').split(',');
const voice = option('voice', 'auto');
const moments = option('at', '0.72').split(',').map(Number);

/** The palette each look is designed with; the headline and caption areas wear it too. */
const PALETTES = {
  neon: {background: '#050818', surface: '#18284f', primary: '#ff3d9a', secondary: '#6c5ce7', ink: '#ffffff'},
  atlas: {background: '#cfe9f2', surface: '#f4e3b8', primary: '#d9482b', secondary: '#2a7fa6', ink: '#14263a'},
  terrain: {background: '#06161c', surface: '#2f5d3c', primary: '#ffd166', secondary: '#10424d', ink: '#f7f2dc'},
};

const {manifest} = prepareRenderProps(episodeId, {voice, log: () => {}});
const scenes = option('scenes', manifest.scenes.map((_, index) => index + 1).join(',')).split(',').map(Number);
const fps = manifest.format.fps;
const starts = manifest.scenes.reduce((list, scene) => [...list, (list.at(-1) ?? 0) + (list.length ? manifest.scenes[list.length - 1].durationSeconds : 0)], []);

const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts')});
const browser = await openBrowser('chrome', {browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null});
try {
  for (const look of looks) {
    const globes = option('globe', '').split(',').filter(Boolean).map(Number);
    const withGlobes = globes.length ? {...manifest, scenes: manifest.scenes.map((scene, index) => (globes.includes(index + 1) && scene.primitive?.kind === 'geo-map' ? {...scene, primitive: {...scene.primitive, globe: true}} : scene))} : manifest;
    const styled = {...withGlobes, look, ...(PALETTES[look] ? {palette: PALETTES[look]} : {})};
    const inputProps = {manifest: styled};
    const composition = await selectComposition({serveUrl, id: 'VerticalEpisode', inputProps, puppeteerInstance: browser});
    for (const number of scenes) for (const moment of moments) {
      const scene = manifest.scenes[number - 1];
      const frame = Math.min(composition.durationInFrames - 1, Math.round((starts[number - 1] + scene.durationSeconds * moment) * fps));
      const output = episodeOutPath(root, episodeId, 'looks', `${episodeId}-${look}-scene${number}${moments.length > 1 ? `-at${Math.round(moment * 100)}` : ''}.png`);
      fs.mkdirSync(path.dirname(output), {recursive: true});
      await renderStill({composition, serveUrl, inputProps, frame, output, imageFormat: 'png', puppeteerInstance: browser, overwrite: true});
      console.log(`✓ ${look} scene ${number} → ${path.relative(root, output)}`);
    }
  }
} finally {
  await browser.close({silent: true});
}
