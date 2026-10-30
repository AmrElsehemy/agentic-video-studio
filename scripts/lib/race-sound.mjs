// Sound for a ranked race, synced to the bars: a note each time a bar stops, climbing a pentatonic scale as the
// race goes on; an impact and a bell when the winner's bar stops; a riser into the reveal, a whoosh under the
// re-sort and a chime on the question. The music under it is a score from scripts/lib/score.mjs.

import fs from 'node:fs';
import path from 'node:path';
import {FPS} from './dex.mjs';
import {SCORES} from './score.mjs';

export const RATE = 44100;

const hashOf = (text) => [...text].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 7);

// Remotion's Easing.inOut(Easing.quad), so the frames match the renderer's counter exactly.
const inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2);
export const counterAt = (counter, frame) => {
  if (frame <= counter[0].frame) return counter[0].value;
  for (let index = 1; index < counter.length; index++) {
    const [a, b] = [counter[index - 1], counter[index]];
    if (frame <= b.frame) return a.value + (b.value - a.value) * inOutQuad((frame - a.frame) / (b.frame - a.frame));
  }
  return counter.at(-1).value;
};
/** The first frame at which the counter reaches a value (as the renderer computes it). */
export const stopFrame = (counter, value) => {
  let frame = counter[0].frame;
  while (frame < counter.at(-1).frame && counterAt(counter, frame) < value) frame++;
  return frame;
};

/** Every cue, in seconds: one `stop` per distinct stopping frame (a tie stops together), then the set pieces. */
export const raceCues = (manifest) => {
  const {counter, timeline} = manifest;
  const stops = new Map();
  for (const racer of manifest.racers) {
    const frame = stopFrame(counter, racer.value);
    const entry = stops.get(frame) ?? {frame, hero: false, count: 0};
    entry.hero ||= racer.hero;
    entry.count += 1;
    stops.set(frame, entry);
  }
  const ordered = [...stops.values()].sort((a, b) => a.frame - b.frame);
  const hero = ordered.find((stop) => stop.hero);
  // A top race's winner stops last: the riser runs through its solo and the hit lands on its stop. A bottom race's
  // winner stops first, on the lowest note: the riser leads into the reveal and the hit lands there.
  const heroFirst = hero === ordered[0] && ordered.length > 1;
  const cues = ordered.map((stop, step) => ({cue: stop.hero && !heroFirst ? 'win' : 'stop', time: stop.frame / FPS, step, count: stop.count}));
  const riserEnd = heroFirst ? timeline.sortStart / FPS : hero.frame / FPS;
  const riserStart = heroFirst ? ordered.at(-1).frame / FPS : (ordered.at(-2)?.frame ?? counter[0].frame) / FPS;
  cues.push({cue: 'riser', time: riserStart, end: riserEnd});
  cues.push({cue: 'whoosh', time: timeline.sortStart / FPS, end: timeline.sortEnd / FPS});
  if (heroFirst) cues.push({cue: 'win', time: timeline.sortEnd / FPS, step: ordered.length, count: 1});
  cues.push({cue: 'chime', time: timeline.question / FPS});
  return cues.sort((a, b) => a.time - b.time);
};

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const midi = (note) => 440 * 2 ** ((note - 69) / 12);

/** Mono samples for the cues, in the score's key. */
export const renderRaceSfx = (manifest, scoreName) => {
  const key = SCORES[scoreName]?.key ?? 57;
  const duration = manifest.timeline.end / FPS;
  const out = new Float32Array(Math.ceil(duration * RATE));
  const add = (start, length, shape) => {
    const first = Math.max(0, Math.floor(start * RATE));
    const last = Math.min(out.length, first + Math.ceil(length * RATE));
    for (let i = first; i < last; i++) out[i] += shape((i - first) / RATE, i);
  };
  let seed = Math.abs(hashOf(manifest.id)) || 1;
  const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  for (const cue of raceCues(manifest)) {
    if (cue.cue === 'stop') {
      const f = midi(key + 24 + PENTATONIC[Math.min(cue.step, PENTATONIC.length - 1)]);
      const gain = 0.32 + 0.06 * Math.min(cue.count - 1, 2);
      add(cue.time, 0.5, (t) => (Math.sin(2 * Math.PI * f * t) + Math.sin(4 * Math.PI * f * t) * 0.3 * Math.exp(-t * 18)) * Math.exp(-t * 9) * Math.min(1, t * 800) * gain);
    } else if (cue.cue === 'win') {
      const f = midi(key + 36);
      add(cue.time, 0.5, (t) => Math.sin(2 * Math.PI * (45 + 110 * Math.exp(-t * 26)) * t) * Math.exp(-t * 8) * 0.95);
      add(cue.time, 2.4, (t) => Math.sin(2 * Math.PI * f * t + 2 * Math.exp(-t * 3) * Math.sin(2 * Math.PI * f * 3.5 * t)) * Math.exp(-t * 1.8) * Math.min(1, t * 400) * 0.4);
      add(cue.time, 2.4, (t) => Math.sin(2 * Math.PI * f * 1.5 * t) * Math.exp(-t * 2.4) * Math.min(1, t * 400) * 0.18);
    } else if (cue.cue === 'riser') {
      const length = Math.max(0.6, cue.end - cue.time);
      let previous = 0;
      add(cue.end - length, length, (t) => {
        const p = t / length;
        const n = noise();
        const bright = n - previous * (0.5 + 0.45 * p);
        previous = n;
        return (bright * 0.5 + Math.sin(2 * Math.PI * (200 + 1200 * p * p) * t) * 0.22) * p ** 2.4 * 0.5;
      });
    } else if (cue.cue === 'whoosh') {
      const length = cue.end - cue.time;
      let previous = 0;
      add(cue.time, length, (t) => {
        const n = noise();
        const value = n - previous * 0.9;
        previous = n;
        return value * Math.sin(Math.PI * (t / length)) ** 1.5 * 0.35;
      });
    } else if (cue.cue === 'chime') {
      for (const [index, step] of [0, 4, 7].entries()) {
        const f = midi(key + 24 + step);
        add(cue.time + index * 0.09, 1.2, (t) => (Math.sin(2 * Math.PI * f * t) + Math.sin(4 * Math.PI * f * t) * 0.3) * Math.exp(-t * 4.5) * Math.min(1, t * 600) * 0.22);
      }
    }
  }
  return out;
};

/** Write public/generated/<id>-race-sfx.wav (16-bit mono), normalised to a fixed peak. */
export const writeRaceSfx = ({root, audioId, manifest, scoreName}) => {
  const samples = renderRaceSfx(manifest, scoreName);
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? 0.85 / peak : 1;
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + samples.length * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(RATE, 24);
  wav.writeUInt32LE(RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) => wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample * gain)) * 32767), 44 + i * 2));
  const file = path.join(root, 'public', 'generated', `${audioId}-race-sfx.wav`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, wav);
  return `generated/${audioId}-race-sfx.wav`;
};
