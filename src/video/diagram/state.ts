// The diagram canvas at a moment (#124): which elements are on screen, how far
// each one's entrance has got, what is highlighted and where the camera is.
// A fold over every action of the continuous run of diagram scenes up to now,
// so a scene opens on the canvas the previous one left. Pure: the same frame
// always gives the same state.
import {speechSpan, wordTimes} from '../../../scripts/lib/captions.mjs';
import {resolveActions, type ActionTime} from '../../../scripts/lib/diagram-timing.mjs';
import type {DiagramAction, DiagramPrimitive} from '../../../scripts/primitive-schema.mjs';
import {laidOut, type VideoManifest} from '../../schema';
import {fitBox, unionBox, viewAt, type Box, type CameraMove, type PlaneView, type Size} from '../canvas/camera';
import {continuesMap, MAP_SIZE} from '../geo/camera';
import {noteBox, titleBox} from '../sketch/plan';

export type Layout = NonNullable<VideoManifest['diagram']>['layout'];
type Scene = VideoManifest['scenes'][number];

export type Entrance = {progress: number; anim: 'draw' | 'pop' | 'fade'; start: number; end: number};
export type CanvasState = {
  /** `highlight` eases in and out again; `mark` is how far a highlight's ink has been drawn, which stays on the page. */
  nodes: Record<string, Entrance & {highlight: number; mark: number; markStart: number; markEnd: number}>;
  edges: Record<string, {progress: number; highlight: number; start: number; end: number; mark: number; markStart: number; markEnd: number}>;
  groups: Record<string, Entrance>;
  /** Side notes (annotate), in the order they were written. */
  notes: {target: string; text: string; progress: number; start: number; end: number}[];
  /** A notebook page's title, lettered as the run opens. */
  title: {progress: number; start: number; end: number};
  camera: PlaneView;
  /** Seconds on the run's clock: the elements' `start`s are on it too. */
  time: number;
};

/** Highlights ease in over their action and out over this long once they end. */
export const HIGHLIGHT_OUT = .35;
/** On a notebook page the camera moves to each new element this long before the pen starts on it. */
export const FOLLOW_LEAD = .45;
/** A notebook camera move to follow the pen takes this long. */
export const FOLLOW_DUR = .9;
/** A notebook page is filmed close, like a phone over a desk: the element fills most of the frame's width. */
export const NOTEBOOK_PADDING = .04;
export const NOTEBOOK_ZOOM = 2.1;
/** How long the pen takes to letter a notebook page's title. */
export const TITLE_DUR = 1.1;

const ramp = (time: number, start: number, end: number) => (end <= start ? (time >= start ? 1 : 0) : Math.max(0, Math.min(1, (time - start) / (end - start))));

/** A scene's action times: resolved in the render props, or estimated from its text (e.g. in the Studio). */
export const sceneTimes = (scene: Scene, speed = 1, theme = 'clean'): ActionTime[] => {
  const primitive = scene.primitive as DiagramPrimitive;
  if (scene.diagramTimes?.length === primitive.actions.length) return scene.diagramTimes;
  const words = scene.words ?? wordTimes(scene.narration, speechSpan(scene, {speed}));
  return resolveActions(primitive.actions, {words, duration: scene.durationSeconds, theme});
};

/** The canvas box an element occupies: a node, a group, or an edge's bounds. */
export const elementBox = (layout: Layout, id: string): Box | undefined => {
  if (layout.nodes[id]) return layout.nodes[id];
  if (layout.groups[id]) return layout.groups[id];
  const edge = layout.edges[id];
  if (!edge) return undefined;
  const xs = edge.points.map(([x]) => x);
  const ys = edge.points.map(([, y]) => y);
  return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
};

/** The view a camera action asks for. */
export const focusView = (layout: Layout, focus: 'all' | string[], padding: number, size: Size = MAP_SIZE, maxScale?: number): PlaneView => {
  const boxes = focus === 'all' ? [{x: 0, y: 0, w: layout.width, h: layout.height}] : focus.map((id) => elementBox(layout, id)).filter((box): box is Box => Boolean(box));
  return fitBox(unionBox(boxes.length ? boxes : [{x: 0, y: 0, w: layout.width, h: layout.height}]), size, padding, maxScale);
};

/**
 * The canvas at `frame` of scene `index`. Scene starts are counted in whole
 * frames, as the episode's sequences place them.
 */
/** The view that frames a node and its side note together. */
const noteFocus = (layout: Layout, target: string, text: string, size: Size): PlaneView => {
  const note = noteBox(layout, target, text);
  return fitBox(unionBox([layout.nodes[target], note]), size, NOTEBOOK_PADDING, NOTEBOOK_ZOOM);
};

