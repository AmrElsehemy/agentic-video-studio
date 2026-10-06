// How each element of a notebook page is drawn (#132): an ordered list of
// parts (ink strokes, marker hatching, lettering), each with a share of the
// element's drawing time. The renderer draws an element `progress` of the way
// through its parts, and the pen sits at the tip of the part being drawn.
// Strokes are roughened with fixed seeds, so every render is the same.
import {getLength, getPointAtLength, scalePath, translatePath} from '@remotion/paths';
import rough from 'roughjs';
import type {VideoManifest} from '../../schema';
import {DOODLE_PATHS, KIND_DOODLE, MARKERS} from './doodles';

export const INK = '#1f1d1b';
export const HIGHLIGHTER = '#ffd83d';
export const CIRCLE_RED = '#e5383b';

type Layout = NonNullable<VideoManifest['diagram']>['layout'];
type Spec = NonNullable<VideoManifest['diagram']>['spec'];

export type PathPart = {type: 'path'; d: string; stroke: string; width: number; weight: number; length: number; marker?: boolean; opacity?: number; dash?: string};
export type TextPart = {type: 'text'; text: string; x: number; y: number; size: number; width: number; color: string; weight: number; length: number};
export type Part = PathPart | TextPart;
export type Plan = {parts: Part[]};

/** Lettering width per em: Patrick Hand SC is narrow. Text is set to exactly this width, so the pen and the reveal line up. */
export const LETTER_EM = .47;
const LABEL = 58;
const DETAIL = 33;
const EDGE_LABEL = 34;

const generator = rough.generator();
const seedOf = (text: string) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (Math.abs(hash) % 2147483646) + 1;
};

const lengthOf = (d: string) => {
  try { return getLength(d); } catch { return 0; }
};

/** Roughened strokes for a path: roughjs draws each line twice, slightly apart, like a quick pen. */
const roughStrokes = (d: string, seed: number, options: Record<string, unknown> = {}) => generator.toPaths(generator.path(d, {seed, roughness: .7, bowing: .8, stroke: INK, strokeWidth: 3, ...options}))
  .map((path) => path.d).filter((path) => lengthOf(path) > 0);

const pathParts = (ds: string[], weight: number, style: Omit<PathPart, 'type' | 'd' | 'weight' | 'length'>): PathPart[] => {
  const lengths = ds.map(lengthOf);
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  return ds.map((d, i) => ({type: 'path', d, weight: weight * lengths[i] / total, length: lengths[i], ...style}));
};

const text = (value: string, x: number, y: number, size: number, weight: number, color = INK): TextPart => {
  const width = value.length * size * LETTER_EM;
  return {type: 'text', text: value, x: x - width / 2, y, size, width, color, weight, length: width};
};

const cache = new Map<string, Plan>();
const cached = (key: string, build: () => Plan) => {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key)!;
};

/** A node: ink circle, the doodle, marker colour, then its label and detail lettered underneath. */
export const nodePlan = (spec: Spec, layout: Layout, id: string): Plan => cached(`node:${id}`, () => {
  const node = spec.nodes.find((item) => item.id === id)!;
  const box = layout.nodes[id];
  const [cx, cy, r] = [box.cx ?? box.x + box.w / 2, box.cy ?? box.y + box.h / 2, box.r ?? 90];
  const seed = seedOf(id);
  const color = MARKERS[spec.nodes.indexOf(node) % MARKERS.length];
  const outline = generator.toPaths(generator.circle(cx, cy, r * 2, {seed, roughness: 1.1, stroke: INK, strokeWidth: 3})).map((path) => path.d);
  const scale = (r * 1.25) / 100;
  const doodle = (DOODLE_PATHS[node.doodle ?? KIND_DOODLE[node.kind] ?? 'gear'])
    .flatMap((stroke, i) => roughStrokes(translatePath(scalePath(stroke, scale, scale), cx - 50 * scale, cy - 50 * scale), seed + i + 1, {strokeWidth: 3.4}));
  // The marker goes on after the ink, in quick diagonal strokes like a real marker.
  const marker = generator.toPaths(generator.circle(cx, cy, r * 2 - 14, {seed: seed + 99, roughness: 1.4, stroke: 'none', fill: color, fillStyle: 'hachure', hachureAngle: -38, hachureGap: 9, fillWeight: 9}))
    .filter((path) => path.stroke !== 'none').map((path) => path.d);
  const labelY = cy + r + 30 + LABEL * .8;
  return {parts: [
    ...pathParts(outline, .1, {stroke: INK, width: 3}),
    ...pathParts(doodle, .3, {stroke: INK, width: 3.4}),
    ...pathParts(marker, .2, {stroke: color, width: 9, marker: true, opacity: .72}),
    text(node.label, cx, labelY, LABEL, node.detail ? .24 : .4),
    ...(node.detail ? [text(node.detail, cx, labelY + 12 + DETAIL, DETAIL, .16, '#4a4642')] : []),
  ]};
});

