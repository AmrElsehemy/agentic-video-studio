// Word-synced captions (#86): the narration shown a few words at a time, the
// spoken word highlighted, in the scene's caption band. A show opts in with
// "captions": {"mode": "words"} in its profile; PokePulses keeps one static
// caption per scene.
//
// Word times come from the narration track when one exists: the scene's speech
// span (where its audio is not silent, measured when the track is generated)
// is shared out by syllables, with time held back for the pauses punctuation
// makes. The pauses heard inside the span pin the punctuation breaks, so each
// clause is timed on its own and errors don't build up across a sentence
// (`npm run captions:drift` measures the result). Without a track, a preview
// estimates the span from the text.
import {END_PADDING, estimatedSpeech} from './speech.mjs';

/** Where speech starts in a scene's track when nothing was measured: TTS opens with a short silence. */
export const LEAD_IN = 0.08;
/** Phrase size: at most this many words, and about this many characters on the line. */
export const MAX_PHRASE_WORDS = 4;
export const MAX_PHRASE_CHARS = 22;

const PAUSE_AFTER = [[/[.!?]["')\]]*$/, 0.16], [/[,;:]["')\]]*$/, 0.10], [/[—–]$|^[—–-]+$/, 0.08]];
const SENTENCE_END = /[.!?]["')\]]*$/;
const pauseAfter = (token) => PAUSE_AFTER.find(([pattern]) => pattern.test(token))?.[1] ?? 0;

/** Rough syllable count of one spoken token; numbers count as several. */
export const syllables = (token) => {
  const digits = token.replace(/[^0-9]/g, '');
  if (digits) return Math.max(2, Math.round(digits.length * 1.5));
  // An acronym is said letter by letter: "BCE" is three syllables, not one.
  const capitals = token.replace(/[^\p{L}]/gu, '');
  if (/^[A-Z]{2,5}$/.test(capitals)) return capitals.length;
  const word = token.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  const groups = word.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
};

/**
 * Start and end time (seconds into the scene) of each narration word, spread
 * over the speech span by syllables. Punctuation pauses take at most a quarter
 * of the span.
 * @param {string} narration
 * @param {{start: number, end: number, pauses?: {start: number, end: number}[]}} span
 * @returns {{text: string, start: number, end: number}[]}
 */
export const wordTimes = (narration, {start, end, pauses = []}) => {
  const tokens = narration.trim().split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token));
  if (!tokens.length || end <= start) return [];
  // First guess: every word shares the whole span by syllables.
  const guess = spread(tokens, start, end);
  // Then pin each punctuation break to a pause actually heard in the track, when one is close,
  // and share out only the stretch between pins. Errors then can't build up across a sentence.
  const breaks = tokens.slice(0, -1).flatMap((token, index) => (pauseAfter(token) ? [index] : []));
  const pins = pinBreaks(breaks.map((index) => guess[index].end), pauses.filter((pause) => pause.start > start && pause.end < end));
  const words = [];
  let [from, at] = [0, start];
  breaks.forEach((index, order) => {
    const pause = pins[order];
    if (!pause) return;
    words.push(...spread(tokens.slice(from, index + 1), at, pause.start));
    [from, at] = [index + 1, pause.end];
  });
  words.push(...spread(tokens.slice(from), at, end));
  return words;
};

/**
 * Words spread over [start, end] by syllables, the last ending at `end`, with
 * time held back after punctuation between them (at most a quarter of the
 * stretch).
 */
const spread = (tokens, start, end) => {
  const length = Math.max(0, end - start);
  const pauses = tokens.map((token, index) => (index < tokens.length - 1 ? pauseAfter(token) : 0));
  const pauseTotal = pauses.reduce((sum, value) => sum + value, 0);
  const pauseScale = pauseTotal > length / 4 ? (length / 4) / pauseTotal : 1;
  const weights = tokens.map((token) => syllables(token) || 1);
  const perSyllable = (length - pauseTotal * pauseScale) / weights.reduce((sum, value) => sum + value, 0);
  let time = start;
  return tokens.map((text, index) => {
    const finish = time + weights[index] * perSyllable;
    const word = {text, start: round(time), end: round(finish)};
    time = finish + pauses[index] * pauseScale;
    return word;
  });
};

/** How far (s) a heard pause may be from where a break was guessed and still pin it. */
export const PIN_REACH = 1;
/** Seconds of distance worth one second of pause when choosing pins: a long pause near a guess beats a blip right on it. */
const DISTANCE_WEIGHT = 0.2;

/**
 * The heard pause each break (guessed time, in order) is pinned to, or
 * undefined. Pins keep their order and each pause pins at most one break.
 * Punctuation is where the voice really stops, so the longest pauses win,
 * with nearness only breaking ties: TTS also leaves short gaps inside
 * phrases ("Chang | 'an") that are no break at all. A break with no pause
 * within PIN_REACH stays unpinned.
 */
const pinBreaks = (guesses, pauses) => {
  const middle = (pause) => (pause.start + pause.end) / 2;
  // best[i][j]: least cost placing breaks i.. using pauses j..; skipping a break costs PIN_REACH.
  const best = Array.from({length: guesses.length + 1}, () => new Array(pauses.length + 1).fill(0));
  const choice = Array.from({length: guesses.length + 1}, () => new Array(pauses.length + 1).fill(''));
  for (let i = guesses.length - 1; i >= 0; i--) {
    for (let j = pauses.length; j >= 0; j--) {
      const options = [['skip-break', best[i + 1][j]]];
      if (j < pauses.length) {
        options.push(['skip-pause', best[i][j + 1]]);
        const distance = Math.abs(middle(pauses[j]) - guesses[i]);
        if (distance <= PIN_REACH) options.push(['pin', DISTANCE_WEIGHT * distance - (pauses[j].end - pauses[j].start) + best[i + 1][j + 1]]);
      }
      const [move, cost] = options.reduce((a, b) => (b[1] < a[1] - 1e-9 ? b : a));
      [best[i][j], choice[i][j]] = [cost, move];
    }
  }
  const pins = new Array(guesses.length).fill(undefined);
  for (let [i, j] = [0, 0]; i < guesses.length;) {
    const move = choice[i][j];
    if (move === 'pin') { pins[i] = pauses[j]; i++; j++; } else if (move === 'skip-pause') j++; else i++;
  }
  return pins;
};

const round = (value) => Math.round(value * 1000) / 1000;

/**
 * The scene's speech span: measured from the track when known, otherwise
 * estimated from the text at the voice's speed, capped by the scene.
 * @param {{narration: string, durationSeconds: number}} scene
 * @param {{speed?: number, measured?: {start: number, end: number, pauses?: {start: number, end: number}[]}}} [options]
 */
export const speechSpan = (scene, {speed = 1, measured} = {}) => {
  const last = Math.max(LEAD_IN, scene.durationSeconds - END_PADDING);
  if (measured && measured.end > measured.start) return {start: Math.max(0, measured.start), end: Math.min(last, measured.end), ...(measured.pauses ? {pauses: measured.pauses} : {})};
  return {start: LEAD_IN, end: Math.min(last, LEAD_IN + estimatedSpeech(scene.narration, speed))};
};

/**
 * Split timed words into short phrases (up to 4 words), breaking after punctuation.
 * @param {{text: string, start: number, end: number}[]} words
 * @returns {{words: {text: string, start: number, end: number}[], start: number, end: number}[]}
 */
export const phrases = (words) => {
  const groups = [];
  let current = [];
  const chars = (list) => list.reduce((sum, word) => sum + word.text.length + 1, -1);
  // A lone word joins the phrase before it when that phrase has room and didn't end on a pause,
  // or else takes that phrase's last word with it ("Where was wine | first made?").
  const close = () => {
    const previous = groups.at(-1);
    if (current.length === 1 && previous && !pauseAfter(previous.at(-1).text)) {
      if (previous.length < MAX_PHRASE_WORDS && chars([...previous, ...current]) <= MAX_PHRASE_CHARS + 6) previous.push(...current);
      else if (previous.length >= 3) groups.push([previous.pop(), ...current]);
      else groups.push(current);
    } else if (current.length) groups.push(current);
    current = [];
  };
  for (const word of words) {
    if (current.length && (current.length >= MAX_PHRASE_WORDS || chars([...current, word]) > MAX_PHRASE_CHARS)) close();
    current.push(word);
    // A sentence always ends its phrase; a comma or dash ends one that already has two words.
    if (SENTENCE_END.test(word.text) || (current.length >= 2 && pauseAfter(word.text))) close();
  }
  close();
  return groups.map((list) => ({words: list, start: list[0].start, end: list.at(-1).end}));
};

/**
 * What the caption band shows `seconds` into a scene: the current phrase and
 * the index (within it) of the word being spoken, or -1 before it starts.
 * Before the first word the first phrase is already up; after the last it stays.
 * @param {{text: string, start: number, end: number}[]} words
 * @param {number} seconds
 */
export const captionAt = (words, seconds) => {
  const list = phrases(words);
  if (!list.length) return undefined;
  const index = Math.max(0, list.findLastIndex((phrase) => phrase.start <= seconds));
  const phrase = list[index];
  return {phrase: phrase.words.map((word) => word.text).join(' '), words: phrase.words, active: phrase.words.findLastIndex((word) => word.start <= seconds)};
};

/**
 * The speech span of a track from ffmpeg's silencedetect log: from the end of
 * any opening silence to the start of the closing one. Undefined when the
 * track is all silence.
 * @param {string} log ffmpeg stderr with silence_start / silence_end lines
 * @param {number} duration the track's length in seconds
 */
export const speechBounds = (log, duration) => {
  const events = [...log.matchAll(/silence_(start|end): (-?[\d.]+)/g)].map(([, kind, value]) => ({kind, at: Math.max(0, Number(value))}));
  let start = 0;
  let end = duration;
  if (events[0]?.kind === 'start' && events[0].at <= 0.01) {
    const opening = events.find((event) => event.kind === 'end');
    if (!opening) return undefined;
    start = opening.at;
  }
  const last = events.at(-1);
  // A silence that starts and never ends runs to the end of the track.
  if (last?.kind === 'start' && last.at > start) end = last.at;
  else if (last?.kind === 'end' && last.at >= duration - 0.01) end = [...events].reverse().find((event) => event.kind === 'start')?.at ?? duration;
  return end > start ? {start: round(start), end: round(end)} : undefined;
};

/**
 * The pauses inside a track's speech span, from the same silencedetect log:
 * the silences that both start and end within it.
 * @param {string} log ffmpeg stderr with silence_start / silence_end lines
 * @param {{start: number, end: number}} span
 */
export const speechPauses = (log, {start, end}) => {
  const events = [...log.matchAll(/silence_(start|end): (-?[\d.]+)/g)].map(([, kind, value]) => ({kind, at: Number(value)}));
  return events.flatMap((event, index) => {
    const next = events[index + 1];
    return event.kind === 'start' && next?.kind === 'end' && event.at > start && next.at < end ? [{start: round(event.at), end: round(next.at)}] : [];
  });
};

/**
 * Timed words for every scene of a manifest whose show captions word by word.
 * `speech` is the measured span per scene id (from the narration timing file);
 * without it, spans are estimated from the text (a preview).
 * @param {{show: {captions?: {mode: string}}, audio?: {voice?: {speed?: number}}, scenes: {id: string, narration: string, durationSeconds: number}[]}} manifest
 * @param {Record<string, {start: number, end: number, pauses?: {start: number, end: number}[]}>} [speech]
 */
export const withWordCaptions = (manifest, speech = {}) => {
  if (manifest.show?.captions?.mode !== 'words') return manifest;
  const speed = manifest.audio?.voice?.speed ?? 1;
  return {...manifest, scenes: manifest.scenes.map((scene) => ({...scene, words: wordTimes(scene.narration, speechSpan(scene, {speed, measured: speech[scene.id]}))}))};
};