export const canvasState = (manifest: VideoManifest, index: number, frame: number, fps: number, size: Size = MAP_SIZE): CanvasState => {
  const {scenes} = manifest;
  const {spec, layout} = laidOut(manifest);
  // A notebook page follows the pen: the camera goes to each new element as it is drawn,
  // and only a scene's wide framing ("all") is taken from its camera actions.
  const notebook = spec.theme === 'notebook';
  let start = index;
  while (continuesMap(scenes, start)) start--;
  const state: CanvasState = {nodes: {}, edges: {}, groups: {}, notes: [], title: {progress: 1, start: 0, end: 0}, camera: focusView(layout, 'all', .14, size), time: 0};
  const moves: CameraMove[] = [];
  // A notebook episode opens on its title, lettered in the first moments, before the camera moves in.
  const title = notebook && start === 0 ? titleBox(spec, layout) : null;
  if (title) moves.push({view: fitBox(title, size, .06, NOTEBOOK_ZOOM), start: -2, end: -1});
  const speed = manifest.audio?.voice?.speed ?? 1;
  let offset = 0;
  for (let i = start; i <= index; i++) {
    const scene = scenes[i];
    const times = sceneTimes(scene, speed, notebook ? 'notebook' : 'clean').map((time) => ({start: offset + time.start, end: offset + time.end, until: time.until === undefined ? undefined : offset + time.until}));
    const sceneEnd = offset + scene.durationSeconds;
    const now = i === index ? offset + frame / fps : Infinity;
    if (i === index) state.time = now;
    (scene.primitive as DiagramPrimitive).actions.forEach((action: DiagramAction, n) => {
      const time = times[n];
      if (action.do === 'reveal') {
        const entrance: Entrance = {progress: ramp(now, time.start, time.end), anim: action.anim ?? 'draw', start: time.start, end: time.end};
        if (layout.groups[action.target]) {
          state.groups[action.target] = entrance;
          // A group's members arrive with it, unless they're already there. On a notebook page
          // they are drawn one after the other, as a hand would.
          const members = spec.nodes.filter((node) => node.group === action.target && !state.nodes[node.id]);
          members.forEach((node, i) => {
            const [from, to] = notebook ? [time.start + (time.end - time.start) * i / members.length, time.start + (time.end - time.start) * (i + 1) / members.length] : [time.start, time.end];
            state.nodes[node.id] = {progress: ramp(now, from, to), anim: entrance.anim, start: from, end: to, highlight: 0, mark: 0, markStart: 0, markEnd: 0};
            if (notebook) moves.push({view: focusView(layout, [node.id], NOTEBOOK_PADDING, size, NOTEBOOK_ZOOM), start: from - FOLLOW_LEAD, end: from - FOLLOW_LEAD + FOLLOW_DUR});
          });
        } else if (!state.nodes[action.target]) state.nodes[action.target] = {...entrance, highlight: 0, mark: 0, markStart: 0, markEnd: 0};
        if (notebook && !layout.groups[action.target]) moves.push({view: focusView(layout, [action.target], NOTEBOOK_PADDING, size, NOTEBOOK_ZOOM), start: time.start - FOLLOW_LEAD, end: time.start - FOLLOW_LEAD + FOLLOW_DUR});
      } else if (action.do === 'connect') {
        state.edges[action.edge] ??= {progress: ramp(now, time.start, time.end), highlight: 0, start: time.start, end: time.end, mark: 0, markStart: 0, markEnd: 0};
      } else if (action.do === 'highlight') {
        const until = time.until ?? sceneEnd;
        const level = Math.min(ramp(now, time.start, time.end), 1 - ramp(now, until, until + HIGHLIGHT_OUT));
        const element = state.nodes[action.target] ?? state.edges[action.target];
        if (element) {
          element.highlight = Math.max(element.highlight, level);
          const mark = ramp(now, time.start, time.end);
          if (!element.markStart) [element.markStart, element.markEnd] = [time.start, time.end];
          element.mark = Math.max(element.mark, mark);
        }
      } else if (action.do === 'annotate') {
        state.notes.push({target: action.target, text: action.text, progress: ramp(now, time.start, time.end), start: time.start, end: time.end});
        if (notebook) moves.push({view: noteFocus(layout, action.target, action.text, size), start: time.start - FOLLOW_LEAD, end: time.start - FOLLOW_LEAD + FOLLOW_DUR});
      } else if (action.do === 'camera' && (!notebook || action.focus === 'all')) {
        moves.push({view: focusView(layout, action.focus, action.padding ?? .14, size), start: time.start, end: time.end});
      }
    });
    offset += Math.round(scene.durationSeconds * fps) / fps;
  }
  if (title) state.title = {progress: ramp(state.time, 0, TITLE_DUR), start: 0, end: TITLE_DUR};
  moves.sort((a, b) => a.start - b.start);
  state.camera = viewAt(moves, state.time, state.camera);
  return state;
};
