// Word-anchored timing (#125): when each diagram action happens, in seconds
// from its scene's start. Resolved in the render props, once narration timing
// has fixed every scene's length and the words' times, so an element appears
// as the narrator names it. The renderer only reads the resolved times.
import {speechSpan, wordTimes} from './captions.mjs';
import {wordMatches} from '../diagram-schema.mjs';

/** How long each kind of action takes by default, in seconds. */
export const DEFAULT_DUR = {draw: .7, pop: .45, fade: .5, connect: .6, highlight: .35, camera: 1.2, annotate: .8, flow: 1.4, dim: .6, pulse: .5, circle: .7};
/** Visuals start this much before their word, so they land as it is heard rather than after. */
export const WORD_LEAD = .06;

/** On a notebook page everything is drawn by hand, so it takes longer: a node is a circle, a doodle, marker and lettering. */
export const NOTEBOOK_DUR = {draw: 2, pop: 2, fade: 2, connect: .7, highlight: .6, camera: 1.4, annotate: 1.1, flow: 1.6, dim: .7, pulse: .6, circle: .9};

/** An architecture picture drawn by hand: each component is quicker than a notebook node (an icon, not a doodle), each flow a highlighter swipe. */
export const SKETCH_ARCH_DUR = {draw: 1.2, pop: 1.2, fade: 1.2, connect: .8, highlight: .6, camera: 1.4, annotate: 1.1, flow: 1.8, dim: .7, pulse: .6, circle: .9};

/** Which timing table a diagram uses: its theme, or for an architecture picture, its look. */
export const timingTheme = (spec) => (spec?.theme === 'architecture' ? (spec.look === 'sketch' ? 'sketch' : 'clean') : spec?.theme ?? 'clean');

export const actionDur = (action, theme = 'clean') => {
  const table = theme === 'notebook' ? NOTEBOOK_DUR : theme === 'sketch' ? SKETCH_ARCH_DUR : DEFAULT_DUR;
  return action.dur ?? (action.do === 'reveal' ? table[action.anim ?? 'draw'] : table[action.do]);
};

const round = (value) => Math.round(value * 1000) / 1000;

/**
 * The times of one scene's actions: [{start, end, until?}] in seconds, in the
 * order of the actions. `words` are the scene's timed words ({text, start, end}).
 */
export const resolveActions = (actions, {words, duration, theme = 'clean'}) => {
  const times = [];
  const byId = new Map();
  const at = (anchor, dur) => {
    if (typeof anchor === 'number') return anchor * duration;
    if (anchor === 'scene-end') return Math.max(0, duration - dur - .2);
    if ('word' in anchor) {
      const word = words.filter((item) => wordMatches(item.text, anchor.word))[(anchor.nth ?? 1) - 1];
      // Checked at compile time; a missing word here means the words came from elsewhere, so hold to the start.
      return word ? Math.max(0, word.start - WORD_LEAD) : 0;
    }
    const before = byId.get(anchor.after);
    return (before ? before.end : 0) + (anchor.delay ?? 0);
  };
  actions.forEach((action) => {
    const dur = actionDur(action, theme);
    const start = Math.min(at(action.at, dur), Math.max(0, duration - .1));
    const time = {start: round(start), end: round(Math.min(start + dur, duration))};
    if (['highlight', 'dim', 'pulse', 'circle'].includes(action.do) && action.until !== undefined) time.until = round(Math.max(time.end, at(action.until, 0)));
    times.push(time);
    // `after` can name an action's id or the element it acts on.
    for (const key of [action.id, action.target, action.edge, action.step].filter(Boolean)) byId.set(key, time);
  });
  return times;
};

/**
 * The manifest with every diagram scene's action times (`scene.diagramTimes`).
 * Uses the scene's word captions when it has them; otherwise estimates the
 * words from the measured (or estimated) speech span, like a caption preview.
 */
export const withDiagramTimes = (manifest, speech = {}) => {
  if (!manifest.scenes.some((scene) => scene.primitive?.kind === 'diagram')) return manifest;
  const speed = manifest.audio?.voice?.speed ?? 1;
  return {...manifest, scenes: manifest.scenes.map((scene) => {
    if (scene.primitive?.kind !== 'diagram') return scene;
    const words = scene.words ?? wordTimes(scene.narration, speechSpan(scene, {speed, measured: speech[scene.id]}));
    return {...scene, diagramTimes: resolveActions(scene.primitive.actions, {words, duration: scene.durationSeconds, theme: timingTheme(manifest.diagram?.spec)})};
  })};
};
