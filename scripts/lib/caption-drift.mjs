// Caption drift (#86): how far each word-synced caption word lands from the
// moment it is actually spoken. The spoken times come from a word-level
// transcript of the narration track (scripts/align-words.py); the caption
// times from the render props. Words are matched letter by letter, so a
// number written "6,400" or a spelling like "kilometres" still lines up.

/** Target from #86: a caption word should light up within this of being spoken. */
export const MAX_DRIFT = 0.15;

const letters = (text) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

/** Each letter of the words in order, with the index of the word it belongs to. */
const spell = (words) => words.flatMap((word, index) => [...letters(word.text)].map((char) => ({char, index})));

/**
 * For each word in `a`, the index of the word in `b` its first matched letter
 * falls in, or -1 when none of its letters match. A global alignment of the
 * two letter sequences (edit distance), so a few differing letters don't
 * throw the rest off.
 */
export const matchWords = (a, b) => {
  const [x, y] = [spell(a), spell(b)];
  const width = y.length + 1;
  const cost = new Uint32Array((x.length + 1) * width);
  for (let i = 0; i <= x.length; i++) cost[i * width] = i;
  for (let j = 0; j <= y.length; j++) cost[j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const same = x[i - 1].char === y[j - 1].char ? 0 : 1;
      cost[i * width + j] = Math.min(cost[(i - 1) * width + j - 1] + same, cost[(i - 1) * width + j] + 1, cost[i * width + j - 1] + 1);
    }
  }
  const matched = new Array(a.length).fill(-1);
  let [i, j] = [x.length, y.length];
  while (i > 0 && j > 0) {
    const here = cost[i * width + j];
    if (x[i - 1].char === y[j - 1].char && here === cost[(i - 1) * width + j - 1]) {
      // Walking backwards, the last assignment is the word's first matched letter.
      matched[x[i - 1].index] = y[j - 1].index;
      i--; j--;
    } else if (here === cost[(i - 1) * width + j - 1] + 1) { i--; j--; }
    else if (here === cost[(i - 1) * width + j] + 1) i--;
    else j--;
  }
  return matched;
};

/** Caption words on the episode's timeline: each scene's words offset by where the scene starts. */
export const timelineWords = (manifest) => {
  let offset = 0;
  return manifest.scenes.flatMap((scene) => {
    const words = (scene.words ?? []).map((word) => ({text: word.text, start: offset + word.start, scene: scene.id}));
    offset += scene.durationSeconds;
    return words;
  });
};

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/**
 * Drift of every caption word that matches a spoken one (caption time minus
 * spoken time; positive means the caption lights up late), with summary
 * figures. `pass` holds when 90% of words are within MAX_DRIFT: transcript
 * word times are themselves only good to a few tens of milliseconds, so a
 * single outlier says more about the transcript than the captions.
 */
export const captionDrift = (captions, spoken) => {
  const matched = matchWords(captions, spoken);
  const words = captions.flatMap((word, index) => (matched[index] < 0 ? [] : [{
    text: word.text,
    scene: word.scene,
    caption: Math.round(word.start * 1000) / 1000,
    spoken: spoken[matched[index]].start,
    drift: Math.round((word.start - spoken[matched[index]].start) * 1000) / 1000,
  }]));
  const sizes = words.map((word) => Math.abs(word.drift)).sort((a, b) => a - b);
  const summary = sizes.length ? {
    median: quantile(sizes, .5),
    p90: quantile(sizes, .9),
    max: sizes.at(-1),
    mean: Math.round(words.reduce((sum, word) => sum + word.drift, 0) / words.length * 1000) / 1000,
  } : undefined;
  return {words, unmatched: captions.length - words.length, ...summary, pass: Boolean(summary && summary.p90 <= MAX_DRIFT)};
};
