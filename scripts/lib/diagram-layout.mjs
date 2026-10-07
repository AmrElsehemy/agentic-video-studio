// Diagram layout (#122): node boxes and edge paths for a diagram spec, computed
// when the episode is compiled and stored in the manifest. A pure function of
// the spec, so the same spec always gives the same picture, and QA can check
// the geometry (overlaps, overflow, edges through boxes) without rendering.
//
// The prototype lays nodes out top to bottom in ranks (a node's rank is the
// longest path to it from a start), side by side within a rank, centred. The
// layered layout with wrapping comes with #131. A notebook-themed spec gets
// the hand-drawn page layout instead (./diagram-sketch-layout.mjs).
import {layoutSketch, sketchTextProblems} from './diagram-sketch-layout.mjs';

/** The canvas is the scene's visual area (the same as a map's), in its pixels. */
export const CANVAS_WIDTH = 1010;
const MARGIN = 40;
const RANK_GAP = 120;
const NODE_GAP = 48;
const PAD_X = 34;
export const TYPE = {label: 44, detail: 25, tag: 19};
/** Conservative glyph widths (em) for the display, body and tag faces, so measured boxes never clip their text. */
const EM = {label: .56, detail: .52, tag: .68};
const MIN_WIDTH = 300;
const GROUP_PAD = 26;

const textWidth = (text, size, em) => text.length * size * em;

/** A node's box size from its text: tag, label and optional detail line. */
export const nodeSize = (node) => {
  const inner = Math.max(textWidth(node.label, TYPE.label, EM.label), node.detail ? textWidth(node.detail, TYPE.detail, EM.detail) : 0, textWidth(node.kind.toUpperCase(), TYPE.tag, EM.tag));
  return {w: Math.round(Math.max(MIN_WIDTH, inner + PAD_X * 2)), h: node.detail ? 156 : 120};
};

/** Each node's rank: the longest chain of edges leading to it. */
export const ranks = (spec) => {
  const rank = new Map(spec.nodes.map((node) => [node.id, 0]));
  // Relax until stable; the spec is checked to have no loops, so this ends.
  for (let pass = 0; pass < spec.nodes.length; pass++) {
    let changed = false;
    for (const edge of spec.edges) {
      const next = rank.get(edge.from) + 1;
      if (next > rank.get(edge.to)) { rank.set(edge.to, next); changed = true; }
    }
    if (!changed) break;
  }
  return rank;
};

const round = (value) => Math.round(value * 10) / 10;

/**
 * The laid-out diagram: {width, height, nodes: {id: {x, y, w, h, rank}},
 * edges: {id: {points: [[x, y], ...], labelAt?: [x, y]}}, groups: {id: {x, y, w, h}}}.
 * x and y are the box's top-left corner.
 */
export const layoutDiagram = (spec) => {
  if (spec.theme === 'notebook') return layoutSketch(spec);
  const rank = ranks(spec);
  const rows = [];
  for (const node of spec.nodes) (rows[rank.get(node.id)] ??= []).push(node);
  const nodes = {};
  let y = MARGIN;
  for (const row of rows.filter(Boolean)) {
    const sizes = row.map(nodeSize);
    const rowWidth = sizes.reduce((sum, size) => sum + size.w, 0) + NODE_GAP * (row.length - 1);
    const rowHeight = Math.max(...sizes.map((size) => size.h));
    let x = (CANVAS_WIDTH - rowWidth) / 2;
    row.forEach((node, index) => {
      nodes[node.id] = {x: round(x), y: round(y + (rowHeight - sizes[index].h) / 2), w: sizes[index].w, h: sizes[index].h, rank: rank.get(node.id)};
      x += sizes[index].w + NODE_GAP;
    });
    y += rowHeight + RANK_GAP;
  }
  const edges = {};
  for (const edge of spec.edges) {
    const [a, b] = [nodes[edge.from], nodes[edge.to]];
    const start = [round(a.x + a.w / 2), round(a.y + a.h)];
    const end = [round(b.x + b.w / 2), round(b.y)];
    const mid = round((start[1] + end[1]) / 2);
    const points = Math.abs(start[0] - end[0]) < 1 ? [start, end] : [start, [start[0], mid], [end[0], mid], end];
    // The label sits beside the edge's last vertical run, clear of the line.
    edges[edge.id] = {points, ...(edge.label ? {labelAt: [round(end[0] + 14), round((points.at(-2)[1] + end[1]) / 2)]} : {})};
  }
  const groups = {};
  for (const group of spec.groups) {
    const members = spec.nodes.filter((node) => node.group === group.id).map((node) => nodes[node.id]);
    if (!members.length) continue;
    const left = Math.min(...members.map((box) => box.x)) - GROUP_PAD;
    const top = Math.min(...members.map((box) => box.y)) - GROUP_PAD - 30;
    const right = Math.max(...members.map((box) => box.x + box.w)) + GROUP_PAD;
    const bottom = Math.max(...members.map((box) => box.y + box.h)) + GROUP_PAD;
    groups[group.id] = {x: round(left), y: round(top), w: round(right - left), h: round(bottom - top)};
  }
  return {width: CANVAS_WIDTH, height: round(y - RANK_GAP + MARGIN), nodes, edges, groups};
};

const overlaps = (a, b, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** Whether an axis-aligned segment passes through a box's inside. */
const crosses = ([x1, y1], [x2, y2], box) => {
  const [left, right, top, bottom] = [Math.min(x1, x2), Math.max(x1, x2), Math.min(y1, y2), Math.max(y1, y2)];
  return left < box.x + box.w - 1 && right > box.x + 1 && top < box.y + box.h - 1 && bottom > box.y + 1;
};

/** What's wrong with a layout: overlapping boxes, anything off the canvas, edges running through boxes. */
export const layoutProblems = (spec, layout) => {
  const problems = spec.theme === 'notebook' ? sketchTextProblems(spec) : [];
  const ids = Object.keys(layout.nodes);
  ids.forEach((a, index) => ids.slice(index + 1).forEach((b) => {
    if (overlaps(layout.nodes[a], layout.nodes[b], 12)) problems.push(`nodes "${a}" and "${b}" overlap`);
  }));
  for (const [id, box] of Object.entries({...layout.nodes, ...layout.groups})) {
    if (box.x < MARGIN / 2 || box.x + box.w > layout.width - MARGIN / 2) problems.push(`"${id}" runs off the side of the canvas (${Math.round(box.w)} px wide); shorten its text or put fewer nodes in its row`);
  }
  for (const edge of spec.edges) {
    const {points} = layout.edges[edge.id];
    for (const [id, box] of Object.entries(layout.nodes)) {
      if (id === edge.from || id === edge.to) continue;
      for (let index = 1; index < points.length; index++) {
        if (crosses(points[index - 1], points[index], box)) { problems.push(`edge "${edge.id}" runs through node "${id}"`); break; }
      }
    }
  }
  for (const group of spec.groups) {
    const box = layout.groups[group.id];
    if (!box) continue;
    for (const node of spec.nodes) if (node.group !== group.id && overlaps(box, layout.nodes[node.id])) problems.push(`group "${group.id}" covers "${node.id}", which isn't in it`);
  }
  return problems;
};
