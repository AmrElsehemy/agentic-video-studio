// GeoMotion golden frames (#72/#75): render every shot in the fixture
// (test/fixtures/geo-georgia-shots.json: the Georgia shots and the Fiji
// antimeridian shot) at the start, middle and end of each
// scene, and compare them with the committed frames in test/golden/geo/.
//   npm run geo:golden               render and compare (fails when a map breaks)
//   npm run geo:golden -- --strict   also fail on small changes (a label or arrow moving)
//   npm run geo:golden -- --update   render and replace the committed frames
// Frames are rendered at half size and compared by SSIM. The default tolerance
// absorbs font anti-aliasing differences between machines and Chrome builds
// but fails a blank or wrongly framed map (a camera move scores ~0.8); small
// changes are for --strict locally and for a person reviewing the frames.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {compileEpisode} from './lib/compiler.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const update = process.argv.includes('--update');
const goldenDir = path.join(root, 'test', 'golden', 'geo');
const outDir = path.join(root, 'out', 'geo-golden');
const strict = process.argv.includes('--strict');
/** Minimum SSIM against the golden frame (measured: a label appearing 0.990, an arrow 0.993, a camera move 0.81). */
const MIN_SSIM = strict ? .995 : .97;
const MOMENTS = [['start', 0], ['middle', .5], ['end', 1]];
/** Frames the scene takes to fade in (CompiledEpisodeScene's entrance spring). */
const ENTER = 14;

const {shots} = JSON.parse(fs.readFileSync(path.join(root, 'test', 'fixtures', 'geo-georgia-shots.json'), 'utf8'));
// Real episode drafts carry the shots, so they go through the compiler and the scene layout like any episode.
// Shots fill each stand-in's scenes 1-5 in order, then its hook (scene 0), then the next stand-in, so adding
// a shot never moves the existing ones.
const STAND_INS = ['bulbasaur-001', 'mew-151'];
const names = Object.keys(shots);
const batches = STAND_INS.map((id) => JSON.parse(fs.readFileSync(path.join(root, 'drafts', 'pokepulses', `${id}.json`), 'utf8')))
  .reduce((list, draft) => {
    const taken = list.reduce((sum, batch) => sum + batch.names.length, 0);
    const mine = names.slice(taken, taken + draft.scenes.length);
    return mine.length ? [...list, {draft, names: mine}] : list;
  }, []);
if (batches.reduce((sum, batch) => sum + batch.names.length, 0) < names.length) throw new Error(`The fixture has ${names.length} shots, more than the stand-in episodes' scenes; add a draft to STAND_INS`);

fs.rmSync(outDir, {recursive: true, force: true});
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts')});
const browser = await openBrowser('chrome', {browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null});
const rendered = [];
try {
  for (const {draft, names: batch} of batches) {
    const sceneFor = (index) => (index + 1) % draft.scenes.length;
    batch.forEach((name, index) => { draft.scenes[sceneFor(index)].primitive = shots[name]; });
    const {manifest} = compileEpisode(draft, {showId: 'pokepulses'});
    delete manifest.audio.music;
    const starts = [];
    manifest.scenes.reduce((frame, scene) => {
      starts.push(frame);
      return frame + Math.round(scene.durationSeconds * manifest.format.fps);
    }, 0);
    const inputProps = {manifest};
    const composition = await selectComposition({serveUrl, id: 'VerticalEpisode', inputProps, puppeteerInstance: browser});
    for (const [index, name] of batch.entries()) {
      const scene = manifest.scenes[sceneFor(index)];
      const length = Math.round(scene.durationSeconds * manifest.format.fps);
      for (const [moment, t] of MOMENTS) {
        const file = `${name}-${moment}.png`;
        // Skip the scene's fade-in and stop short of its fade-out, so every frame shows the map.
        const frame = starts[sceneFor(index)] + ENTER + Math.round(t * (length - ENTER - 10));
        await renderStill({composition, serveUrl, inputProps, frame, output: path.join(outDir, file), imageFormat: 'png', scale: .5, puppeteerInstance: browser, overwrite: true});
        rendered.push(file);
      }
    }
  }
} finally {
  await browser.close({silent: true});
}

if (update) {
  fs.mkdirSync(goldenDir, {recursive: true});
  for (const file of rendered) fs.copyFileSync(path.join(outDir, file), path.join(goldenDir, file));
  console.log(`✓ updated ${rendered.length} golden frames in test/golden/geo/`);
  process.exit(0);
}

const ssim = (a, b) => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-'], {encoding: 'utf8'});
  const match = result.stderr.match(/All:([\d.]+)/);
  if (!match) throw new Error(`ffmpeg couldn't compare ${a} and ${b}: ${result.stderr.slice(-300)}`);
  return Number(match[1]);
};
const failures = [];
for (const file of rendered) {
  const golden = path.join(goldenDir, file);
  if (!fs.existsSync(golden)) { failures.push(`${file}: no golden frame (run npm run geo:golden -- --update and review it)`); continue; }
  const score = ssim(path.join(outDir, file), golden);
  console.log(`  ${score >= MIN_SSIM ? '✓' : '✗'} ${file}: SSIM ${score.toFixed(4)}`);
  if (score < MIN_SSIM) failures.push(`${file}: SSIM ${score.toFixed(4)}, below ${MIN_SSIM}`);
}
if (failures.length) {
  console.error(`✗ geo golden frames changed:\n${failures.map((failure) => `  - ${failure}`).join('\n')}\nCompare out/geo-golden/ with test/golden/geo/. If the change is intended, run: npm run geo:golden -- --update`);
  process.exit(1);
}
console.log(`✓ ${rendered.length} geo golden frames match (SSIM ≥ ${MIN_SSIM}${strict ? ', strict' : ''}); review them in out/geo-golden/`);
