import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

const [videoPath, manifestPath] = process.argv.slice(2);
if (!videoPath || !manifestPath || !fs.existsSync(videoPath)) throw new Error('Usage: node scripts/qa.mjs <video.mp4> <video.json>');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expectedDuration = manifest.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,codec_name,pix_fmt:format=duration', '-of', 'json', videoPath], {encoding: 'utf8'});
if (probe.status !== 0) throw new Error(probe.stderr);
const data = JSON.parse(probe.stdout);
const stream = data.streams[0];
const duration = Number(data.format.duration);
const checks = [
  [stream.width === manifest.format.width && stream.height === manifest.format.height, `dimensions ${stream.width}×${stream.height}`],
  [stream.codec_name === 'h264', `codec ${stream.codec_name}`],
  [stream.pix_fmt === 'yuv420p', `pixel format ${stream.pix_fmt}`],
  [Math.abs(duration - expectedDuration) < 0.2, `duration ${duration.toFixed(2)}s`],
];
for (const [passed, label] of checks) {
  console.log(`${passed ? '✓' : '✗'} ${label}`);
  if (!passed) process.exitCode = 1;
}
if (!process.exitCode) console.log(`\nReady: ${videoPath}`);

