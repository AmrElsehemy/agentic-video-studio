// Render checks (#88): frame-by-frame motion and determinism. One frame per
// scene (the frame check) can't see a camera snap, a label that flickers for
// one frame, or a scene that renders differently depending on what was
// rendered before it.
//   npm run check:render -- <episode-id> [...] [--voice=none] [--caption-preview]
// For each episode:
//   1. scans every 8th frame at low resolution to find the busiest 24
//      consecutive frames inside one scene, and the most sudden steps;
//   2. renders 24 consecutive frames around each at half size, writes
//      out/<id>-strip.png (one block per window) and fails on a single-frame
//      jump between neighbours (intended reveals aside);
//   3. renders a few frames twice, in opposite orders, and fails unless the
//      pixels match (anti-aliasing noise in a few pixels aside).
// Writes out/<id>-render-check.json and exits non-zero when any episode fails.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderFrames, renderStill, selectComposition} from '@remotion/renderer';
import {repoRoot as root, resolveEpisodeId} from './catalog.mjs';
import {busiestWindow, determinismFrames, findJumps, neighbourDifferences, renderDifference, STRIP_LENGTH, suddenWindows} from './lib/render-check.mjs';
import {intendedCuts} from './lib/reveals.mjs';
import {prepareRenderProps} from './lib/render-props.mjs';

const args = process.argv.slice(2);
const ids = args.filter((arg) => !arg.startsWith('--')).map((arg) => resolveEpisodeId(arg));
const voice = args.find((arg) => arg.startsWith('--voice='))?.split('=')[1] ?? process.env.VOICE_PROVIDER ?? 'auto';
if (!ids.length) throw new Error('Usage: npm run check:render -- <episode-id> [...] [--voice=none] [--caption-preview]');

/** Every Nth frame in the coarse scan (about 4 a second), and its scale (1080 × 0.125 = 135 px wide). */
const SCAN_EVERY = 8;
const SCAN_SCALE = .125;
const STRIP_SCALE = .5;
/** Neighbour differences are measured on greyscale frames of this size. */
const GRAY = {width: 270, height: 480};

const gray = (file, {width, height} = GRAY) => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `scale=${width}:${height},format=gray`, '-f', 'rawvideo', '-'], {maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`Could not read ${file}: ${result.stderr}`);
  return result.stdout;
};
// Remotion names frames element-<n>.png without zero padding, so sort by the number.
const frameNumber = (file) => Number(file.match(/(\d+)\.png$/)[1]);
const framesIn = (dir) => fs.readdirSync(dir).filter((file) => file.endsWith('.png')).sort((a, b) => frameNumber(a) - frameNumber(b)).map((file) => path.join(dir, file));

