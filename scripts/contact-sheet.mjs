// One mid-scene frame per scene from a rendered episode, tiled into
// out/<id>-contact-sheet.png so a whole episode can be reviewed at a glance.
// Run after `npm run video -- <id>`; uses the timing that render applied.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const episodeId = process.argv[2];
if (!episodeId) throw new Error('Usage: npm run sheet -- <episode-id>');
const videoPath = path.join(root, 'out', `${episodeId}.mp4`);
const propsPath = path.join(root, 'out', `${episodeId}.props.json`);
if (!fs.existsSync(videoPath) || !fs.existsSync(propsPath)) throw new Error(`Render ${episodeId} first: npm run video -- ${episodeId}`);

const {manifest} = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
const TILE_WIDTH = 270;
const PER_ROW = 6;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${episodeId}-sheet-`));
const ffmpeg = (args) => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || 'ffmpeg failed');
};

try {
  let start = 0;
  const frames = manifest.scenes.map((scene, index) => {
    const at = start + scene.durationSeconds * 0.6;
    start += scene.durationSeconds;
    const frame = path.join(tempDir, `${String(index).padStart(2, '0')}.png`);
    ffmpeg(['-ss', at.toFixed(3), '-i', videoPath, '-frames:v', '1', '-vf', `scale=${TILE_WIDTH}:-2`, frame]);
    return frame;
  });

  const rows = Math.ceil(frames.length / PER_ROW);
  const columns = Math.min(PER_ROW, frames.length);
  // Every tile has the same size, so positions are plain pixel offsets.
  const tileHeight = Math.round((TILE_WIDTH * manifest.format.height) / manifest.format.width / 2) * 2;
  const layout = frames.map((_, index) => `${(index % PER_ROW) * TILE_WIDTH}_${Math.floor(index / PER_ROW) * tileHeight}`).join('|');
  const outputPath = path.join(root, 'out', `${episodeId}-contact-sheet.png`);
  const inputs = frames.flatMap((frame) => ['-i', frame]);
  // xstack needs at least two inputs; a single scene is copied as is.
  if (frames.length === 1) fs.copyFileSync(frames[0], outputPath);
  else ffmpeg([...inputs, '-filter_complex', `xstack=inputs=${frames.length}:layout=${layout}:fill=black`, outputPath]);
  console.log(`✓ contact sheet: ${path.relative(root, outputPath)} (${frames.length} scenes, ${columns}×${rows})`);
} finally {
  fs.rmSync(tempDir, {recursive: true, force: true});
}
