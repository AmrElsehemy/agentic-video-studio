// Architecture explainers (#120): a diagram that builds up across an episode,
// each element appearing as the narration names it. The episode's `diagram`
// says what exists (nodes, edges, groups); each scene's `diagram` primitive says
// what appears when (actions). Layout is computed when the episode is compiled
// (scripts/lib/diagram-layout.mjs), so the model never writes coordinates and
// the renderer only draws.
import {z} from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9-]*$/, 'use lowercase words joined by hyphens, e.g. "planner"');

/** What a node is: decides its tag and, later, its icon. */
export const NODE_KINDS = ['user', 'agent', 'tool', 'process', 'artifact', 'store', 'model', 'api'];
/** Hand-drawn doodles the notebook theme can draw for a node (src/video/sketch/doodles.ts); without one it draws its kind's. */
export const DOODLES = ['person', 'robot', 'compass', 'pencil', 'film', 'microphone', 'notes', 'clapper', 'magnifier', 'play', 'gear', 'wrench', 'page', 'database', 'brain', 'plug'];
/** How the diagram is drawn: clean boxes and arrows, or a hand-drawn notebook page (#132). */
export const DIAGRAM_THEMES = ['clean', 'notebook'];

export const diagramNodeSchema = z.object({
  id,
  label: z.string().min(1).max(24),
  kind: z.enum(NODE_KINDS),
  // A short line under the label, e.g. "picks the story shape".
  detail: z.string().min(1).max(36).optional(),
  group: id.optional(),
  doodle: z.enum(DOODLES).optional(),
}).strict();

export const diagramEdgeSchema = z.object({
  id,
  from: id,
  to: id,
  label: z.string().min(1).max(20).optional(),
  style: z.enum(['solid', 'dashed']).default('solid'),
}).strict();

export const diagramGroupSchema = z.object({id, label: z.string().min(1).max(20)}).strict();

export const diagramSpecSchema = z.object({
  // Top to bottom suits a 9:16 frame; more directions come with the layered layout (#131).
  direction: z.literal('down').default('down'),
  theme: z.enum(DIAGRAM_THEMES).default('clean'),
  // Lettered across the top of a notebook page.
  title: z.string().min(1).max(40).optional(),
  nodes: z.array(diagramNodeSchema).min(2).max(16),
  edges: z.array(diagramEdgeSchema).max(24).default([]),
  groups: z.array(diagramGroupSchema).max(6).default([]),
}).strict();

/** What's wrong with a spec beyond its shape: duplicate ids, edges or groups that point nowhere, a cycle. */
export const diagramProblems = (spec) => {
  const problems = [];
  const nodes = new Set();
  for (const node of spec.nodes) {
    if (nodes.has(node.id)) problems.push(`node "${node.id}" is defined twice`);
    nodes.add(node.id);
  }
  const groups = new Set(spec.groups.map((group) => group.id));
  for (const node of spec.nodes) if (node.group && !groups.has(node.group)) problems.push(`node "${node.id}" is in group "${node.group}", which isn't defined`);
  const edges = new Set();
  for (const edge of spec.edges) {
    if (edges.has(edge.id) || nodes.has(edge.id)) problems.push(`"${edge.id}" names more than one element`);
    edges.add(edge.id);
    for (const end of [edge.from, edge.to]) if (!nodes.has(end)) problems.push(`edge "${edge.id}" points at "${end}", which isn't a node`);
    if (edge.from === edge.to) problems.push(`edge "${edge.id}" goes from "${edge.from}" to itself`);
  }
  for (const group of spec.groups) if (nodes.has(group.id) || edges.has(group.id)) problems.push(`"${group.id}" names more than one element`);
  // The layout ranks nodes by their longest path from the start, so the graph must not loop.
  const out = new Map(spec.nodes.map((node) => [node.id, spec.edges.filter((edge) => edge.from === node.id).map((edge) => edge.to)]));
  const state = new Map();
  const visit = (node) => {
    if (state.get(node) === 'done') return false;
    if (state.get(node) === 'open') return true;
    state.set(node, 'open');
    const looped = (out.get(node) ?? []).some(visit);
    state.set(node, 'done');
    return looped;
  };
  if (spec.nodes.some((node) => visit(node.id))) problems.push('the edges loop back on themselves; feedback edges come with the layered layout (#131)');
  return problems;
};

// When an action happens, relative to its scene: a fraction of the scene, the
// moment a word is spoken, a chain after another action, or the scene's end.
// Resolved after narration timing (scripts/lib/diagram-timing.mjs).
export const anchorSchema = z.union([
  z.number().min(0).max(1),
  z.object({word: z.string().min(1).max(30), nth: z.number().int().min(1).default(1)}).strict(),
  z.object({after: id, delay: z.number().min(0).max(4).default(0)}).strict(),
  z.literal('scene-end'),
]);

/** Verbs the prototype draws; the rest of the vocabulary (#131) adds circle, pulse, dim, code and clear. */
export const DIAGRAM_VERBS = ['reveal', 'connect', 'highlight', 'camera', 'annotate', 'flow'];

