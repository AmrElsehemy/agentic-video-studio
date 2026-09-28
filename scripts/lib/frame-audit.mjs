// Frame audit: deterministic checks on rendered frames, from OCR text and a
// tiny greyscale thumbnail of each frame. Catches the bugs that only showed
// up when someone looked at a render: a missing hook headline, a caption
// drawn twice, the wrong title on a cover, a blank or repeated frame.

/** Uppercase words with OCR look-alikes folded (0→O, 1→I, 5→S), punctuation dropped. */
export const words = (text) => (text.toUpperCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S')
  .match(/[A-Z0-9]+/g) ?? []);

const significant = (text) => words(text).filter((word) => word.length >= 2);

/** Share of the expected text's words that appear in the OCR text (1 when nothing is expected). */
export const coverage = (expected, ocrText) => {
  const wanted = significant(expected);
  if (!wanted.length) return 1;
  const seen = new Set(words(ocrText));
  return wanted.filter((word) => seen.has(word)).length / wanted.length;
};

/** How many times a phrase appears in the OCR text, compared word by word. */
export const occurrences = (phrase, ocrText) => {
  const needle = significant(phrase);
  const hay = words(ocrText);
  if (!needle.length) return 0;
  let count = 0;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((word, offset) => hay[i + offset] === word)) {
      count++;
      i += needle.length - 1;
    }
  }
  return count;
};

export const MIN_COVERAGE = 0.6;
const BLANK_STDDEV = 6;
const DUPLICATE_DIFFERENCE = 6;

/** Mean and standard deviation of a greyscale thumbnail (bytes 0-255). */
export const frameStats = (gray) => {
  const values = [...gray];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const stddev = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return {mean, stddev};
};

/** Mean absolute difference between two thumbnails of the same size. */
export const difference = (a, b) => [...a].reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / a.length;

/**
 * Audit one episode's frames. `frames` is one entry per scene, in order:
 * {text, gray}; `cover` is optional {text, gray}. Returns issues:
 * {where, check, severity: 'blocking' | 'warning', message}.
 */
export const auditFrames = ({manifest, frames, cover}) => {
  const issues = [];
  const add = (where, check, severity, message) => issues.push({where, check, severity, message, source: 'audit'});
  manifest.scenes.forEach((scene, index) => {
    const frame = frames[index];
    if (!frame) return;
    const where = `scene ${index + 1} (${scene.id})`;
    if (frame.text !== undefined) {
      const headline = coverage(scene.headline, frame.text);
      if (headline < MIN_COVERAGE) add(where, 'headline', 'blocking', `Headline "${scene.headline}" is not readable on screen (${Math.round(headline * 100)}% of its words found).`);
      const caption = coverage(scene.caption, frame.text);
      if (caption < MIN_COVERAGE) add(where, 'caption', 'blocking', `Caption "${scene.caption}" is not readable on screen (${Math.round(caption * 100)}% of its words found).`);
      // The caption is drawn once, at the bottom; a second copy means two layers both draw it.
      const sameAsOtherText = [scene.headline, scene.eyebrow ?? '', ...(scene.facts ?? [])].some((text) => words(text).join(' ') === words(scene.caption).join(' '));
      if (!sameAsOtherText && occurrences(scene.caption, frame.text) > 1) add(where, 'caption', 'blocking', `Caption "${scene.caption}" is drawn more than once.`);
    }
    if (frame.gray) {
      const {stddev} = frameStats(frame.gray);
      if (stddev < BLANK_STDDEV) add(where, 'blank', 'blocking', 'The frame is nearly uniform: artwork and text are missing.');
      const previous = frames[index - 1]?.gray;
      if (previous && difference(previous, frame.gray) < DUPLICATE_DIFFERENCE) add(where, 'variety', 'warning', `Looks almost identical to scene ${index} (${manifest.scenes[index - 1].id}).`);
    }
  });
  if (cover?.text !== undefined) {
    // The cover's title is the hook headline (EpisodeCover); a different title means the cover isn't this episode's.
    const hook = manifest.scenes[0];
    const title = coverage(hook.headline, cover.text);
    if (title < MIN_COVERAGE) add('cover', 'title', 'blocking', `Cover title should be the hook headline "${hook.headline}" (${Math.round(title * 100)}% of its words found).`);
  }
  if (cover?.gray && frameStats(cover.gray).stddev < BLANK_STDDEV) add('cover', 'blank', 'blocking', 'The cover is nearly uniform.');
  return issues;
};
