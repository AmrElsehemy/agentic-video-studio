// Planar camera (#123): the geo camera's ideas (fit a box, zoom geometrically,
// continue across scenes) for a flat canvas such as a diagram. A view is the
// canvas point at the centre of the frame and a scale (frame px per canvas px).
// Pure functions of time, so renders are deterministic. The geo camera keeps its
// own Mercator maths in ../geo/camera.ts.

export type Box = {x: number; y: number; w: number; h: number};
export type PlaneView = {x: number; y: number; scale: number};
export type Size = {width: number; height: number};

/** A single node never fills the frame: past this the text would look blown up. */
export const MAX_SCALE = 1.6;

/** The smallest box holding every box given. */
export const unionBox = (boxes: Box[]): Box => {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return {x: left, y: top, w: right - left, h: bottom - top};
};

/** The view that fits a box inside the frame, leaving `padding` (a fraction of each side) as margin. */
export const fitBox = (box: Box, {width, height}: Size, padding = .14, maxScale = MAX_SCALE): PlaneView => ({
  x: box.x + box.w / 2,
  y: box.y + box.h / 2,
  scale: Math.min(maxScale, (width * (1 - 2 * padding)) / Math.max(box.w, 1), (height * (1 - 2 * padding)) / Math.max(box.h, 1)),
});

export const easeInOut = (t: number) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Interpolate two views. Zoom changes geometrically (so a big zoom feels even),
 * about the one canvas point that stays put on screen, so nothing swings out of
 * the frame and back while the camera pans and zooms at once.
 */
export const mixViews = (a: PlaneView, b: PlaneView, t: number): PlaneView => {
  const scale = a.scale * Math.pow(b.scale / a.scale, t);
  // Share of the way from a's centre to b's; a plain pan when the zoom doesn't change.
  const weight = Math.abs(b.scale - a.scale) < 1e-6 ? t : (b.scale * (scale - a.scale)) / (scale * (b.scale - a.scale));
  return {x: a.x + (b.x - a.x) * weight, y: a.y + (b.y - a.y) * weight, scale};
};

/** A camera move: to `view`, between `start` and `end` (seconds on the run's clock). */
export type CameraMove = {view: PlaneView; start: number; end: number};

/**
 * The camera at time `time`: it holds the first move's view until then, and a
 * move that starts before the last one finishes takes over from wherever the
 * camera is.
 */
export const viewAt = (moves: CameraMove[], time: number, fallback: PlaneView): PlaneView => {
  let view = moves[0]?.view ?? fallback;
  for (const move of moves) {
    if (time >= move.end) view = move.view;
    else if (time > move.start) return mixViews(view, move.view, easeInOut((time - move.start) / (move.end - move.start)));
    else break;
  }
  return view;
};

/** The CSS transform that puts `view` at the centre of a frame of `size`. */
export const viewTransform = (view: PlaneView, {width, height}: Size) => `translate(${width / 2}px, ${height / 2}px) scale(${view.scale}) translate(${-view.x}px, ${-view.y}px)`;
