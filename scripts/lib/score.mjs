// Music and ambience for an episode, in stereo, written for the story rather than looped: a score picked for
// the mood (SCORES), arranged in layers that come and go with each scene's intensity, risers into the big
// reveals, an ambience under scenes that have a place to hear (the sea, wind, a city), and everything ducking
// under the narration. All of it is synthesised here, so there is nothing to license.
//
// An episode opts in with `audio.bed.score`; one without keeps the old loop (scripts/lib/audio-bed.mjs).

export const RATE = 44100;
export const AMBIENCES = ['sea', 'wind', 'city', 'jungle', 'desert', 'ice', 'space'];

const midi = (note) => 440 * 2 ** ((note - 69) / 12);
const QUALITY = {maj: [0, 4, 7], min: [0, 3, 7], sus2: [0, 2, 7], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], add9: [0, 4, 7, 14], min9: [0, 3, 7, 14]};

/**
 * Each score: tempo, key (a MIDI note), a chord per `bars` bars as [semitones above the key, quality], and what
 * plays: `arp` (a pattern of chord tones), `bass`, `drums`, `lead` (bell notes), `stab` (a chord hit on the bar).
 * Layers join by intensity: 0 pad only, 1 + bass and arp, 2 + drums, 3 + everything (the reveals and payoffs).
 */
