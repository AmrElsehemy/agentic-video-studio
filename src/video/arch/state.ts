// An architecture diagram at a moment (#120): which components, boundaries
// and arrows are drawn, which numbered steps are showing, where each flow's
// dot is, and where the camera is. A fold over every action of the run of
// diagram scenes so far, like the laid-out themes' state; the picture itself
// keeps the source's coordinates.
import {getLength, getPointAtLength} from '@remotion/paths';
import type {ArchSpec} from '../../../scripts/diagram-arch-schema.mjs';
import type {DiagramAction, DiagramPrimitive} from '../../../scripts/primitive-schema.mjs';
import type {ArchitectureDiagram, VideoManifest} from '../../schema';
import {fitBox, unionBox, viewAt, type Box, type CameraMove, type PlaneView, type Size} from '../canvas/camera';
import {timingTheme} from '../../../scripts/lib/diagram-timing.mjs';
import {sceneTimes} from '../diagram/state';
import {continuesMap} from '../geo/camera';

/** The source's diagrams are drawn small; the camera may zoom in this far to make a step readable. */
export const ARCH_ZOOM = 2.6;
/** Source label metrics (14 px serif, 18 px lines): used to size text for the camera and the checks. */
export const TEXT = {size: 14, line: 18, em: .5};

export type Reveal = {progress: number; start: number; end: number};
export type FlowState = {step: string; lane: 'read' | 'write'; start: number; end: number; progress: number; edges: string[]};
export type ArchState = {
  nodes: Record<string, Reveal & {highlight: number}>;
  groups: Record<string, Reveal>;
  labels: Record<string, Reveal>;
  edges: Record<string, Reveal>;
  steps: Record<string, Reveal>;
  flows: FlowState[];
  legend: Record<'read' | 'write', number>;
  camera: PlaneView;
  time: number;
};

const ramp = (time: number, start: number, end: number) => (end <= start ? (time >= start ? 1 : 0) : Math.max(0, Math.min(1, (time - start) / (end - start))));

export const textBox = (text: string, [cx, cy]: [number, number], align: 'left' | 'center' | 'right' = 'center'): Box => {
  const lines = text.split('\n');
  const w = Math.max(...lines.map((line) => line.length)) * TEXT.size * TEXT.em;
  const h = lines.length * TEXT.line;
  return {x: align === 'left' ? cx : align === 'right' ? cx - w : cx - w / 2, y: cy - h / 2, w, h};
};

/** The source-pixel box an element occupies, for the camera. */
export const archBox = (spec: ArchSpec, id: string): Box | undefined => {
  const node = spec.nodes.find((item) => item.id === id);
  if (node) return unionBox([{x: node.at[0] - node.size / 2, y: node.at[1] - node.size / 2, w: node.size, h: node.size}, textBox(node.label, node.labelAt), ...(node.tile ? [node.tile] : [])]);
  const group = spec.groups.find((item) => item.id === id);
  if (group) return group.box;
  const step = spec.steps.find((item) => item.id === id);
  if (step) return unionBox([{x: step.at[0] - 13, y: step.at[1] - 13, w: 26, h: 26}, textBox(step.text, step.textAt)]);
  const label = spec.labels.find((item) => item.id === id);
  if (label) return textBox(label.text, label.at);
  const edge = spec.edges.find((item) => item.id === id);
  if (!edge) return undefined;
  const xs = edge.points.map(([x]) => x);
  const ys = edge.points.map(([, y]) => y);
  return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) || 1, h: Math.max(...ys) - Math.min(...ys) || 1};
};

export const edgePath = (points: [number, number][]) => `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')}`;
const lengths = new Map<string, number>();
export const edgeLength = (spec: ArchSpec, id: string) => {
  if (!lengths.has(id)) lengths.set(id, getLength(edgePath(spec.edges.find((edge) => edge.id === id)!.points)));
  return lengths.get(id)!;
};

