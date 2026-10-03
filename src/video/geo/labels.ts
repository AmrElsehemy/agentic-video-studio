// Label placement (#101): map text stays whole inside the frame, and when two
// labels overlap the less important one moves aside, or fades. Everything here is a
// continuous function of where the anchors are drawn, so a moving camera
// slides and fades labels smoothly; nothing pops on or off between frames.

export type Box = {x: number; y: number; halfWidth: number; halfHeight: number};
export type Bounds = {width: number; height: number; safe: number};

/** Display-font capitals run about half an em wide, plus the 3px tracking. */
const CHAR_EM = .5;
const TRACKING = 3;
/** The halo stroke drawn around every label. */
const HALO = 6;

/** The box a label of `size` px covers, centred on (x, y). */
export const labelBox = (x: number, y: number, text: string, size: number): Box => ({
  x,
  y,
  halfWidth: (text.length * (size * CHAR_EM + TRACKING)) / 2 + HALO,
  halfHeight: size / 2 + HALO,
});

/**
 * The box moved inward until it sits wholly inside the frame, `safe` px from
 * every edge. A label wider than the frame stays centred.
 */
export const fitInside = (box: Box, {width, height, safe}: Bounds): Box => {
  const fit = (value: number, half: number, size: number) => (half * 2 > size - safe * 2 ? size / 2 : Math.max(safe + half, Math.min(size - safe - half, value)));
  return {...box, x: fit(box.x, box.halfWidth, width), y: fit(box.y, box.halfHeight, height)};
};

/** Extra room kept between labels, so they don't touch. */
const GAP = 10;
/** The share of the smaller label covered at which the weaker label has fully faded. */
const FULL_FADE = .2;

const smoothstep = (value: number) => {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
};

/** How much of the smaller of two boxes the other covers (0–1), with a small gap around each. */
export const overlapShare = (a: Box, b: Box) => {
  const across = Math.min(a.x + a.halfWidth, b.x + b.halfWidth) - Math.max(a.x - a.halfWidth, b.x - b.halfWidth) + GAP;
  const down = Math.min(a.y + a.halfHeight, b.y + b.halfHeight) - Math.max(a.y - a.halfHeight, b.y - b.halfHeight) + GAP;
  if (across <= 0 || down <= 0) return 0;
  const smaller = Math.min((a.halfWidth * 2 + GAP) * (a.halfHeight * 2 + GAP), (b.halfWidth * 2 + GAP) * (b.halfHeight * 2 + GAP));
  return Math.min(1, (across * down) / smaller);
};

export type Placed = {box: Box; priority: number; opacity: number; anchorY?: number};

/** Overlap (px) over which the weaker label eases into its moved-aside place. */
const PUSH_RAMP = 24;

/** How far two boxes overlap across and down (px, with the gap), or 0 when they don't. */
const overlapSize = (a: Box, b: Box) => {
  const across = Math.min(a.x + a.halfWidth, b.x + b.halfWidth) - Math.max(a.x - a.halfWidth, b.x - b.halfWidth) + GAP;
  const down = Math.min(a.y + a.halfHeight, b.y + b.halfHeight) - Math.max(a.y - a.halfHeight, b.y - b.halfHeight) + GAP;
  return across > 0 && down > 0 ? Math.min(across, down) : 0;
};

/**
 * Where each label goes and how visible it stays, going from the highest
 * priority down. A label that a stronger, visible one covers first moves
 * aside: up when its place is north of the stronger label's place, down when
 * south. (North and south never swap as the camera pans or zooms, so the
 * label never flips sides.) It eases aside as the overlap grows. If it still
 * overlaps after that, at the frame's edge say, it fades by how much is
 * covered, at the pace the stronger label appears.
 */
export const resolveLabels = (labels: Placed[], bounds?: Bounds): {boxes: Box[]; fades: number[]} => {
  const order = labels.map((_, index) => index).sort((a, b) => labels[b].priority - labels[a].priority || b - a);
  const boxes = labels.map((label) => label.box);
  const fades = labels.map(() => 1);
  order.forEach((index, rank) => {
    const stronger = order.slice(0, rank).filter((other) => labels[other].opacity * fades[other] > 0);
    for (const other of stronger) {
      const [box, them] = [boxes[index], boxes[other]];
      const ease = smoothstep(overlapSize(box, them) / PUSH_RAMP) * labels[other].opacity * fades[other];
      if (ease <= 0) continue;
      const clear = box.halfHeight + them.halfHeight + GAP;
      const up = (labels[index].anchorY ?? box.y) <= (labels[other].anchorY ?? them.y);
      const target = up ? Math.min(box.y, them.y - clear) : Math.max(box.y, them.y + clear);
      const moved = {...box, y: box.y + (target - box.y) * ease};
      boxes[index] = bounds ? fitInside(moved, bounds) : moved;
    }
    for (const other of stronger) {
      fades[index] *= 1 - smoothstep(overlapShare(boxes[index], boxes[other]) / FULL_FADE) * labels[other].opacity * fades[other];
    }
  });
  return {boxes, fades};
};
