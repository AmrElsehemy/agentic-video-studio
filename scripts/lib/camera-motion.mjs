// Does the camera move? A map episode whose camera barely drifts, or never gets near anything, reads as a
// slideshow of far views. This measures the shots themselves (no render needed), like map-variety.

const WORLD_BOX = [-180, -60, 180, 80];
/** A scene whose camera changes its framing by at least this factor (in size) counts as a zoom... */
export const MIN_ZOOM_RATIO = 1.4;
/** ...or whose centre travels at least this share of the framing's width counts as a pan. */
export const MIN_PAN_SHARE = 0.5;
/** At least this share of a map episode's scenes must move the camera. */
export const MIN_MOVING_SHARE = 0.7;
/** A "close" framing is no wider than this many degrees of longitude (about a region, not a continent). */
export const CLOSE_SPAN = 9;
/** A reveal (a push-in from wide to close, or the reverse) changes the framing by at least this factor. */
export const REVEAL_RATIO = 3;

/** Primitives whose scene carries its own motion on the picture: a cartogram's circles growing (it ignores the camera), a satellite push, a full-frame photo's push and pan, a street plan's push, a globe's spin, a profile's route. */
const selfMoving = (primitive) => Boolean(primitive.streets || primitive.globe || primitive.series?.view === 'cartogram'
  || (primitive.annotations ?? []).some((annotation) => annotation.type === 'satellite' || (annotation.type === 'photo' && annotation.fill) || annotation.type === 'profile' || (annotation.type === 'route' && annotation.follow)));

/** A key's framing box, grown by its padding so a margin counts as the extra view it is. */
const framingOf = (key, boxes) => {
  const box = key.target === 'world' ? WORLD_BOX : typeof key.target === 'string' ? boxes.get(key.target) : key.target.bbox;
  if (!box || box[0] > box[2]) return undefined;
  const grow = 1 / Math.max(0.2, 1 - 2 * (key.padding ?? 0.15));
  const [width, height] = [(box[2] - box[0]) * grow, (box[3] - box[1]) * grow];
  return {width, height, centre: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]};
};

/**
 * How one scene's camera moves: `zoom` is the largest-over-smallest framing (1 = none), `pan` the
 * farthest the centre travels as a share of the smaller framing's width, `close` the narrowest width in degrees.
 * @returns {{zoom: number, pan: number, close: number, moves: boolean, own: boolean}|undefined} undefined when a box can't be judged
 */
export const sceneMotion = (primitive, boxes) => {
  const frames = primitive.camera.map((key) => framingOf(key, boxes));
  if (frames.some((frame) => !frame)) return undefined;
  const widths = frames.map((frame) => Math.max(frame.width, frame.height * 0.75));
  const zoom = Math.max(...widths) / Math.min(...widths);
  let pan = 0;
  for (const a of frames) for (const b of frames) pan = Math.max(pan, Math.hypot(a.centre[0] - b.centre[0], a.centre[1] - b.centre[1]) / Math.min(a.width, b.width));
  const own = selfMoving(primitive);
  return {zoom, pan, // A population cartogram is itself the detail: each circle is a country, so a regional framing is as close as it gets.
    close: primitive.series?.view === 'cartogram' ? 0 : Math.min(...frames.map((frame) => frame.width)), moves: own || zoom >= MIN_ZOOM_RATIO || pan >= MIN_PAN_SHARE, own};
};

/**
 * @param manifest a video manifest (or draft) whose scenes may carry geo-map primitives
 * @param boxes Map of place id to its camera box
 * @returns {{scenes: number, still: string[], problems: string[]}} the scenes whose camera stays put, and what the episode lacks
 */
export const cameraMotion = (manifest, boxes) => {
  const maps = manifest.scenes.filter((scene) => scene.primitive?.kind === 'geo-map');
  const motions = maps.map((scene) => [scene, sceneMotion(scene.primitive, boxes)]);
  const judged = motions.filter(([, motion]) => motion);
  const still = judged.filter(([, motion]) => !motion.moves).map(([scene]) => scene.id);
  const problems = [];
  if (judged.length >= 4) {
    const moving = judged.length - still.length;
    if (moving / judged.length < MIN_MOVING_SHARE) problems.push(`${still.length} of ${judged.length} map scenes keep the camera still (${still.join(', ')}); at least ${Math.round(MIN_MOVING_SHARE * 100)}% should zoom or pan`);
    if (!judged.some(([, motion]) => motion.own || motion.close <= CLOSE_SPAN)) problems.push(`no scene gets close: the camera never frames anything narrower than ${CLOSE_SPAN}° across`);
    if (!judged.some(([, motion]) => motion.own || motion.zoom >= REVEAL_RATIO)) problems.push(`no scene reveals: none pushes in or pulls back by ${REVEAL_RATIO}× or more`);
  }
  return {scenes: judged.length, still, problems};
};
