// Diagram vocabulary golden frames (#131): each verb (dim, pulse, circle and
// callouts) added to the last scene of an episode in each look (clean and
// notebook laid-out diagrams, clean and sketch architectures), rendered once
// it has landed and compared with the committed frames in test/golden/diagram/.
//   npm run diagram:golden               render and compare
//   npm run diagram:golden -- --update   render and replace the committed frames
// Frames are rendered at half size and compared by SSIM, as the geo golden frames are.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {compileEpisode} from './lib/compiler.mjs';
import {withDiagramTimes} from './lib/diagram-timing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const update = process.argv.includes('--update');
const goldenDir = path.join(root, 'test', 'golden', 'diagram');
const outDir = path.join(root, 'out', 'diagram-golden');
/** Minimum SSIM against the golden frame: absorbs font anti-aliasing between machines, fails a verb that stops drawing. */
const MIN_SSIM = .97;
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'test', 'fixtures', 'diagram-verbs.json'), 'utf8'));

fs.rmSync(outDir, {recursive: true, force: true});
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts')});
const browser = await openBrowser('chrome', {browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null});
const rendered = [];
try {
  for (const [verb, byLook] of Object.entries(fixture.verbs)) {
    for (const [look, action] of Object.entries(byLook)) {
      const {draft: draftPath, theme, scene: sceneId} = fixture.looks[look];
      const [showId, id] = draftPath.split('/');
      const draft = JSON.parse(fs.readFileSync(path.join(root, 'drafts', showId, `${id}.json`), 'utf8'));
      if (theme) draft.diagram.theme = theme;
      const scene = draft.scenes.find((item) => item.id === sceneId);
      // A callout is tested on its own: the scene's own notes are left out.
      if (action.do === 'annotate') scene.primitive.actions = scene.primitive.actions.filter((item) => item.do !== 'annotate');
      scene.primitive.actions.push(action);
      const {manifest: compiled} = compileEpisode(draft, {showId});
      delete compiled.audio.music;
      // The renderer reads the resolved action times from the render props.
      const manifest = withDiagramTimes(compiled);
      const index = manifest.scenes.findIndex((item) => item.id === sceneId);
      const start = manifest.scenes.slice(0, index).reduce((sum, item) => sum + Math.round(item.durationSeconds * manifest.format.fps), 0);
      const frame = start + Math.round(fixture.capture * manifest.scenes[index].durationSeconds * manifest.format.fps);
      const inputProps = {manifest};
      const composition = await selectComposition({serveUrl, id: 'VerticalEpisode', inputProps, puppeteerInstance: browser});
      const file = `${verb}-${look}.png`;
      await renderStill({composition, serveUrl, inputProps, frame, output: path.join(outDir, file), imageFormat: 'png', scale: .5, puppeteerInstance: browser, overwrite: true});
      rendered.push(file);
      console.log(`  rendered ${file}`);
    }
  }
} finally {
  await browser.close({silent: true});
}

if (update) {
  fs.mkdirSync(goldenDir, {recursive: true});
  for (const file of rendered) fs.copyFileSync(path.join(outDir, file), path.join(goldenDir, file));
  console.log(`✓ updated ${rendered.length} golden frames in test/golden/diagram/`);
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
  if (!fs.existsSync(golden)) { failures.push(`${file}: no golden frame (run npm run diagram:golden -- --update and review it)`); continue; }
  const score = ssim(path.join(outDir, file), golden);
  console.log(`  ${score >= MIN_SSIM ? '✓' : '✗'} ${file}: SSIM ${score.toFixed(4)}`);
  if (score < MIN_SSIM) failures.push(`${file}: SSIM ${score.toFixed(4)}, below ${MIN_SSIM}`);
}
if (failures.length) {
  console.error(`✗ diagram golden frames changed:\n${failures.map((failure) => `  - ${failure}`).join('\n')}\nCompare out/diagram-golden/ with test/golden/diagram/. If the change is intended, run: npm run diagram:golden -- --update`);
  process.exit(1);
}
console.log(`✓ ${rendered.length} diagram golden frames match (SSIM ≥ ${MIN_SSIM}); review them in out/diagram-golden/`);