export const SCORES = {
  wonder: {bpm: 96, key: 57, bars: 2, chords: [[0, 'add9'], [7, 'maj'], [9, 'min9'], [5, 'maj7']], arp: 'up-down', bass: 'half', drums: 'soft', lead: true, reverb: 0.34},
  epic: {bpm: 84, key: 50, bars: 2, chords: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']], arp: 'none', bass: 'pulse', drums: 'heavy', stab: true, lead: true, reverb: 0.4},
  tension: {bpm: 100, key: 45, bars: 2, chords: [[0, 'min'], [1, 'maj'], [0, 'min'], [7, 'sus2']], arp: 'sparse', bass: 'pulse', drums: 'tick', reverb: 0.3},
  calm: {bpm: 72, key: 55, bars: 2, chords: [[0, 'maj7'], [9, 'min9'], [5, 'maj7'], [7, 'add9']], arp: 'slow', bass: 'whole', drums: 'shaker', lead: true, reverb: 0.46},
  quirky: {bpm: 112, key: 60, bars: 2, chords: [[0, 'maj'], [5, 'maj'], [7, 'maj'], [5, 'maj']], arp: 'bounce', bass: 'bounce', drums: 'bounce', reverb: 0.2},
  pulse: {bpm: 118, key: 52, bars: 2, chords: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']], arp: 'sixteenth', bass: 'pulse', drums: 'four', reverb: 0.26},
};
export const SCORE_NAMES = Object.keys(SCORES);

/** How loud a scene's story beat is, 0 to 3: this sets which layers play. */
export const intensityOf = (scene, index, count) => {
  const beat = scene.beat ?? scene.role;
  if (beat === 'reveal' || beat === 'twist' || beat === 'payoff') return 3;
  if (beat === 'escalation') return 2;
  if (beat === 'verdict' || beat === 'aftermath') return index === count - 1 ? 1 : 2;
  if (index === 0) return 2;
  return 1;
};

const mulberry = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hashOf = (text) => [...text].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 7);
const pan = (position) => [Math.cos(((position + 1) * Math.PI) / 4), Math.sin(((position + 1) * Math.PI) / 4)];

/** A stereo buffer pair. */
const buffers = (length) => ({l: new Float32Array(length), r: new Float32Array(length)});

/** Add a note-like sound into `bus` from `start` seconds: `shape(local, i)` is the mono sample for local time `local`. */
const voice = (bus, start, length, gain, position, shape) => {
  const [gl, gr] = pan(position);
  const first = Math.max(0, Math.floor(start * RATE));
  const last = Math.min(bus.l.length, first + Math.ceil(length * RATE));
  for (let i = first; i < last; i++) {
    const local = (i - start * RATE) / RATE;
    const value = shape(local) * gain;
    bus.l[i] += value * gl;
    bus.r[i] += value * gr;
  }
};

const pad = (bus, start, length, frequency, gain, position) => voice(bus, start, length + 1.2, gain, position, (t) => {
  const attack = Math.min(1, t / 0.7);
  const release = Math.min(1, Math.max(0, (length + 1.2 - t) / 1.2));
  const wobble = 1 + 0.002 * Math.sin(2 * Math.PI * 0.3 * t);
  let sum = 0;
  for (const detune of [0.996, 1, 1.004]) for (let h = 1; h <= 5; h++) sum += Math.sin(2 * Math.PI * frequency * detune * h * wobble * t) / (h * h * 1.2);
  return sum * attack * attack * release * 0.3;
});
const pluck = (bus, start, frequency, gain, position, bright = 1) => voice(bus, start, 0.9, gain, position, (t) => (
  (Math.sin(2 * Math.PI * frequency * t) + Math.sin(2 * Math.PI * frequency * 2 * t) * 0.4 * bright * Math.exp(-t * 14) + Math.sin(2 * Math.PI * frequency * 3 * t) * 0.15 * Math.exp(-t * 22)) * Math.exp(-t * 6.5) * Math.min(1, t * 900)
));
const bell = (bus, start, frequency, gain, position) => voice(bus, start, 2.2, gain, position, (t) => {
  const index = 2.2 * Math.exp(-t * 3);
  return Math.sin(2 * Math.PI * frequency * t + index * Math.sin(2 * Math.PI * frequency * 3.5 * t)) * Math.exp(-t * 2.2) * Math.min(1, t * 400);
});
const bass = (bus, start, length, frequency, gain) => voice(bus, start, length, gain, 0, (t) => {
  const envelope = Math.min(1, t * 160) * Math.exp(-t * (length < 0.4 ? 5 : 1.4)) * Math.min(1, Math.max(0, (length - t) / 0.06));
  return Math.tanh(Math.sin(2 * Math.PI * frequency * t) * 1.8 + Math.sin(2 * Math.PI * frequency * 2 * t) * 0.3) * envelope;
});
const kick = (bus, start, gain) => voice(bus, start, 0.4, gain, 0, (t) => Math.sin(2 * Math.PI * (48 + 90 * Math.exp(-t * 28)) * t) * Math.exp(-t * 11));
const noiseBurst = (bus, start, length, gain, position, decay, highpass, seed) => {
  const random = mulberry(seed);
  let previous = 0;
  voice(bus, start, length, gain, position, (t) => {
    const n = random() * 2 - 1;
    const value = highpass ? n - previous * 0.95 : n;
    previous = n;
    return value * Math.exp(-t * decay) * Math.min(1, t * 600);
  });
};
const clap = (bus, start, gain, seed) => noiseBurst(bus, start, 0.3, gain, 0, 16, true, seed);
const hat = (bus, start, gain, position, seed, open = false) => noiseBurst(bus, start, open ? 0.25 : 0.07, gain, position, open ? 14 : 70, true, seed);

/** A pole of filtered noise, for risers and textures. */
const onePole = (coefficient) => {
  let state = 0;
  return (x) => (state += (x - state) * coefficient);
};

/** A noise riser into `end`: air that brightens and swells, so a reveal is felt coming. */
const riser = (bus, end, length, gain, seed) => {
  const random = mulberry(seed);
  let previous = 0;
  const [gl, gr] = pan(0);
  const first = Math.max(0, Math.floor((end - length) * RATE));
  const last = Math.min(bus.l.length, Math.floor(end * RATE));
  for (let i = first; i < last; i++) {
    const progress = (i - first) / (last - first);
    const n = random() * 2 - 1;
    const bright = n - previous * (0.5 + 0.45 * progress);
    previous = n;
    const tone = Math.sin(2 * Math.PI * (220 + 1400 * progress * progress) * ((i - first) / RATE)) * 0.25 * progress;
    const value = (bright * 0.7 + tone) * progress ** 2.2 * gain;
    bus.l[i] += value * gl;
    bus.r[i] += value * gr;
  }
};

/** A small stereo reverb (four combs and two all-passes a side), for the send bus. */
const reverb = (input) => {
  const out = buffers(input.l.length);
  const combs = [[1116, 1188, 1277, 1356], [1139, 1211, 1300, 1379]].map((set) => set.map((n) => Math.round((n * RATE) / 44100)));
  const channels = [[input.l, out.l, combs[0]], [input.r, out.r, combs[1]]];
  for (const [source, target, delays] of channels) {
    const lines = delays.map((delay) => ({buffer: new Float32Array(delay), index: 0, damp: 0}));
    const allpass = [225, 341].map((delay) => ({buffer: new Float32Array(Math.round((delay * RATE) / 44100)), index: 0}));
    for (let i = 0; i < source.length; i++) {
      let sum = 0;
      for (const line of lines) {
        const delayed = line.buffer[line.index];
        line.damp = delayed * 0.7 + line.damp * 0.3;
        line.buffer[line.index] = source[i] * 0.3 + line.damp * 0.84;
        line.index = (line.index + 1) % line.buffer.length;
        sum += delayed;
      }
      for (const stage of allpass) {
        const delayed = stage.buffer[stage.index];
        const next = sum + delayed * 0.5;
        stage.buffer[stage.index] = next;
        stage.index = (stage.index + 1) % stage.buffer.length;
        sum = delayed - sum * 0.5;
      }
      target[i] = sum * 0.25;
    }
  }
  return out;
};

const chordNotes = ([offset, quality], key, octave = 0) => QUALITY[quality].map((interval) => key + offset + interval + octave * 12);

/** The score's notes, drums and risers for the scenes' windows. */
const arrange = ({score, windows, duration, seed}) => {
  const dry = buffers(Math.ceil(duration * RATE));
  const send = buffers(dry.l.length);
  const beat = 60 / score.bpm;
  const bar = beat * 4;
  const chordLength = bar * score.bars;
  const levelAt = (time) => windows.find((window) => time >= window.start && time < window.end)?.level ?? 1;
  const total = Math.ceil(duration / chordLength);
  let counter = seed;
  const next = () => (counter = (counter + 7919) | 0);

  for (let c = 0; c < total; c++) {
    const start = c * chordLength;
    const chord = score.chords[c % score.chords.length];
    const notes = chordNotes(chord, score.key);
    const level = levelAt(start + chordLength / 2);
    notes.slice(0, 3).forEach((note, i) => pad(send, start, chordLength, midi(note), [0.5, 0.42, 0.34][level] ?? 0.5, [-0.4, 0, 0.4][i]));
    pad(dry, start, chordLength, midi(notes[0] - 12), 0.34, 0);
  }

  for (let t = 0; t < duration; t += beat / 4) {
    const step = Math.round(t / (beat / 4));
    const inBar = step % 16;
    const c = Math.floor(t / chordLength) % score.chords.length;
    const chord = score.chords[c];
    const notes = chordNotes(chord, score.key, 1);
    const root = score.key + chord[0] - 12;
    const level = levelAt(t);
    const eighth = inBar % 2 === 0;
    const quarter = inBar % 4 === 0;

    // Bass, from level 1.
    if (level >= 1) {
      if (score.bass === 'half' && inBar % 8 === 0) bass(dry, t, beat * 2, midi(root), 0.42);
      if (score.bass === 'whole' && inBar === 0) bass(dry, t, bar, midi(root), 0.36);
      if (score.bass === 'pulse' && eighth) bass(dry, t, beat / 2.2, midi(inBar % 8 === 6 ? root + 7 : root), level >= 2 ? 0.4 : 0.3);
      if (score.bass === 'bounce' && (inBar === 0 || inBar === 8 || inBar === 11)) bass(dry, t, beat / 3, midi(inBar === 11 ? root + 7 : root), 0.42);
    }
    // Arpeggio, from level 1.
    if (level >= 1) {
      const tone = (k) => notes[k % notes.length] + (Math.floor(k / notes.length) % 2) * 12;
      const swing = (inBar % 4) / 4 % 2 === 0 ? -0.35 : 0.35;
      if (score.arp === 'up-down' && eighth) pluck(send, t, midi(tone([0, 1, 2, 3, 2, 1][(inBar / 2) % 6 | 0] + 3)), level === 3 ? 0.26 : 0.2, swing);
      if (score.arp === 'slow' && quarter) pluck(send, t, midi(tone([0, 2, 1, 3][(inBar / 4) % 4 | 0] + 3)), 0.24, swing, 0.6);
      if (score.arp === 'sparse' && (inBar === 3 || inBar === 7 || inBar === 12)) pluck(send, t, midi(notes[(inBar / 3) % notes.length | 0] + 12), 0.22, swing);
      if (score.arp === 'bounce' && [0, 3, 6, 8, 11, 14].includes(inBar)) pluck(dry, t, midi(tone(inBar / 3 | 0) + 12), 0.3, swing, 1.6);
      if (score.arp === 'sixteenth' && level >= 2) pluck(send, t, midi(tone([0, 2, 1, 2][inBar % 4]) + 12), 0.14, swing, 1.4);
    }
    // Drums, from level 2.
    if (level >= 2) {
      const seedHere = next();
      if (score.drums === 'four' && quarter) kick(dry, t, 0.46);
      if ((score.drums === 'four' || score.drums === 'bounce') && (inBar === 4 || inBar === 12)) clap(dry, t, 0.26, seedHere);
      if (score.drums === 'bounce' && (inBar === 0 || inBar === 8)) kick(dry, t, 0.4);
      if (score.drums === 'soft' && (inBar === 0 || inBar === 8)) kick(dry, t, level === 3 ? 0.36 : 0.26);
      if (score.drums === 'soft' && level === 3 && (inBar === 4 || inBar === 12)) clap(dry, t, 0.15, seedHere);
      if (score.drums === 'heavy' && (inBar === 0 || inBar === 10)) kick(dry, t, 0.58);
      if (score.drums === 'heavy' && inBar === 8) clap(send, t, 0.36, seedHere);
      if (score.drums === 'tick' && level >= 2 && inBar % 2 === 0) hat(dry, t, 0.14, 0.2, seedHere);
      if (score.drums === 'tick' && level === 3 && (inBar === 0 || inBar === 8)) kick(dry, t, 0.4);
      if (score.drums === 'shaker' && level >= 2 && eighth) hat(dry, t, 0.1, inBar % 4 === 0 ? -0.3 : 0.3, seedHere);
      if ((score.drums === 'four' || score.drums === 'bounce' || score.drums === 'soft') && level >= 2 && inBar % 4 === 2) hat(dry, t, 0.1, 0.25, seedHere, inBar === 14);
    }
    // A chord stab on the bar and a bell phrase at the peaks.
    if (score.stab && level >= 2 && inBar === 0) notes.forEach((note) => pluck(send, t, midi(note), 0.14, 0, 1.5));
    if (score.lead && level === 3 && (inBar === 0 || inBar === 8)) bell(send, t, midi(notes[(inBar / 8 + c) % notes.length | 0] + 12), 0.2, inBar === 0 ? -0.25 : 0.25);
  }

  // A riser into every scene that comes in at a higher intensity, so the reveal is felt before it lands.
  windows.forEach((window, index) => {
    if (index > 0 && window.level >= 3 && windows[index - 1].level < 3) riser(dry, window.start, Math.min(1.4, windows[index - 1].end - windows[index - 1].start - 0.2), 0.3, next());
  });

  const tail = reverb(send);
  const wet = score.reverb;
  for (let i = 0; i < dry.l.length; i++) {
    dry.l[i] += send.l[i] * 0.7 + tail.l[i] * wet * 2.4;
    dry.r[i] += send.r[i] * 0.7 + tail.r[i] * wet * 2.4;
  }
  return dry;
};

/** One kind of ambience over the whole episode, stereo; `windows` are when it is wanted, as [start, end]. */
const texture = (kind, length, seed) => {
  const random = mulberry(seed);
  const out = buffers(length);
  const noise = () => random() * 2 - 1;
  const [lowL, lowR, midL, midR, airL, airR] = [onePole(0.012), onePole(0.012), onePole(0.05), onePole(0.05), onePole(0.3), onePole(0.3)];
  const events = [];
  const schedule = (count, spread) => {for (let k = 0; k < count; k++) events.push({at: random() * spread, pan: random() * 1.6 - 0.8, pitch: 0.8 + random() * 0.5, length: 0.3 + random() * 0.5});};
  const seconds = length / RATE;
  if (kind === 'jungle') schedule(Math.floor(seconds / 1.1), seconds);
  if (kind === 'city') schedule(Math.floor(seconds / 3.5), seconds);
  if (kind === 'ice') schedule(Math.floor(seconds / 2.2), seconds);
  events.sort((a, b) => a.at - b.at);
  let previous = [0, 0];
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    const [nl, nr] = [noise(), noise()];
    let l = 0;
    let r = 0;
    if (kind === 'sea') {
      const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * (0.085 * t + 0.2 * Math.sin(2 * Math.PI * 0.013 * t)));
      const crest = Math.max(0, Math.sin(2 * Math.PI * (0.085 * t + 0.2 * Math.sin(2 * Math.PI * 0.013 * t)) + 0.9)) ** 3;
      l = lowL(nl) * (2.4 + 3 * swell) + (airL(nl) - midL(nl)) * 0.5 * crest;
      r = lowR(nr) * (2.4 + 3 * swell) + (airR(nr) - midR(nr)) * 0.5 * crest;
    } else if (kind === 'wind' || kind === 'desert' || kind === 'ice') {
      const gust = 0.35 + 0.65 * Math.max(0, Math.sin(2 * Math.PI * 0.07 * t) * 0.6 + Math.sin(2 * Math.PI * 0.137 * t + 1) * 0.4);
      const body = kind === 'ice' ? 0.5 : kind === 'desert' ? 0.28 : 0.4;
      l = (midL(nl) * 4 + lowL(nl) * 2) * gust * body * (kind === 'ice' ? 1.6 : 1);
      r = (midR(nr) * 4 + lowR(nr) * 2) * gust * body * (kind === 'ice' ? 1.6 : 1);
      const howl = Math.sin(2 * Math.PI * (kind === 'ice' ? 620 : 340) * (1 + 0.12 * Math.sin(2 * Math.PI * 0.05 * t)) * t) * gust ** 3 * 0.02;
      l += howl;
      r += howl * 0.8;
    } else if (kind === 'city') {
      l = lowL(nl) * 3.2 + midL(nl) * 0.7;
      r = lowR(nr) * 3.2 + midR(nr) * 0.7;
    } else if (kind === 'jungle') {
      const flutter = 0.6 + 0.4 * Math.sin(2 * Math.PI * 19 * t);
      const hum = (airL(nl) - midL(nl)) * flutter * 0.18;
      l = midL(nl) * 1.6 + hum;
      r = midR(nr) * 1.6 + hum * 0.9;
    } else if (kind === 'space') {
      const drone = Math.sin(2 * Math.PI * 55 * t) * 0.07 + Math.sin(2 * Math.PI * 82.4 * t + Math.sin(t * 0.3)) * 0.05;
      l = drone + lowL(nl) * 0.5;
      r = drone * 0.9 + lowR(nr) * 0.5;
    }
    out.l[i] = l;
    out.r[i] = r;
    previous = [l, r];
  }
  // Events: a car passing, a bird, a distant chime.
  for (const event of events) {
    const start = Math.floor(event.at * RATE);
    const [gl, gr] = pan(event.pan);
    const count = Math.floor(event.length * RATE * (kind === 'city' ? 4 : 1));
    for (let k = 0; k < count && start + k < length; k++) {
      const local = k / RATE;
      let value = 0;
      if (kind === 'city') {
        const bell = Math.exp(-(((local - event.length * 2) / (event.length * 1.2)) ** 2));
        value = onePole(0.08)(noise()) * bell * 0.9 + Math.sin(2 * Math.PI * 70 * event.pitch * local) * bell * 0.1;
        const sweep = Math.cos(((local / (event.length * 4)) * Math.PI) / 2);
        out.l[start + k] += value * Math.min(1, sweep + 0.2) * 0.5;
        out.r[start + k] += value * Math.min(1, 1.2 - sweep) * 0.5;
        continue;
      }
      if (kind === 'jungle') value = Math.sin(2 * Math.PI * (2400 * event.pitch + 900 * Math.sin(local * 38)) * local) * Math.exp(-local * 9) * Math.min(1, local * 300) * (Math.floor(local * 11) % 2 ? 0.2 : 1) * 0.1;
      if (kind === 'ice') value = Math.sin(2 * Math.PI * 2600 * event.pitch * local) * Math.exp(-local * 3) * 0.05;
      out.l[start + k] += value * gl;
      out.r[start + k] += value * gr;
    }
  }
  void previous;
  return out;
};