/** Where a flow's dot is, `progress` of the way along its edges taken end to end. */
export const dotAt = (spec: ArchSpec, flow: FlowState) => {
  const total = flow.edges.reduce((sum, id) => sum + edgeLength(spec, id), 0);
  let left = flow.progress * total;
  for (const id of flow.edges) {
    const length = edgeLength(spec, id);
    if (left <= length || id === flow.edges.at(-1)) {
      const point = getPointAtLength(edgePath(spec.edges.find((edge) => edge.id === id)!.points), Math.min(left, length));
      return point ? {x: point.x, y: point.y} : null;
    }
    left -= length;
  }
  return null;
};

/** The view framing these elements (or the whole source). */
export const archView = (spec: ArchSpec, focus: 'all' | string[], padding: number, size: Size): PlaneView => {
  const all = {x: 0, y: 0, w: spec.source.width, h: spec.source.height};
  const boxes = focus === 'all' ? [all] : focus.map((id) => archBox(spec, id)).filter((box): box is Box => Boolean(box));
  return fitBox(unionBox(boxes.length ? boxes : [all]), size, padding, ARCH_ZOOM);
};

/** The diagram at `frame` of scene `index`. */
export const archState = (manifest: VideoManifest, index: number, frame: number, fps: number, size: Size): ArchState => {
  const {spec} = manifest.diagram as ArchitectureDiagram;
  const {scenes} = manifest;
  let start = index;
  while (continuesMap(scenes, start)) start--;
  const state: ArchState = {nodes: {}, groups: {}, labels: {}, edges: {}, steps: {}, flows: [], legend: {read: 0, write: 0}, camera: archView(spec, 'all', .04, size), time: 0};
  const moves: CameraMove[] = [];
  const kinds = {
    node: new Set(spec.nodes.map((item) => item.id)),
    group: new Set(spec.groups.map((item) => item.id)),
    label: new Set(spec.labels.map((item) => item.id)),
    edge: new Set(spec.edges.map((item) => item.id)),
  };
  const speed = manifest.audio?.voice?.speed ?? 1;
  let offset = 0;
  for (let i = start; i <= index; i++) {
    const scene = scenes[i];
    const times = sceneTimes(scene, speed, timingTheme(spec)).map((time) => ({start: offset + time.start, end: offset + time.end}));
    const now = i === index ? offset + frame / fps : Infinity;
    if (i === index) state.time = now;
    (scene.primitive as DiagramPrimitive).actions.forEach((action: DiagramAction, n) => {
      const time = times[n];
      const reveal = {progress: ramp(now, time.start, time.end), start: time.start, end: time.end};
      if (action.do === 'reveal') {
        if (kinds.node.has(action.target)) state.nodes[action.target] ??= {...reveal, highlight: 0};
        else if (kinds.group.has(action.target)) state.groups[action.target] ??= reveal;
        else if (kinds.label.has(action.target)) state.labels[action.target] ??= reveal;
      } else if (action.do === 'connect') {
        state.edges[action.edge] ??= reveal;
      } else if (action.do === 'flow') {
        const step = spec.steps.find((item) => item.id === action.step)!;
        state.steps[action.step] ??= reveal;
        state.legend[step.lane] = Math.max(state.legend[step.lane], ramp(now, time.start, time.start + .4));
        const flow: FlowState = {step: step.id, lane: step.lane, ...reveal, edges: action.edges};
        state.flows.push(flow);
        // The dot draws any edge not yet on the picture as it passes along it.
        const total = action.edges.reduce((sum, id) => sum + edgeLength(spec, id), 0);
        let before = 0;
        for (const id of action.edges) {
          const share = edgeLength(spec, id) / total;
          const from = time.start + (time.end - time.start) * before;
          state.edges[id] ??= {progress: ramp(now, from, from + (time.end - time.start) * share), start: from, end: from + (time.end - time.start) * share};
          before += share;
        }
      } else if (action.do === 'highlight') {
        const node = state.nodes[action.target];
        if (node) node.highlight = Math.max(node.highlight, ramp(now, time.start, time.end));
      } else if (action.do === 'camera') {
        moves.push({view: archView(spec, action.focus, action.padding ?? .08, size), start: time.start, end: time.start + Math.max(time.end - time.start, 1.1)});
      }
    });
    offset += Math.round(scene.durationSeconds * fps) / fps;
  }
  moves.sort((a, b) => a.start - b.start);
  state.camera = viewAt(moves, state.time, state.camera);
  return state;
};