const base = {id: id.optional(), at: anchorSchema, dur: z.number().min(0.1).max(4).optional()};
export const diagramActionSchema = z.discriminatedUnion('do', [
  // A node or a group appears: its box draws on and its label writes in (draw), springs in (pop) or fades.
  z.object({do: z.literal('reveal'), target: id, anim: z.enum(['draw', 'pop', 'fade']).default('draw'), ...base}).strict(),
  // An edge's arrow draws along its path.
  z.object({do: z.literal('connect'), edge: id, ...base}).strict(),
  // A node or edge lights up in the accent colour until `until` (or the end of the canvas).
  z.object({do: z.literal('highlight'), target: id, until: anchorSchema.optional(), ...base}).strict(),
  // The camera moves to frame these elements ("all": everything defined).
  // A handwritten side note beside a node, with a little arrow to it (drawn on notebook pages; skipped on clean ones).
  z.object({do: z.literal('annotate'), target: id, text: z.string().min(1).max(44), ...base}).strict(),
  // A numbered step of an architecture diagram (./diagram-arch-schema.mjs): its badge and text appear,
  // and a dot in the step's lane colour travels the edges in order, drawing any not yet shown.
  z.object({do: z.literal('flow'), step: id, edges: z.array(id).min(1).max(6), ...base}).strict(),
  z.object({do: z.literal('camera'), focus: z.union([z.literal('all'), z.array(id).min(1).max(8)]), padding: z.number().min(0).max(.4).default(.14), ...base}).strict(),
]);

export const diagramPrimitiveFields = {
  kind: z.literal('diagram'),
  actions: z.array(diagramActionSchema).min(1).max(12),
  // Starts a fresh canvas instead of building on the previous scene's.
  cut: z.boolean().optional(),
};

/** The ids an action refers to. */
export const actionTargets = (action) => (action.do === 'connect' ? [action.edge] : action.do === 'flow' ? [action.step, ...action.edges] : action.do === 'camera' ? (action.focus === 'all' ? [] : action.focus) : [action.target]);

/** Lowercase letters and digits of a word, for matching anchors to narration. */
export const wordKey = (text) => String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

/** Whether a spoken token is the anchor word (a plural or possessive of it counts: "storyboards" for "storyboard"). */
export const wordMatches = (token, word) => {
  const [spoken, wanted] = [wordKey(token), wordKey(word)];
  return spoken === wanted || (wanted.length >= 4 && spoken.startsWith(wanted) && spoken.length - wanted.length <= 2);
};

/**
 * What's wrong with an episode's diagram actions: targets that don't exist,
 * arrows drawn before both ends are on screen, highlights of things not yet
 * shown, word anchors the narration never says, chains to unknown actions.
 * `scenes` are the episode's scenes in order ({id, narration, primitive}).
 */
export const diagramActionProblems = (spec, scenes) => {
  const problems = [];
  const nodes = new Set(spec.nodes.map((node) => node.id));
  const edges = new Map(spec.edges.map((edge) => [edge.id, edge]));
  const groups = new Set(spec.groups.map((group) => group.id));
  let shown = new Set();
  for (const scene of scenes) {
    if (scene.primitive?.kind !== 'diagram') continue;
    if (scene.primitive.cut) shown = new Set();
    const where = (index) => `scene "${scene.id}" action ${index + 1}`;
    const tokens = scene.narration.split(/\s+/);
    const earlier = new Set();
    scene.primitive.actions.forEach((action, index) => {
      for (const target of actionTargets(action)) {
        const known = action.do === 'connect' ? edges.has(target) : action.do === 'annotate' ? nodes.has(target) : nodes.has(target) || groups.has(target) || (action.do === 'highlight' && edges.has(target));
        if (!known) problems.push(`${where(index)} (${action.do}) names "${target}", which isn't in the diagram`);
      }
      if (action.do === 'connect' && edges.has(action.edge)) {
        const edge = edges.get(action.edge);
        for (const end of [edge.from, edge.to]) if (!shown.has(end)) problems.push(`${where(index)} draws "${action.edge}" before "${end}" is on screen`);
      }
      if (action.do === 'highlight' && !shown.has(action.target)) problems.push(`${where(index)} highlights "${action.target}" before it is on screen`);
      if (action.do === 'annotate' && !nodes.has(action.target)) problems.push(`${where(index)} annotates "${action.target}", which isn't a node`);
      else if (action.do === 'annotate' && !shown.has(action.target)) problems.push(`${where(index)} annotates "${action.target}" before it is on screen`);
      for (const anchor of [action.at, action.until].filter(Boolean)) {
        if (typeof anchor === 'object' && 'word' in anchor && tokens.filter((token) => wordMatches(token, anchor.word)).length < (anchor.nth ?? 1)) {
          problems.push(`${where(index)} waits for "${anchor.word}"${(anchor.nth ?? 1) > 1 ? ` (time ${anchor.nth})` : ''}, which the narration doesn't say: "${scene.narration}"`);
        }
        if (typeof anchor === 'object' && 'after' in anchor && !earlier.has(anchor.after)) problems.push(`${where(index)} follows "${anchor.after}", which isn't an earlier action in this scene`);
      }
      if (action.do === 'reveal') {
        shown.add(action.target);
        // Revealing a group shows its members too.
        for (const node of spec.nodes) if (node.group === action.target) shown.add(node.id);
      }
      if (action.do === 'connect') shown.add(action.edge);
      if (action.id) earlier.add(action.id);
      for (const target of actionTargets(action)) earlier.add(target);
    });
  }
  return problems;
};