/** The ambience for each scene, mixed with a fade at the edges of its scenes. */
const ambience = ({windows, duration, seed}) => {
  const length = Math.ceil(duration * RATE);
  const mix = buffers(length);
  const kinds = [...new Set(windows.map((window) => window.ambience).filter(Boolean))];
  for (const kind of kinds) {
    const bed = texture(kind, length, seed + hashOf(kind));
    const gain = new Float32Array(length);
    for (const window of windows.filter((item) => item.ambience === kind)) {
      const [from, to] = [Math.floor(window.start * RATE), Math.min(length, Math.floor(window.end * RATE))];
      for (let i = from; i < to; i++) {
        const t = i / RATE;
        gain[i] = Math.max(gain[i], Math.min(1, (t - window.start) / 0.9, (window.end - t) / 0.9));
      }
    }
    const level = {sea: 0.24, wind: 0.26, city: 0.26, jungle: 0.3, desert: 0.22, ice: 0.26, space: 0.4}[kind];
    for (let i = 0; i < length; i++) {
      mix.l[i] += bed.l[i] * gain[i] * level;
      mix.r[i] += bed.r[i] * gain[i] * level;
    }
  }
  return mix;
};

/** 1 while there is nothing to duck for, lower while the narration is speaking, eased so it never clicks. */
const duckEnvelope = ({windows, speech, duration, depth}) => {
  const length = Math.ceil(duration * RATE);
  const target = new Float32Array(length).fill(1);
  for (const window of windows) {
    const spoken = speech?.[window.id];
    if (!spoken) continue;
    const pauses = (spoken.pauses ?? []).filter((pause) => pause.end - pause.start > 0.3);
    const from = Math.floor((window.start + spoken.start) * RATE);
    const to = Math.min(length, Math.floor((window.start + spoken.end) * RATE));
    for (let i = from; i < to; i++) {
      const local = i / RATE - window.start;
      if (!pauses.some((pause) => local >= pause.start && local <= pause.end)) target[i] = depth;
    }
  }
  const [attack, release] = [1 - Math.exp(-1 / (RATE * 0.05)), 1 - Math.exp(-1 / (RATE * 0.35))];
  let level = 1;
  for (let i = 0; i < length; i++) {
    level += (target[i] - level) * (target[i] < level ? attack : release);
    target[i] = level;
  }
  return target;
};

