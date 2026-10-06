// Video Critic: review a rendered episode frame by frame.
// Usage: npm run critic:video -- <episode-id> [--vision] [--frames]
//
// Needs out/<id>.mp4 (npm run video), or with --frames the review frames from
// npm run frames, and uses out/<id>-cover.png when present (npm run still). Always runs the deterministic frame audit (OCR with
// tesseract, plus pixel checks); --vision (or VIDEO_CRITIC_VISION=1) also asks
// a vision model. Writes out/<id>-video-review.json and exits 1 on any
// blocking issue.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditFrames} from './lib/frame-audit.mjs';
import {createCompletion} from './lib/llm.mjs';
import {appendProduction, modelEntry} from './lib/production.mjs';
import {framePath, reviewFrames} from './lib/render-props.mjs';
import {critiqueFrames} from './lib/video-critic.mjs';
import {resolveEpisodeId} from './catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const episodeId = resolveEpisodeId(args.find((arg) => !arg.startsWith('--')));
if (!episodeId) throw new Error('Usage: npm run critic:video -- <episode-id> [--vision] [--frames]');
const fromFrames = args.includes('--frames');
const vision = args.includes('--vision') || process.env.VIDEO_CRITIC_VISION === '1';
const videoPath = path.join(root, 'out', `${episodeId}.mp4`);
const propsPath = path.join(root, 'out', `${episodeId}.props.json`);
const coverPath = path.join(root, 'out', `${episodeId}-cover.png`);
if (fromFrames ? !fs.existsSync(framePath(root, episodeId, 0)) || !fs.existsSync(propsPath) : !fs.existsSync(videoPath) || !fs.existsSync(propsPath)) {
  throw new Error(fromFrames ? `Render the review frames first: npm run frames -- ${episodeId}` : `Render ${episodeId} first: npm run video -- ${episodeId}`);
}
const {manifest} = JSON.parse(fs.readFileSync(propsPath, 'utf8'));

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {maxBuffer: 64 * 1024 * 1024, ...options});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr?.toString() || result.status}`);
  return result.stdout;
};
const hasTesseract = spawnSync('tesseract', ['--version']).status === 0;
if (!hasTesseract) console.warn('⚠ tesseract is not installed, so text checks are skipped (brew install tesseract / apt-get install tesseract-ocr).');
// OCR three non-overlapping bands that match the scene layout (header,
// visual area, caption), greyscale and inverted: tesseract reads light text on
// a busy dark frame far better this way than as one page, and no text is
// counted twice.
// A 16:9 walkthrough (ArchScene) has its chapter top left and captions along the bottom instead.
const landscape = manifest.format.width > manifest.format.height;
const [WIDTH, HEIGHT] = [manifest.format.width, manifest.format.height];
const BANDS = landscape ? [[0, 170, 6], [170, 920, 11], [920, 1080, 6]] : [[0, 315, 6], [315, 1635, 11], [1635, 1920, 6]];
// The headline block (eyebrow and up to three headline lines, y≈140-700) read
// again as a block: sparse-text mode garbles long two-line headlines
// ("ONE POKÉMON. THREE FORMS." came back as "ONE Ste THREE").
const HEADLINE_BAND = landscape ? [30, 170, 4] : [140, 700, 4];
// The cover's title block (EpisodeCover, from y≈1185) read as one block of
// text: sparse-text mode over the whole middle band loses words next to the
// artwork or map, while this reads the title exactly.
const COVER_BANDS = landscape ? [...BANDS, [40, 360, 6]] : [...BANDS, [1100, 1620, 6]];
const ocr = (file, bands = BANDS) => {
  if (!hasTesseract) return undefined;
  return bands.map(([top, bottom, pageMode], index) => {
    const band = `${file}.band${index}.png`;
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vf', `scale=${WIDTH}:${HEIGHT},crop=${WIDTH}:${bottom - top}:0:${top},format=gray,negate`, band]);
    return run('tesseract', [band, '-', '--psm', String(pageMode)], {encoding: 'utf8'});
  }).join('\n');
};
// A 16×28 greyscale thumbnail: enough to tell a blank or repeated frame.
const thumbnail = (file) => new Uint8Array(run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', landscape ? 'scale=28:16,format=gray' : 'scale=16:28,format=gray', '-f', 'rawvideo', '-']));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${episodeId}-critic-`));
try {
  const frames = reviewFrames(manifest).map(({index, seconds}) => {
    const file = path.join(tempDir, `${String(index).padStart(2, '0')}.png`);
    if (fromFrames) fs.copyFileSync(framePath(root, episodeId, index), file);
    else run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', seconds.toFixed(3), '-i', videoPath, '-frames:v', '1', file]);
    return {file, text: ocr(file), headlineText: ocr(file, [HEADLINE_BAND]), gray: thumbnail(file)};
  });
  // Work on a copy of the cover so OCR bands and resized images stay in the temp folder.
  const coverCopy = path.join(tempDir, 'cover.png');
  if (fs.existsSync(coverPath)) fs.copyFileSync(coverPath, coverCopy);
  const cover = fs.existsSync(coverCopy) ? {file: coverCopy, text: ocr(coverCopy, COVER_BANDS), gray: thumbnail(coverCopy)} : undefined;

  const issues = auditFrames({manifest, frames, cover});
  let visionReport;
  if (vision) {
    // Half-size frames keep the request small while text stays readable.
    const small = (file) => {
      const out = `${file}.small.png`;
      run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vf', 'scale=540:-2', out]);
      return fs.readFileSync(out).toString('base64');
    };
    const complete = createCompletion({role: 'vision', maxTokens: 4000, onUsage: (usage) => appendProduction(root, manifest.show.id, episodeId, [modelEntry(usage)])});
    console.log(`  vision critic: ${complete.provider} (${complete.model})`);
    visionReport = await critiqueFrames({manifest, frames: frames.map((frame) => ({png: small(frame.file)})), cover: cover ? {png: small(cover.file)} : undefined, complete});
    if (visionReport.modelError) console.warn(`⚠ vision critic failed: ${visionReport.modelError}`);
    issues.push(...visionReport.issues);
  }

  const blocking = issues.filter((issue) => issue.severity === 'blocking');
  const reviewPath = path.join(root, 'out', `${episodeId}-video-review.json`);
  fs.writeFileSync(reviewPath, `${JSON.stringify({episodeId, checkedAt: new Date().toISOString(), ocr: hasTesseract, vision: Boolean(vision && !visionReport?.modelError), issues}, null, 2)}\n`);
  for (const issue of issues) console.log(`${issue.severity === 'blocking' ? '✗' : '⚠'} ${issue.where} [${issue.check}${issue.source === 'vision' ? ', vision' : ''}]: ${issue.message}`);
  console.log(`${blocking.length ? '✗' : '✓'} video critic: ${blocking.length} blocking, ${issues.length - blocking.length} warnings → ${path.relative(root, reviewPath)}`);
  if (blocking.length) process.exitCode = 1;
} finally {
  fs.rmSync(tempDir, {recursive: true, force: true});
}
