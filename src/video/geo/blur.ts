import {mercatorY, normalizeLon, type Size, type View} from './camera';

// Motion blur (#87): a fast camera move is drawn as the average of a few
// renders spread across part of a frame, as a film camera's open shutter
// would see it. The blur grows with the camera's speed, so it never switches
// on with a pop, and slow moves render exactly as before (one render).

const RAD = Math.PI / 180;

/**
 * How far (px) the picture moves between two views: the shift of the frame's
 * centre, plus how far the corners travel as the zoom changes.
 */
export const viewShift = (from: View, to: View, {width, height}: Size) => {
  const dx = normalizeLon(from.lon - to.lon) * RAD * to.scale;
  const dy = (mercatorY(from.lat) - mercatorY(to.lat)) * to.scale;
  const zoom = Math.hypot(width, height) / 2 * Math.abs(to.scale / from.scale - 1);
  return Math.hypot(dx, dy) + zoom;
};

/** Below this speed (px per frame) there is no blur at all. */
export const BLUR_FROM = 40;
/** At and above this speed the shutter is fully open. */
export const BLUR_FULL = 120;
/** Fully open, the shutter spans half a frame (a 180° shutter, as in film). */
export const SHUTTER = .5;
/** Renders averaged per blurred frame: enough to smooth the streak, few enough to bound render time. */
export const SAMPLES = 4;

const smoothstep = (value: number) => {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
};

/**
 * Renders sit at most this far apart (px). Further apart, a fast zoom shows as
 * separate ghost copies of every border instead of a smear, so the very fastest
 * moves get a shorter streak rather than a longer, broken one.
 */
export const MAX_GAP = 8;

/**
 * How much of a frame the shutter stays open for at `speed` px per frame: 0
 * when slow, growing to SHUTTER when fast, and short enough that renders stay
 * within MAX_GAP of each other.
 */
export const shutterFor = (speed: number) => Math.min(SHUTTER * smoothstep((speed - BLUR_FROM) / (BLUR_FULL - BLUR_FROM)), MAX_GAP * (SAMPLES - 1) / Math.max(speed, 1));

/**
 * The frame times to render and average for `frame`: just the frame when the
 * shutter is closed, otherwise SAMPLES times spread evenly across the shutter,
 * centred on the frame (so the picture doesn't lag the motion), kept inside
 * the scene.
 */
export const blurSamples = (frame: number, shutter: number, lastFrame: number) => {
  if (shutter <= 0) return [frame];
  return Array.from({length: SAMPLES}, (_, index) => Math.max(0, Math.min(lastFrame, frame + shutter * (index / (SAMPLES - 1) - .5))));
};