/**
 * The stereo bed for `manifest` (scenes with `durationSeconds`), as {left, right} sample arrays: the score
 * arranged by each scene's intensity, the ambience scenes call for, all ducked under `speech` (a scene id to
 * {start, end, pauses}, from the narration's timing) when there is narration.
 */
export const renderBed = ({manifest, speech, episodeId = manifest.id ?? 'episode'}) => {
  const score = SCORES[manifest.audio.bed.score];
  if (!score) throw new Error(`Unknown score "${manifest.audio.bed.score}" (known: ${SCORE_NAMES.join(', ')})`);
  let cursor = 0;
  const windows = manifest.scenes.map((scene, index) => {
    const window = {id: scene.id, start: cursor, end: cursor + scene.durationSeconds, level: intensityOf(scene, index, manifest.scenes.length), ambience: scene.primitive?.kind === 'geo-map' ? ambienceOf(scene.primitive) : undefined};
    cursor += scene.durationSeconds;
    return window;
  });
  const seed = hashOf(`${episodeId}:${manifest.audio.bed.score}`);
  const music = arrange({score, windows, duration: cursor, seed});
  const sound = ambience({windows, duration: cursor, seed});
  const duck = duckEnvelope({windows, speech, duration: cursor, depth: speech ? 0.5 : 1});
  const length = music.l.length;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const time = i / RATE;
    const fade = Math.max(0, Math.min(1, time / 0.4, (cursor - time) / 1.1));
    left[i] = (music.l[i] + sound.l[i] * 0.9) * duck[i] * fade;
    right[i] = (music.r[i] + sound.r[i] * 0.9) * duck[i] * fade;
  }
  return {left, right, windows, duration: cursor};
};

/** What a map shot sounds like: its own ambience if the director named one, else what its layers imply. */
export const ambienceOf = (primitive) => {
  if (primitive.ambience) return primitive.ambience === 'none' ? undefined : primitive.ambience;
  if (primitive.streets) return 'city';
  if (primitive.surface?.kind === 'flood') return 'sea';
  if (primitive.surface?.kind === 'elevation' || primitive.surface?.kind === 'coast-distance') return 'wind';
  return undefined;
};