/** The end of a quadratic edge and the direction it arrives from, for the arrowhead. */
const arrowHead = (d: string, seed: number, size = 1) => {
  const numbers = d.match(/-?[\d.]+/g)!.map(Number);
  const [qx, qy, ex, ey] = numbers.slice(-4);
  const angle = Math.atan2(ey - qy, ex - qx);
  const wing = (turn: number) => [ex - Math.cos(angle + turn) * 30 * size, ey - Math.sin(angle + turn) * 30 * size];
  const [a, b] = [wing(.5), wing(-.5)];
  return roughStrokes(`M ${a[0]} ${a[1]} L ${ex} ${ey} L ${b[0]} ${b[1]}`, seed, {strokeWidth: 3.4, roughness: .5});
};

/** An edge: a curved hand-drawn arrow, its head, and its label lettered beside it. */
export const edgePlan = (spec: Spec, layout: Layout, id: string): Plan => cached(`edge:${id}`, () => {
  const edge = spec.edges.find((item) => item.id === id)!;
  const geometry = layout.edges[id];
  const d = geometry.d ?? `M ${geometry.points.map(([x, y]) => `${x} ${y}`).join(' L ')}`;
  const seed = seedOf(id);
  const line = roughStrokes(d, seed, {strokeWidth: 3.2, roughness: .9, bowing: 1.5}).slice(0, 1);
  const parts: Part[] = [...pathParts(line, edge.label ? .62 : .82, {stroke: INK, width: 3.2, ...(edge.style === 'dashed' ? {dash: '14 12'} : {})}), ...pathParts(arrowHead(d, seed + 1), .18, {stroke: INK, width: 3.4})];
  if (edge.label && geometry.labelAt) parts.push({...text(edge.label, geometry.labelAt[0] + 70, geometry.labelAt[1] + 12, EDGE_LABEL, .2, '#4a4642')});
  return {parts};
});

/** A group: a loose dashed outline and its name lettered at the top. */
export const groupPlan = (spec: Spec, layout: Layout, id: string): Plan => cached(`group:${id}`, () => {
  const group = spec.groups.find((item) => item.id === id)!;
  const box = layout.groups[id];
  const outline = generator.toPaths(generator.rectangle(box.x, box.y, box.w, box.h, {seed: seedOf(id), roughness: 1.3, stroke: INK, strokeWidth: 2.4})).map((path) => path.d).slice(0, 1);
  const label = group.label.toUpperCase();
  return {parts: [...pathParts(outline, .7, {stroke: INK, width: 2.4, dash: '16 12'}), text(label, box.x + 40 + label.length * 40 * LETTER_EM / 2, box.y + 46, 40, .3, '#4a4642')]};
});

/** A highlight: a red marker ring around a node, or yellow highlighter along an edge. */
export const markPlan = (layout: Layout, id: string): Plan => cached(`mark:${id}`, () => {
  const node = layout.nodes[id];
  if (node) {
    const [cx, cy, r] = [node.cx ?? node.x + node.w / 2, node.cy ?? node.y + node.h / 2, node.r ?? 90];
    const ring = generator.toPaths(generator.ellipse(cx, cy, r * 2 + 64, r * 2 + 40, {seed: seedOf(`ring-${id}`), roughness: 1.6, stroke: CIRCLE_RED, strokeWidth: 5})).map((path) => path.d).slice(0, 1);
    return {parts: pathParts(ring, 1, {stroke: CIRCLE_RED, width: 5, marker: true})};
  }
  const edge = layout.edges[id];
  const d = edge.d ?? `M ${edge.points.map(([x, y]) => `${x} ${y}`).join(' L ')}`;
  return {parts: [{type: 'path', d, stroke: HIGHLIGHTER, width: 26, weight: 1, length: lengthOf(d), marker: true, opacity: .55}]};
});

/** The title's box on the page, for the opening camera. */
export const titleBox = (spec: Spec, layout: Layout) => {
  if (!spec.title || !layout.titleAt) return null;
  const width = spec.title.length * 76 * LETTER_EM;
  return {x: layout.titleAt[0] - width / 2, y: layout.titleAt[1] - 80, w: width, h: 120};
};

/** The page title, lettered by the pen as the episode opens, with a wavy underline. */
export const titlePlan = (spec: Spec, layout: Layout): Plan | null => {
  if (!spec.title || !layout.titleAt) return null;
  return cached('title', () => {
    const [x, y] = layout.titleAt!;
    const title = text(spec.title!.toUpperCase(), x, y, 76, .8);
    const underline = roughStrokes(`M ${title.x} ${y + 26} Q ${x - title.width / 4} ${y + 14} ${x} ${y + 26} T ${title.x + title.width} ${y + 24}`, seedOf('title'), {strokeWidth: 4, roughness: .6});
    return {parts: [title, ...pathParts(underline, .2, {stroke: INK, width: 4})]};
  });
};

