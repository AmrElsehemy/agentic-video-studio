// Emphasis on a diagram (#131), shared by every theme: dimming the rest,
// dots streaming along an edge, a ring around a node, and where a callout
// card goes. Each is a function of the run's clock, like the canvas state.
import {generator, seedOf} from '../sketch/plan';
import type {Box} from './camera';

/** Emphasis eases out over this long once its `until` comes. */
export const EMPHASIS_OUT = .35;
/** How far dimmed elements fade (to 1 - DIM_DEPTH of their opacity). */
export const DIM_DEPTH = .72;

const ramp = (time: number, start: number, end: number) => (end <= start ? (time >= start ? 1 : 0) : Math.max(0, Math.min(1, (time - start) / (end - start))));

export type Dim = {level: number; keep: Set<string>};
export type Pulse = {edge: string; level: number; start: number};
export type Ring = {target: string; progress: number; level: number; start: number; end: number};
export type Emphasis = {dim: Dim; pulses: Pulse[]; circles: Ring[]};
export const noEmphasis = (): Emphasis => ({dim: {level: 0, keep: new Set()}, pulses: [], circles: []});

type Timed = {start: number; end: number; until?: number};

/** How strong an emphasis is at `now`: in over its action, out after `until` (or the end of its scene). */
export const emphasisLevel = (now: number, time: Timed, sceneEnd: number) => {
  const until = time.until ?? sceneEnd;
  return Math.min(ramp(now, time.start, time.end), 1 - ramp(now, until, until + EMPHASIS_OUT));
};

/** Fold one dim, pulse or circle action into the emphasis at `now`. */
export const addEmphasis = (emphasis: Emphasis, action: {do: string; keep?: string[]; edge?: string; target?: string}, time: Timed, now: number, sceneEnd: number) => {
  const level = emphasisLevel(now, time, sceneEnd);
  if (action.do === 'dim' && action.keep && level > 0) {
    // The strongest dim sets the level; everything any active dim keeps stays bright.
    emphasis.dim.level = Math.max(emphasis.dim.level, level);
    for (const id of action.keep) emphasis.dim.keep.add(id);
  } else if (action.do === 'pulse' && action.edge && level > 0) {
    emphasis.pulses.push({edge: action.edge, level, start: time.start});
  } else if (action.do === 'circle' && action.target && now >= time.start) {
    emphasis.circles.push({target: action.target, progress: ramp(now, time.start, time.end), level: Math.max(0, level), start: time.start, end: time.end});
  }
};

/** An element's opacity under the current dim (1 when kept or nothing is dimmed). */
export const dimmed = (dim: Dim, ...ids: string[]) => (dim.level <= 0 || ids.some((id) => dim.keep.has(id)) ? 1 : 1 - DIM_DEPTH * dim.level);

/** Where `share` of the way along a stream of `count` dots each dot is, as fractions of the edge, at `time`. */
export const pulseDots = (time: number, start: number, length: number, count = 3, speed = 380) => {
  const travelled = (time - start) * speed / Math.max(length, 1);
  return Array.from({length: count}, (_, i) => ((travelled + i / count) % 1 + 1) % 1);
};

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Where a callout card of `size` goes beside `target`: to its right, left,
 * below or above, whichever stays inside `bounds` and covers the least of the
 * `obstacles` (the other elements). Returns the card's box and the point on
 * the target its leader line ends at.
 */
export const placeCallout = (target: Box, size: {w: number; h: number}, obstacles: Box[], bounds: Box, gap: number) => {
  const [cx, cy] = [target.x + target.w / 2, target.y + target.h / 2];
  const candidates = [
    {box: {x: target.x + target.w + gap, y: cy - size.h / 2, ...size}, anchor: [target.x + target.w, cy]},
    {box: {x: target.x - gap - size.w, y: cy - size.h / 2, ...size}, anchor: [target.x, cy]},
    {box: {x: cx - size.w / 2, y: target.y + target.h + gap, ...size}, anchor: [cx, target.y + target.h]},
    {box: {x: cx - size.w / 2, y: target.y - gap - size.h, ...size}, anchor: [cx, target.y]},
  ] as {box: Box; anchor: [number, number]}[];
  const outside = (box: Box) => area(box) - overlap(box, bounds);
  const score = (box: Box) => outside(box) * 4 + obstacles.reduce((sum, other) => sum + overlap(box, other), 0);
  return candidates.reduce((best, candidate) => (score(candidate.box) < score(best.box) ? candidate : best));
};
const area = (box: Box) => box.w * box.h;

/** A hand-drawn ring around a node (circle): the same seeded loop every render, drawn round as it arrives. */
export const ringPath = (box: Box, seed: string, pad: [number, number] = [60, 46]) => generator.toPaths(generator.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w + pad[0], box.h + pad[1], {seed: seedOf(`ring-${seed}`), roughness: 1.4, strokeWidth: 5})).map((path) => path.d)[0];

/** Lines of a callout's text, wrapped at about `chars` characters. */
export const wrapLines = (text: string, chars: number) => text.split(/\s+/).reduce<string[]>((lines, word) => {
  const last = lines.at(-1);
  if (last !== undefined && `${last} ${word}`.length <= chars) lines[lines.length - 1] = `${last} ${word}`;
  else lines.push(word);
  return lines;
}, []);

