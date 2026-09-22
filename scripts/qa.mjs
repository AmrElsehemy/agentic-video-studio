import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

const [videoPath, manifestPath] = process.argv.slice(2);
if (!videoPath || !manifestPath || !fs.existsSync(videoPath)) throw new Error('Usage: node scripts/qa.mjs <video.mp4> <video.json>');
const qaInput = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const manifest = qaInput.manifest ?? qaInput;
const expectedDuration = manifest.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,codec_name,pix_fmt:format=duration', '-of', 'json', videoPath], {encoding: 'utf8'});
if (probe.status !== 0) throw new Error(probe.stderr);
const data = JSON.parse(probe.stdout);
const stream = data.streams.find((candidate) => candidate.codec_type === 'video');
const audioStream = data.streams.find((candidate) => candidate.codec_type === 'audio');
if (!stream) throw new Error('Rendered file has no video stream.');
const duration = Number(data.format.duration);
const checks = [
  [stream.width === manifest.format.width && stream.height === manifest.format.height, `dimensions ${stream.width}×${stream.height}`],
  [stream.codec_name === 'h264', `codec ${stream.codec_name}`],
  [['yuv420p', 'yuvj420p'].includes(stream.pix_fmt), `pixel format ${stream.pix_fmt}`],
  [Math.abs(duration - expectedDuration) < 0.2, `duration ${duration.toFixed(2)}s`],
  [Boolean(audioStream), audioStream ? `audio codec ${audioStream.codec_name}` : 'audio stream missing'],
];

if (manifest.audio.voiceover && audioStream) {
  const volume = spawnSync('ffmpeg', ['-hide_banner', '-i', videoPath, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], {encoding: 'utf8'});
  const match = volume.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const meanVolume = match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
  checks.push([meanVolume > -32, `narration mix mean ${Number.isFinite(meanVolume) ? meanVolume.toFixed(1) : '-inf'} dBFS`]);
}
for (const [passed, label] of checks) {
  console.log(`${passed ? '✓' : '✗'} ${label}`);
  if (!passed) process.exitCode = 1;
}
if (!process.exitCode) console.log(`\nReady: ${videoPath}`);