/** Where each part of a plan is, `progress` of the way through: [part index, share of that part drawn]. */
export const partProgress = (plan: Plan, progress: number) => {
  let left = Math.max(0, Math.min(1, progress));
  return plan.parts.map((part) => {
    const share = part.weight > 0 ? Math.max(0, Math.min(1, left / part.weight)) : 1;
    left -= part.weight;
    return progress >= 1 ? 1 : share;
  });
};

/** The pen's tip, `progress` of the way through a plan, and whether it is a marker. */
export const penTip = (plan: Plan, progress: number, wobble: number): {x: number; y: number; marker?: string} | null => {
  const shares = partProgress(plan, progress);
  const index = shares.findIndex((share) => share < 1);
  if (index < 0) return null;
  const part = plan.parts[index];
  const share = shares[index];
  if (part.type === 'text') return {x: part.x + part.width * share, y: part.y - part.size * (.3 + .14 * Math.sin(wobble * 2.3))};
  const point = getPointAtLength(part.d, part.length * share);
  if (!point) return null;
  return {x: point.x, y: point.y, ...(part.marker ? {marker: part.stroke} : {})};
};

const NOTE = 36;
const NOTE_CHARS = 18;

/** A note's lines, wrapped at word boundaries to stay narrow beside its node. */
export const noteLines = (value: string, chars = NOTE_CHARS) => value.split(' ').reduce<string[]>((lines, word) => {
  const last = lines.at(-1);
  if (last !== undefined && `${last} ${word}`.length <= chars) lines[lines.length - 1] = `${last} ${word}`;
  else lines.push(word);
  return lines;
}, []);

/**
 * Where a note about `target` goes: in the empty half of its row, beside the
 * circle (to the right of a left-hand or centred node, to the left of a
 * right-hand one), a little above centre so the arrows below stay clear.
 */
export const noteBox = (layout: Layout, target: string, value: string) => {
  const node = layout.nodes[target];
  const [cx, cy, r] = [node.cx ?? node.x + node.w / 2, node.cy ?? node.y + node.h / 2, node.r ?? 90];
  // A node sharing its row has no empty half: its note goes in the gap between the two circles.
  const sibling = Object.entries(layout.nodes).find(([id, other]) => id !== target && Math.abs((other.cy ?? 0) - cy) < 1);
  const lines = noteLines(value, sibling ? 13 : NOTE_CHARS);
  const w = Math.max(...lines.map((line) => line.length)) * NOTE * LETTER_EM;
  const h = lines.length * NOTE * 1.15;
  const right = sibling ? (sibling[1].cx ?? 0) > cx : cx <= layout.width / 2 + 1;
  const x = sibling ? (cx + (sibling[1].cx ?? cx)) / 2 - w / 2 : right ? cx + r + 70 : cx - r - 70 - w;
  return {x, y: cy - r * .55 - h / 2, w, h, lines, right, anchor: [right ? cx + r + 12 : cx - r - 12, cy - r * .35] as [number, number]};
};

/** A side note: handwritten lines, then a little curved arrow back to its node. */
export const notePlan = (layout: Layout, target: string, value: string): Plan => cached(`note:${target}:${value}`, () => {
  const box = noteBox(layout, target, value);
  const lines = box.lines.map((line, i) => {
    const width = line.length * NOTE * LETTER_EM;
    const x = box.right ? box.x + width / 2 : box.x + box.w - width / 2;
    return text(line, x, box.y + (i + 1) * NOTE * 1.15 - 8, NOTE, .7 / box.lines.length, '#4a4642');
  });
  const from: [number, number] = [box.right ? box.x - 10 : box.x + box.w + 10, box.y + NOTE * .7];
  const [tx, ty] = box.anchor;
  const arrow = roughStrokes(`M ${from[0]} ${from[1]} Q ${(from[0] + tx) / 2} ${Math.min(from[1], ty) - 40} ${tx} ${ty}`, seedOf(`note-${target}`), {strokeWidth: 2.6, roughness: .6}).slice(0, 1);
  const head = arrowHead(`M ${from[0]} ${from[1]} Q ${(from[0] + tx) / 2} ${Math.min(from[1], ty) - 40} ${tx} ${ty}`, seedOf(`note-head-${target}`), .7);
  return {parts: [...lines, ...pathParts(arrow, .2, {stroke: '#4a4642', width: 2.6}), ...pathParts(head, .1, {stroke: '#4a4642', width: 2.6})]};
});
