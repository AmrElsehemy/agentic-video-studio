// Diagram QA (#130): checks a diagram episode's timing and framing from its
// render props, deterministically, with the same state functions the
// renderer draws from. Each element should appear as its word is said, inside
// the frame, clear of the chapter card and the captions, and the camera
// should frame the picture rather than empty canvas. The video critic adds
// these findings to its report; reading the labels in the rendered overview
// frame is the critic's OCR check (scripts/video-critic.mjs).
import {speechSpan, wordTimes} from '../../../scripts/lib/captions.mjs';
import {timingTheme, WORD_LEAD} from '../../../scripts/lib/diagram-timing.mjs';
import {wordMatches} from '../../../scripts/diagram-schema.mjs';
import type {DiagramAction, DiagramPrimitive} from '../../../scripts/primitive-schema.mjs';
import type {ArchitectureDiagram, VideoManifest} from '../../schema';
import {laidOut} from '../../schema';
import {archBox, archState, textBox} from '../arch/state';
import type {Box, PlaneView, Size} from '../canvas/camera';
import {MAP_SIZE} from '../geo/camera';
import {canvasState, elementBox, sceneTimes} from './state';

export type DiagramFinding = {where: string; check: 'timing' | 'framing' | 'covered' | 'empty'; severity: 'blocking' | 'warning'; message: string};

/** A word-anchored action may start this far from its word (the renderer leads by WORD_LEAD). */
export const ANCHOR_TOLERANCE = .15;
/** An element the narration names, timed some other way, may appear this far from its name before it reads as out of sync. */
export const NAMED_WARNING = 1.2;
/** Appearing before its name spoils it; appearing after can be a deliberate chain, so it may lag a little longer. */
export const NAMED_BLOCKING = {before: 2.5, after: 3};
/** Share of an element that must be on screen (and clear of the chapter and captions) at the end of the scene that drew it. */
export const VISIBLE_SHARE = .6;
/** Below this share of the frame showing the picture, the camera is framing empty canvas. */
export const EMPTY_SHARE = .12;
/** The bottom of a 16:9 frame where captions sit over a fade (ArchScene). */
export const CAPTION_BAND = 140;

const COMMON = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'then', 'each', 'every', 'your', 'data', 'step', 'flow', 'read', 'write', 'request', 'service', 'private', 'endpoint']);

type Scene = VideoManifest['scenes'][number];
type Word = {text: string; start: number; end: number};

const round = (value: number) => Math.round(value * 100) / 100;
const area = (box: Box) => Math.max(box.w, 1) * Math.max(box.h, 1);
const intersect = (a: Box, b: Box): Box | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + Math.max(a.w, 1), b.x + Math.max(b.w, 1)) - x;
  const h = Math.min(a.y + Math.max(a.h, 1), b.y + Math.max(b.h, 1)) - y;
  return w > 0 && h > 0 ? {x, y, w, h} : null;
};
/** Where a picture box lands on screen under the camera. */
export const onScreen = (box: Box, view: PlaneView, size: Size): Box => ({
  x: (box.x - view.x) * view.scale + size.width / 2,
  y: (box.y - view.y) * view.scale + size.height / 2,
  w: box.w * view.scale,
  h: box.h * view.scale,
});

/** The chapter card's box (ArchScene: top left, eyebrow over headline), estimated from its text. */
export const chapterBox = (scene: Pick<Scene, 'eyebrow' | 'headline'>): Box => {
  const eyebrow = scene.eyebrow ? scene.eyebrow.length * (20 * .66 + 3) : 0;
  const headline = scene.headline.length * 38 * .6;
  return {x: 56, y: 44, w: Math.max(eyebrow, headline) + 44, h: (scene.eyebrow ? 28 : 0) + 48 + 28};
};

/** Words of a label that name it: not common, and naming at most two elements. */
const namingWords = (labels: string[]) => {
  const counts = new Map<string, number>();
  for (const label of labels) for (const key of new Set(label.toLowerCase().split(/[^a-z0-9]+/))) counts.set(key, (counts.get(key) ?? 0) + 1);
  return (label: string) => label.split(/[^A-Za-z0-9]+/).filter((word) => word.length >= 4 && !COMMON.has(word.toLowerCase()) && (counts.get(word.toLowerCase()) ?? 0) <= 2);
};

/** What each action puts on the picture. */
const drawn = (action: DiagramAction): string[] => (action.do === 'reveal' ? [action.target] : action.do === 'connect' ? [action.edge] : action.do === 'flow' ? [action.step, ...action.edges] : []);

