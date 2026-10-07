// Notebook layout (#132): a diagram laid out as a hand-drawn page rather than
// a column of boxes. Each node is a cluster (a doodle in a marker circle, its
// lettered label and detail underneath); the flow zig-zags between two
// columns down a tall page, with curved arrows between clusters. A pure
// function of the spec, like the clean layout, so QA can check it unrendered.
import {ranks} from './diagram-layout.mjs';

export const PAGE_WIDTH = 1400;
const COLUMNS = [400, 1000];
const TOP = 150;
const TITLE_SPACE = 190;
const ROW_STEP = 350;
/** Extra room above and below a rank that sits in a group, for the group's outline and its label. */
const GROUP_SPACE = 90;
const RADIUS = 92;
const CLUSTER_WIDTH = 540;
const BOTTOM = 140;
const GROUP_PAD = 34;
/** Lettering sizes on the page, in page pixels. */
export const SKETCH_TYPE = {title: 76, label: 58, detail: 33};
/** Patrick Hand SC is narrow; a conservative em width so measured text never overruns. */
export const SKETCH_EM = .52;

const round = (value) => Math.round(value * 10) / 10;

/** A cluster's bounds: the circle, then the label and the detail line under it. */
const clusterBox = (cx, cy, node) => {
  const below = 30 + SKETCH_TYPE.label + (node.detail ? 12 + SKETCH_TYPE.detail : 0) + 4;
  return {x: round(cx - CLUSTER_WIDTH / 2), y: round(cy - RADIUS - 8), w: CLUSTER_WIDTH, h: round(RADIUS * 2 + 8 + below)};
};

/** A point on a circle's edge, facing `toward`. */
const edgePoint = ([cx, cy], r, [tx, ty]) => {
  const angle = Math.atan2(ty - cy, tx - cx);
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
};

/** Points along a quadratic curve, for the geometry checks. */
const sample = ([x0, y0], [qx, qy], [x1, y1], count = 24) => Array.from({length: count + 1}, (_, index) => {
  const t = index / count;
  return [round((1 - t) ** 2 * x0 + 2 * (1 - t) * t * qx + t * t * x1), round((1 - t) ** 2 * y0 + 2 * (1 - t) * t * qy + t * t * y1)];
});

/** The notebook page: the same shape as the clean layout, plus each node's circle and each edge's curve. */
export const layoutSketch = (spec) => {
  const rank = ranks(spec);
  const rows = [];
  for (const node of spec.nodes) (rows[rank.get(node.id)] ??= []).push(node);
  const nodes = {};
  let y = TOP + (spec.title ? TITLE_SPACE : 0) + RADIUS;
  let side = 0;
  rows.filter(Boolean).forEach((row, index, all) => {
    const grouped = row.some((node) => node.group);
    if (grouped && index > 0) y += GROUP_SPACE;
    // One node takes the next column of the zig-zag; two take a column each. A single node
    // that fans out to, or gathers from, a two-node row sits in the middle, so its arrows don't cross.
    const besidePair = all[index - 1]?.length === 2 || all[index + 1]?.length === 2;
    const xs = row.length === 1 ? [besidePair ? PAGE_WIDTH / 2 : COLUMNS[side]] : row.length === 2 ? COLUMNS : row.map((_, i) => PAGE_WIDTH * (i + 1) / (row.length + 1));
    row.forEach((node, i) => {
      const box = clusterBox(xs[i], y, node);
      nodes[node.id] = {...box, rank: rank.get(node.id), cx: round(xs[i]), cy: round(y), r: RADIUS};
    });
    side = row.length === 1 && !besidePair ? 1 - side : side;
    y += ROW_STEP + (grouped && index < all.length - 1 ? GROUP_SPACE : 0);
  });
  const edges = {};
  spec.edges.forEach((edge, index) => {
    const [a, b] = [nodes[edge.from], nodes[edge.to]];
    const [from, to] = [[a.cx, a.cy], [b.cx, b.cy]];
    const sameColumn = Math.abs(a.cx - b.cx) < 1;
    // Between columns the arrow bows gently; down one column it swings out past the label, toward the page edge.
    const outward = a.cx < PAGE_WIDTH / 2 ? -1 : 1;
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const control = sameColumn ? [mid[0] + outward * 330, mid[1]] : [mid[0] + (index % 2 ? 40 : -40), mid[1] - 70];
    const start = edgePoint(from, a.r + 14, control);
    const end = edgePoint(to, b.r + 18, control);
    const points = sample(start, control, end);
    const d = `M ${round(start[0])} ${round(start[1])} Q ${round(control[0])} ${round(control[1])} ${round(end[0])} ${round(end[1])}`;
    edges[edge.id] = {points, d, ...(edge.label ? {labelAt: points[12]} : {})};
  });
  const groups = {};
  for (const group of spec.groups) {
    const members = spec.nodes.filter((node) => node.group === group.id).map((node) => nodes[node.id]);
    if (!members.length) continue;
    const left = Math.min(...members.map((box) => box.x)) - GROUP_PAD;
    const top = Math.min(...members.map((box) => box.y)) - GROUP_PAD - 24;
    const right = Math.max(...members.map((box) => box.x + box.w)) + GROUP_PAD;
    const bottom = Math.max(...members.map((box) => box.y + box.h)) + GROUP_PAD;
    groups[group.id] = {x: round(left), y: round(top), w: round(right - left), h: round(bottom - top)};
  }
  const height = round(Math.max(...Object.values(nodes).map((box) => box.y + box.h), ...Object.values(groups).map((box) => box.y + box.h)) + BOTTOM);
  return {width: PAGE_WIDTH, height, nodes, edges, groups, ...(spec.title ? {titleAt: [PAGE_WIDTH / 2, TOP + SKETCH_TYPE.title]} : {})};
};

/** Whether lettering fits its cluster: a label or detail wider than the cluster would run into the next column. */
export const sketchTextProblems = (spec) => spec.nodes.flatMap((node) => [
  [node.label, SKETCH_TYPE.label],
  ...(node.detail ? [[node.detail, SKETCH_TYPE.detail]] : []),
].filter(([text, size]) => text.length * size * SKETCH_EM > CLUSTER_WIDTH).map(([text]) => `"${text}" is too long to letter under its doodle; keep it under ${Math.floor(CLUSTER_WIDTH / (SKETCH_TYPE.detail * SKETCH_EM))} characters`));
