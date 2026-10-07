// Architecture diagrams (#120): an existing reference diagram (an Azure,
// AWS or GCP architecture, imported from draw.io or read from an image)
// replayed as a narrated video. Unlike the laid-out themes, everything keeps
// the position it has in the source, because viewers recognise the picture:
// coordinates are the source's pixels. Numbered steps and their lanes (e.g.
// read flow, write flow) are what the narration walks through.
import {z} from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9-]*$/, 'use lowercase words joined by hyphens, e.g. "app-service"');
const point = z.tuple([z.number(), z.number()]);
const box = z.object({x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive()}).strict();
/** Lines of text as drawn in the source; "\n" breaks a line. */
const label = z.string().min(1).max(80);

/** Lanes colour edges, steps and the dots that travel them. */
export const LANE_COLORS = {read: '#107c10', write: '#4472c4', plain: '#1b1b1b', telemetry: '#a6a6a6'};
export const LANES = Object.keys(LANE_COLORS);

export const archNodeSchema = z.object({
  id,
  label,
  // An icon under public/icons/, e.g. "azure/app-service" (see public/icons/azure/NOTICE.md).
  icon: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  at: point,
  size: z.number().min(16).max(160).default(60),
  labelAt: point,
  align: z.enum(['left', 'center', 'right']).default('center'),
  // A shaded tile behind the node, as external services are drawn.
  tile: box.optional(),
}).strict();

export const archGroupSchema = z.object({
  id,
  label: label.optional(),
  box,
  style: z.enum(['dashed', 'dotted']).default('dashed'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#7fa7e0'),
  labelAt: point.optional(),
  icon: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/).optional(),
  iconAt: point.optional(),
}).strict();

export const archEdgeSchema = z.object({
  id,
  // The route as drawn: start, corners, end (the arrowhead is at the end).
  points: z.array(point).min(2).max(12),
  lane: z.enum(LANES).default('plain'),
  arrow: z.boolean().default(true),
}).strict();

export const archStepSchema = z.object({
  id,
  n: z.number().int().min(1).max(20),
  lane: z.enum(['read', 'write']),
  at: point,
  text: label,
  textAt: point,
}).strict();

export const archSpecSchema = z.object({
  theme: z.literal('architecture'),
  // How it's drawn: as the source draws it ("clean"), or by hand on a dotted notebook page ("sketch").
  look: z.enum(['clean', 'sketch']).default('clean'),
  // Where the diagram came from: "image" (read by a vision pass and checked by a person) or "drawio".
  source: z.object({kind: z.enum(['image', 'drawio']), file: z.string().min(1), width: z.number(), height: z.number()}).strict(),
  nodes: z.array(archNodeSchema).min(1).max(40),
  groups: z.array(archGroupSchema).max(12).default([]),
  edges: z.array(archEdgeSchema).max(60).default([]),
  steps: z.array(archStepSchema).max(30).default([]),
  // Free text drawn on the diagram, e.g. "Metrics and logs".
  labels: z.array(z.object({id, text: label, at: point}).strict()).max(30).default([]),
  legend: z.array(z.object({lane: z.enum(['read', 'write']), text: z.string().min(1).max(30), at: point}).strict()).max(4).default([]),
}).strict();

/** What's wrong with an architecture spec: duplicate ids, or anything outside the source picture. */
export const archProblems = (spec) => {
  const problems = [];
  const seen = new Set();
  for (const item of [...spec.nodes, ...spec.groups, ...spec.edges, ...spec.steps, ...spec.labels]) {
    if (seen.has(item.id)) problems.push(`"${item.id}" names more than one element`);
    seen.add(item.id);
  }
  const {width, height} = spec.source;
  const inside = ([x, y]) => x >= 0 && y >= 0 && x <= width && y <= height;
  for (const node of spec.nodes) if (!inside(node.at) || !inside(node.labelAt)) problems.push(`node "${node.id}" is outside the ${width}×${height} source`);
  for (const edge of spec.edges) if (!edge.points.every(inside)) problems.push(`edge "${edge.id}" runs outside the ${width}×${height} source`);
  const lanes = new Map();
  for (const step of spec.steps) {
    const key = `${step.lane}:${step.n}`;
    if (lanes.has(key)) problems.push(`steps "${lanes.get(key)}" and "${step.id}" are both ${step.lane} step ${step.n}`);
    lanes.set(key, step.id);
  }
  return problems;
};

/**
 * What's wrong with an architecture episode's actions: unknown targets, flows
 * over edges that don't exist, word anchors the narration doesn't say.
 */
export const archActionProblems = (spec, scenes, wordMatches) => {
  const problems = [];
  const ids = new Set([...spec.nodes, ...spec.groups, ...spec.edges, ...spec.steps, ...spec.labels].map((item) => item.id));
  const edges = new Set(spec.edges.map((edge) => edge.id));
  const steps = new Set(spec.steps.map((step) => step.id));
  for (const scene of scenes) {
    if (scene.primitive?.kind !== 'diagram') continue;
    const tokens = scene.narration.split(/\s+/);
    const earlier = new Set();
    scene.primitive.actions.forEach((action, index) => {
      const where = `scene "${scene.id}" action ${index + 1}`;
      const targets = action.do === 'flow' ? [action.step, ...action.edges] : action.do === 'connect' ? [action.edge] : action.do === 'camera' ? (action.focus === 'all' ? [] : action.focus) : [action.target];
      for (const target of targets) if (!ids.has(target)) problems.push(`${where} (${action.do}) names "${target}", which isn't in the diagram`);
      if (action.do === 'flow' && !steps.has(action.step)) problems.push(`${where} flows step "${action.step}", which isn't a step`);
      if (action.do === 'flow') for (const edge of action.edges) if (!edges.has(edge)) problems.push(`${where} sends its dot along "${edge}", which isn't an edge`);
      for (const anchor of [action.at, action.until].filter(Boolean)) {
        if (typeof anchor === 'object' && 'word' in anchor && tokens.filter((token) => wordMatches(token, anchor.word)).length < (anchor.nth ?? 1)) problems.push(`${where} waits for "${anchor.word}", which the narration doesn't say: "${scene.narration}"`);
        if (typeof anchor === 'object' && 'after' in anchor && !earlier.has(anchor.after)) problems.push(`${where} follows "${anchor.after}", which isn't an earlier action in this scene`);
      }
      for (const key of [action.id, ...targets].filter(Boolean)) earlier.add(key);
    });
  }
  return problems;
};