/**
 * Timing and framing findings for a diagram episode's render props (the
 * manifest with `words` and `diagramTimes`, as prepareRenderProps writes it).
 */
export const auditDiagram = (manifest: VideoManifest): DiagramFinding[] => {
  if (!manifest.diagram) return [];
  const findings: DiagramFinding[] = [];
  const arch = manifest.diagram.spec.theme === 'architecture';
  const spec = manifest.diagram.spec as ArchitectureDiagram['spec'] & {nodes: {id: string; label: string}[]};
  const theme = timingTheme(manifest.diagram.spec);
  const speed = manifest.audio?.voice?.speed ?? 1;
  const fps = manifest.format.fps;
  const size: Size = arch ? {width: manifest.format.width, height: manifest.format.height} : MAP_SIZE;
  const viewport: Box = {x: 0, y: 0, w: size.width, h: size.height};
  const labels = new Map<string, string>([
    ...spec.nodes.map((node) => [node.id, node.label.replace(/\n/g, ' ')] as [string, string]),
    ...(arch ? (spec.steps ?? []).map((step) => [step.id, step.text.replace(/\n/g, ' ')] as [string, string]) : []),
  ]);
  const names = namingWords([...labels.values()]);
  const edges = new Set((manifest.diagram.spec.edges as {id: string}[]).map((edge) => edge.id));
  const boxOf = (id: string): Box | undefined => (arch ? archBox(spec, id) : elementBox(laidOut(manifest).layout, id));

  manifest.scenes.forEach((scene: Scene, index: number) => {
    if (scene.primitive?.kind !== 'diagram') return;
    const primitive = scene.primitive as DiagramPrimitive;
    const words: Word[] = scene.words ?? wordTimes(scene.narration, speechSpan(scene, {speed}));
    const times = sceneTimes(scene, speed, theme);
    const where = `scene ${index + 1} (${scene.id})`;

    // Timing: an anchored action starts on its word; an element the narration names appears near its name.
    primitive.actions.forEach((action, n) => {
      const time = times[n];
      if (!time) return;
      const anchor = action.at;
      if (typeof anchor === 'object' && 'word' in anchor) {
        const word = words.filter((item) => wordMatches(item.text, anchor.word))[(anchor.nth ?? 1) - 1];
        if (!word) findings.push({where, check: 'timing', severity: 'blocking', message: `${action.do} waits for "${anchor.word}", which the timed narration never says.`});
        else if (Math.abs(time.start - Math.max(0, word.start - WORD_LEAD)) > ANCHOR_TOLERANCE) findings.push({where, check: 'timing', severity: 'blocking', message: `${action.do} of "${drawn(action)[0] ?? ''}" starts at ${round(time.start)} s, ${round(Math.abs(time.start - word.start))} s from its word "${anchor.word}" (${round(word.start)} s).`});
        return;
      }
      const target = action.do === 'reveal' ? action.target : action.do === 'flow' ? action.step : undefined;
      const label = target && labels.get(target);
      if (!label) return;
      const said = names(label).flatMap((name) => words.filter((word) => wordMatches(word.text, name)));
      if (!said.length) return;
      const gap = Math.min(...said.map((word) => Math.abs(time.start - word.start)));
      if (gap > NAMED_WARNING) {
        const nearest = said.reduce((best, word) => (Math.abs(time.start - word.start) < Math.abs(time.start - best.start) ? word : best));
        const before = time.start < nearest.start;
        findings.push({where, check: 'timing', severity: gap > NAMED_BLOCKING[before ? 'before' : 'after'] ? 'blocking' : 'warning', message: `"${label}" appears at ${round(time.start)} s, ${round(gap)} s ${before ? 'before' : 'after'} the narration names it ("${nearest.text}", ${round(nearest.start)} s). Anchor it to the word.`});
      }
    });

    // Framing, at the end of the scene: what it drew is in the frame and clear of the chapter and captions.
    const last = Math.max(0, Math.round(scene.durationSeconds * fps) - 1);
    const camera = arch ? archState(manifest, index, last, fps, size).camera : canvasState(manifest, index, last, fps, size).camera;
    const chapter = arch ? chapterBox(scene) : null;
    const captions: Box | null = arch ? {x: 0, y: size.height - CAPTION_BAND, w: size.width, h: CAPTION_BAND} : null;
    // Arrows and routes may run off toward parts out of the frame; the parts, steps, boundaries and labels may not.
    const ids = [...new Set(primitive.actions.flatMap(drawn))].filter((id) => !edges.has(id));
    for (const id of ids) {
      const box = boxOf(id);
      if (!box) continue;
      const screen = onScreen(box, camera, size);
      const visible = intersect(screen, viewport);
      const share = visible ? area(visible) / area(screen) : 0;
      const name = labels.get(id) ?? id;
      if (share < VISIBLE_SHARE) {
        findings.push({where, check: 'framing', severity: 'blocking', message: `"${name}" is drawn in this scene but only ${Math.round(share * 100)}% of it is in the frame when the scene ends.`});
        continue;
      }
      // Covered: checked as it finishes drawing, which is when the viewer looks at it (the camera may still be moving).
      if (!chapter || !captions) continue;
      const n = primitive.actions.findIndex((action) => drawn(action).includes(id));
      const at = Math.min(last, Math.round((times[n]?.end ?? scene.durationSeconds) * fps));
      const drawnAt = onScreen(box, archState(manifest, index, at, fps, size).camera, size);
      const there = intersect(drawnAt, viewport);
      for (const [cover, what] of [[chapter, 'the chapter card'], [captions, 'the captions']] as [Box, string][]) {
        const hidden = there && intersect(there, cover);
        if (hidden && area(hidden) / area(drawnAt) > 1 - VISIBLE_SHARE) findings.push({where, check: 'covered', severity: 'blocking', message: `"${name}" is ${Math.round(area(hidden) / area(drawnAt) * 100)}% under ${what} as it is drawn (${round(at / fps)} s).`});
      }
    }
    // Empty canvas: the picture on the canvas so far should fill a fair share of the frame.
    const state = arch ? archState(manifest, index, last, fps, size) : canvasState(manifest, index, last, fps, size);
    const shown = arch
      ? [...Object.keys((state as ReturnType<typeof archState>).nodes), ...Object.keys((state as ReturnType<typeof archState>).groups), ...Object.keys((state as ReturnType<typeof archState>).steps)]
      : [...Object.keys((state as ReturnType<typeof canvasState>).nodes), ...Object.keys((state as ReturnType<typeof canvasState>).groups)];
    const boxes = shown.map(boxOf).filter((box): box is Box => Boolean(box)).map((box) => intersect(onScreen(box, camera, size), viewport)).filter((box): box is Box => Boolean(box));
    // One element framed alone is a close-up, not empty canvas.
    if (boxes.length > 1) {
      const [x0, y0] = [Math.min(...boxes.map((box) => box.x)), Math.min(...boxes.map((box) => box.y))];
      const [x1, y1] = [Math.max(...boxes.map((box) => box.x + box.w)), Math.max(...boxes.map((box) => box.y + box.h))];
      const share = ((x1 - x0) * (y1 - y0)) / area(viewport);
      if (share < EMPTY_SHARE) findings.push({where, check: 'empty', severity: 'warning', message: `The camera frames mostly empty canvas: the picture fills ${Math.round(share * 100)}% of the frame when the scene ends.`});
    } else if (!boxes.length) findings.push({where, check: 'empty', severity: 'warning', message: 'Nothing on the picture is in the frame when the scene ends.'});
  });
  return findings;
};

