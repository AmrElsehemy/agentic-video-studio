import fs from 'node:fs';
import path from 'node:path';
import {findManifest} from './catalog.mjs';
import {planSoundEvents, sceneEnergy} from './lib/sound-design.mjs';

const episodeId = process.argv[2] ?? 'bulbasaur-001';
const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const duration = manifest.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
const rate = 44100;
const sampleCount = Math.ceil(duration * rate);

const writeMonoWav = (samples, output, targetPeak) => {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? targetPeak / peak : 1;
  const dataSize = samples.length * 2;
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
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i] * gain));
    wav.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, wav);
  return peak * gain;
};

// The show's music bed (manifest.audio.bed, from shows/<id>.json).
const {bpm, notes} = manifest.audio.bed ?? {bpm: 126, notes: [110, 130.81, 146.83, 164.81, 146.83, 130.81, 98, 130.81]};
const beatSeconds = 60 / bpm;
const soundEvents = planSoundEvents(manifest.scenes);
const sceneWindows = [];
let sceneCursor = 0;
for (const scene of manifest.scenes) {
  sceneWindows.push({start: sceneCursor, end: sceneCursor + scene.durationSeconds, energy: sceneEnergy(scene)});
  sceneCursor += scene.durationSeconds;
}

const cueSample = (event, time, i) => {
  const delta = time - event.time;
  if (delta < 0) return 0;
  if (event.cue === 'impact' && delta < 0.36) {
    const frequency = Math.max(42, 120 - delta * 230);
    return Math.sin(2 * Math.PI * frequency * delta) * Math.exp(-delta * 10) * 0.9;
  }
  if (event.cue === 'whoosh' && delta < 0.30) {
    const envelope = Math.sin(Math.PI * (delta / 0.30));
    const noise = Math.sin(i * 12.9898 + event.index * 31.7) * 0.72 + Math.sin(i * 0.217 + event.index * 7.1) * 0.28;
    return noise * envelope * 0.52;
  }
  if (event.cue === 'riser' && delta < 0.52) {
    const progress = delta / 0.52;
    const frequency = 180 + 980 * progress * progress;
    return Math.sin(2 * Math.PI * frequency * delta) * Math.sin(Math.PI * progress) * 0.52;
  }
  if (event.cue === 'reveal' && delta < 0.48) {
    const low = Math.sin(2 * Math.PI * Math.max(48, 138 - delta * 190) * delta) * Math.exp(-delta * 8) * 0.76;
    const sparkle = Math.sin(2 * Math.PI * 920 * delta) * Math.exp(-delta * 6.5) * 0.26;
    return low + sparkle;
  }
  if (event.cue === 'chime' && delta < 0.65) {
    const fundamental = Math.sin(2 * Math.PI * 660 * delta);
    const overtone = Math.sin(2 * Math.PI * 990 * delta) * 0.45;
    return (fundamental + overtone) * Math.exp(-delta * 5.5) * 0.42;
  }
  return 0;
};

const musicSamples = new Float32Array(sampleCount);
const sfxSamples = new Float32Array(sampleCount);

for (let i = 0; i < sampleCount; i++) {
  const time = i / rate;
  const beat = Math.floor(time / beatSeconds);
  const beatPhase = (time % beatSeconds) / beatSeconds;
  const frequency = notes[beat % notes.length];
  const activeScene = sceneWindows.find((window) => time >= window.start && time < window.end);
  const energy = activeScene?.energy ?? 1;

  const bass = Math.sin(2 * Math.PI * frequency * time) * 0.20;
  const shimmer = Math.sin(2 * Math.PI * frequency * 2 * time) * 0.045;
  const kick = Math.sin(2 * Math.PI * (62 - beatPhase * 30) * time) * Math.exp(-beatPhase * 15) * 0.27;
  const microPhase = (time % 1.1) / 1.1;
  const tick = Math.sin(i * 12.9898) * Math.exp(-microPhase * 45) * 0.035;
  const pulse = 0.74 + 0.26 * Math.sin(Math.PI * beatPhase);
  const fade = Math.max(0, Math.min(1, time / 0.45, (duration - time) / 0.65));
  musicSamples[i] = ((bass + shimmer + kick) * pulse + tick) * energy * fade;

  // SFX intentionally do NOT use the global music fade. The old design muted
  // the hook impact at t=0 and then attenuated every cue with the music bed.
  sfxSamples[i] = soundEvents.reduce((sum, event) => sum + cueSample(event, time, i), 0);
}

const musicOutput = path.join(root, 'public', 'generated', `${episodeId}-bed.wav`);
const sfxOutput = path.join(root, 'public', 'generated', `${episodeId}-sfx.wav`);
const musicPeak = writeMonoWav(musicSamples, musicOutput, 0.88);
const sfxPeak = writeMonoWav(sfxSamples, sfxOutput, 0.96);

console.log(`✓ music bed: ${path.relative(root, musicOutput)} (${duration.toFixed(1)}s, ${bpm} bpm, normalized peak ${musicPeak.toFixed(2)})`);
console.log(`✓ sound effects: ${path.relative(root, sfxOutput)} (${soundEvents.length} cues, normalized peak ${sfxPeak.toFixed(2)})`);
