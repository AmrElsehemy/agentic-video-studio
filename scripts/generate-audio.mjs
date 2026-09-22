import fs from 'node:fs';
import path from 'node:path';
import {findManifest} from './catalog.mjs';

const episodeId = process.argv[2] ?? 'bulbasaur-001';
const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const duration = manifest.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
const rate = 44100;
const sampleCount = Math.ceil(duration * rate);
const dataSize = sampleCount * 2;
const wav = Buffer.alloc(44 + dataSize);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(dataSize, 40);

const bpm = 126;
const beatSeconds = 60 / bpm;
const notes = [110, 130.81, 146.83, 164.81, 146.83, 130.81, 98, 130.81];
const sceneStarts = [];
let sceneCursor = 0;
for (const scene of manifest.scenes) {
  sceneStarts.push(sceneCursor);
  sceneCursor += scene.durationSeconds;
}
for (let i = 0; i < sampleCount; i++) {
  const time = i / rate;
  const beat = Math.floor(time / beatSeconds);
  const beatPhase = (time % beatSeconds) / beatSeconds;
  const frequency = notes[beat % notes.length];
  const bass = Math.sin(2 * Math.PI * frequency * time) * 0.23;
  const shimmer = Math.sin(2 * Math.PI * frequency * 2 * time) * 0.055;
  const kick = Math.sin(2 * Math.PI * (62 - beatPhase * 30) * time) * Math.exp(-beatPhase * 15) * 0.32;
  let impact = 0;
  for (const start of sceneStarts) {
    const delta = time - start;
    if (delta >= 0 && delta < 0.22) impact += Math.sin(2 * Math.PI * (95 - delta * 260) * delta) * Math.exp(-delta * 24) * 0.5;
  }
  const microPhase = (time % 1.1) / 1.1;
  const tick = Math.sin(i * 12.9898) * Math.exp(-microPhase * 45) * 0.055;
  const pulse = 0.72 + 0.28 * Math.sin(Math.PI * beatPhase);
  const fade = Math.min(1, time / 0.7, (duration - time) / 0.8);
  const sample = Math.max(-1, Math.min(1, ((bass + shimmer + kick) * pulse + impact + tick) * Math.max(0, fade)));
  wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
}

const output = path.join(root, 'public', 'generated', `${episodeId}-bed.wav`);
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, wav);
console.log(`✓ original audio bed: ${path.relative(root, output)} (${duration.toFixed(1)}s)`);