/**
 * Where each component's label is on screen in the final overview frame of an
 * architecture walkthrough (just before the last scene fades out), for the
 * critic to read with OCR: {seconds, labels: [{id, label, box}]}. Laid-out
 * diagrams draw inside a map area of the frame and aren't read this way.
 */
export const overviewLabels = (manifest: VideoManifest): {seconds: number; labels: {id: string; label: string; box: Box}[]} | undefined => {
  if (manifest.diagram?.spec.theme !== 'architecture') return undefined;
  const {spec} = manifest.diagram as ArchitectureDiagram;
  const index = manifest.scenes.length - 1;
  if (manifest.scenes[index]?.primitive?.kind !== 'diagram') return undefined;
  const fps = manifest.format.fps;
  const size: Size = {width: manifest.format.width, height: manifest.format.height};
  // The last scene fades out over its final 8 frames (ArchScene).
  const frame = Math.max(0, Math.round(manifest.scenes[index].durationSeconds * fps) - 10);
  const state = archState(manifest, index, frame, fps, size);
  const start = manifest.scenes.slice(0, index).reduce((sum, scene) => sum + Math.round(scene.durationSeconds * fps), 0);
  const labels = spec.nodes.filter((node) => state.nodes[node.id]).map((node) => ({id: node.id, label: node.label.replace(/\n/g, ' '), box: onScreen(textBox(node.label, node.labelAt, node.align), state.camera, size)}));
  return {seconds: (start + frame) / fps, labels};
};
