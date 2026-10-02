// Word-synced captions (#86): the narration shown a few words at a time, the
// spoken word highlighted, in the scene's caption band. A show opts in with
// "captions": {"mode": "words"} in its profile; PokePulses keeps one static
// caption per scene.
//
// Word times come from the narration track when one exists: the scene's speech
// span (where its audio is not silent, measured when the track is generated)
// is shared out by syllables, with time held back for the pauses punctuation
// makes. Without a track, a preview estimates the span from the text.
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
 * @param {{start: number, end: number}} span
 * @returns {{text: string, start: number, end: number}[]}
 */
export const wordTimes = (narration, {start, end}) => {
  const tokens = narration.trim().split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token));
  if (!tokens.length || end <= start) return [];
  const length = end - start;
  const pauses = tokens.slice(0, -1).map(pauseAfter);
  const pauseTotal = pauses.reduce((sum, value) => sum + value, 0);
  const pauseScale = pauseTotal > length / 4 ? (length / 4) / pauseTotal : 1;
  const weights = tokens.map((token) => syllables(token) || 1);
  const perSyllable = (length - pauseTotal * pauseScale) / weights.reduce((sum, value) => sum + value, 0);
  let time = start;
  return tokens.map((text, index) => {
    const end = time + weights[index] * perSyllable;
    const word = {text, start: round(time), end: round(end)};
    time = end + (pauses[index] ?? 0) * pauseScale;
    return word;
  });
};
const round = (value) => Math.round(value * 1000) / 1000;

/**
 * The scene's speech span: measured from the track when known, otherwise
 * estimated from the text at the voice's speed, capped by the scene.
 * @param {{narration: string, durationSeconds: number}} scene
 * @param {{speed?: number, measured?: {start: number, end: number}}} [options]
 */
export const speechSpan = (scene, {speed = 1, measured} = {}) => {
  const last = Math.max(LEAD_IN, scene.durationSeconds - END_PADDING);
  if (measured && measured.end > measured.start) return {start: Math.max(0, measured.start), end: Math.min(last, measured.end)};
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
 * Timed words for every scene of a manifest whose show captions word by word.
 * `speech` is the measured span per scene id (from the narration timing file);
 * without it, spans are estimated from the text (a preview).
 * @param {{show: {captions?: {mode: string}}, audio?: {voice?: {speed?: number}}, scenes: {id: string, narration: string, durationSeconds: number}[]}} manifest
 * @param {Record<string, {start: number, end: number}>} [speech]
 */
export const withWordCaptions = (manifest, speech = {}) => {
  if (manifest.show?.captions?.mode !== 'words') return manifest;
  const speed = manifest.audio?.voice?.speed ?? 1;
  return {...manifest, scenes: manifest.scenes.map((scene) => ({...scene, words: wordTimes(scene.narration, speechSpan(scene, {speed, measured: speech[scene.id]}))}))};
};