const prepared = ids.map((id) => ({id, manifest: prepareRenderProps(id, {voice, captionPreview: args.includes('--caption-preview'), log: () => {}}).manifest}));
const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts')});
const browser = await openBrowser('chrome', {browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null});
const failed = [];
try {
  for (const {id, manifest} of prepared) {
    const started = Date.now();
    const work = path.join(root, 'out', `${id}-render-check`);
    fs.rmSync(work, {recursive: true, force: true});
    const inputProps = {manifest};
    const composition = await selectComposition({serveUrl, id: 'VerticalEpisode', inputProps, puppeteerInstance: browser});
    const render = (outputDir, options) => renderFrames({composition, serveUrl, inputProps, outputDir, imageFormat: 'png', puppeteerInstance: browser, onStart: () => {}, onFrameUpdate: () => {}, concurrency: os.availableParallelism(), ...options});

    // 1. Where the motion is.
    await render(path.join(work, 'scan'), {everyNthFrame: SCAN_EVERY, scale: SCAN_SCALE});
    // With everyNthFrame, files are numbered by position in the scan rather than by frame.
    const scan = framesIn(path.join(work, 'scan')).map((file, index) => ({frame: index * SCAN_EVERY, gray: gray(file, {width: 135, height: 240})}));
    const scanned = Date.now();
    // Reveals are deliberate cuts: they don't count as motion, and a jump there is expected.
    const cuts = intendedCuts(manifest);
    const busiest = busiestWindow(manifest, scan, STRIP_LENGTH, cuts);
    // The busiest stretch, plus the most sudden steps the scan saw (where a snap would be).
    const windows = [{...busiest, why: 'busiest'}, ...suddenWindows(manifest, scan, {cuts}).map((item) => ({...item, why: 'sudden'}))]
      .filter((item, index, all) => all.findIndex((other) => Math.abs(other.start - item.start) < STRIP_LENGTH / 2) === index)
      .map((item) => ({...item, frames: [item.start, Math.min(composition.durationInFrames - 1, item.start + STRIP_LENGTH - 1)]}));

    // 2. Those frames, one by one.
    const sheets = [];
    for (const [index, item] of windows.entries()) {
      const dir = path.join(work, `strip-${index}`);
      await render(dir, {frameRange: item.frames, scale: STRIP_SCALE});
      const strip = framesIn(dir);
      item.differences = neighbourDifferences(strip.map((file) => gray(file)));
      const found = findJumps(item.differences).map((jump) => ({...jump, frames: [item.frames[0] + jump.at, item.frames[0] + jump.at + 1]}));
      item.jumps = found.filter((jump) => !cuts.includes(jump.frames[1]));
      item.reveals = found.filter((jump) => cuts.includes(jump.frames[1]));
      const list = path.join(work, `strip-${index}.txt`);
      fs.writeFileSync(list, strip.map((file) => `file '${file}'`).join('\n'));
      const sheet = path.join(work, `strip-${index}.png`);
      spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'scale=270:-2,tile=8x3:padding=6:color=0x111317', '-frames:v', '1', sheet]);
      sheets.push(sheet);
    }
    // One image with a block of 24 frames per window, busiest first.
    spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...sheets.flatMap((sheet) => ['-i', sheet]), ...(sheets.length > 1 ? ['-filter_complex', `${sheets.map((_, index) => `[${index}]`).join('')}vstack=${sheets.length}`] : []), path.join(root, 'out', `${id}-strip.png`)]);
    const jumps = windows.flatMap((item) => item.jumps);
    const reveals = windows.flatMap((item) => item.reveals);
    const range = windows[0].frames;

    // 3. The same frames, rendered twice in opposite orders.
    // Scene frames are rounded per scene, the composition's length once over the total, so keep within it.
    const checkFrames = [...new Set(determinismFrames(manifest, range[0]).map((frame) => Math.min(frame, composition.durationInFrames - 1)))];
    const still = async (frame, pass) => {
      const output = path.join(work, 'determinism', `${pass}-${frame}.png`);
      await renderStill({composition, serveUrl, inputProps, frame, output, imageFormat: 'png', scale: STRIP_SCALE, puppeteerInstance: browser, overwrite: true});
      return output;
    };
    for (const frame of checkFrames) await still(frame, 'a');
    for (const frame of [...checkFrames].reverse()) await still(frame, 'b');
    const size = {width: composition.width * STRIP_SCALE, height: composition.height * STRIP_SCALE};
    const rerenders = checkFrames.map((frame) => ({frame, ...renderDifference(gray(path.join(work, 'determinism', `a-${frame}.png`), size), gray(path.join(work, 'determinism', `b-${frame}.png`), size))}));
    const timing = {scan: scanned - started, rest: Date.now() - scanned};
    const unstable = rerenders.filter((item) => !item.alike).map((item) => item.frame);

    const sceneAt = (frame) => manifest.scenes.findIndex((_, index, scenes) => frame < scenes.slice(0, index + 1).reduce((sum, item) => sum + Math.round(item.durationSeconds * manifest.format.fps), 0));
    const report = {
      episodeId: id,
      windows: windows.map((item) => ({why: item.why, frames: item.frames, scene: sceneAt(item.frames[0]) + 1, sceneId: manifest.scenes[sceneAt(item.frames[0])]?.id, differences: item.differences.map((value) => Number(value.toFixed(2)))})),
      jumps,
      reveals,
      determinism: {frames: rerenders.map(({frame, changedShare, largest}) => ({frame, changedShare: Number(changedShare.toFixed(6)), largest})), unstable},
      ok: !jumps.length && !unstable.length,
    };
    fs.writeFileSync(path.join(root, 'out', `${id}-render-check.json`), `${JSON.stringify(report, null, 2)}\n`);
    const largest = Math.max(...windows.flatMap((item) => item.differences));
    console.log(`${report.ok ? '✓' : '✗'} ${id}: ${report.windows.map((item) => `frames ${item.frames.join('–')} (scene ${item.scene}, ${item.why})`).join(', ')}; largest step ${largest.toFixed(2)}, ${jumps.length} jump(s)${reveals.length ? ` (+${reveals.length} intended reveal)` : ''}; ${checkFrames.length - unstable.length}/${checkFrames.length} frames the same when re-rendered (${((Date.now() - started) / 1000).toFixed(0)}s: scan ${(timing.scan / 1000).toFixed(0)}s)`);
    for (const jump of jumps) console.log(`    ${jump.kind} at frames ${jump.frames.join('→')}: change ${jump.difference.toFixed(2)} against ${jump.around.toFixed(2)} around it`);
    if (unstable.length) console.log(`    frames ${unstable.join(', ')} render differently depending on what was rendered before them (randomness, time or leftover state)`);
    if (!report.ok) failed.push(id);
  }
} finally {
  await browser.close({silent: true});
}
if (failed.length) {
  console.error(`Render check failed for: ${failed.join(', ')}`);
  process.exit(1);
}
