// Render checks (#88): what one frame per scene can't show. Motion is judged
// on consecutive frames of the episode's busiest few seconds (a camera snap,
// a label that flickers for one frame), and determinism by rendering the same
// frames twice in a different order.

/** Mean absolute difference of two greyscale images of the same size (0–255). */
export const meanDifference = (a, b) => {
  if (a.length !== b.length) throw new Error(`Frame sizes differ (${a.length} vs ${b.length} pixels)`);
  let sum = 0;
  for (let index = 0; index < a.length; index++) sum += Math.abs(a[index] - b[index]);
  return sum / a.length;
};

/** Differences between neighbouring frames: element i compares frame i and i+1. */
export const neighbourDifferences = (frames) => frames.slice(1).map((frame, index) => meanDifference(frames[index], frame));

/** First frame of each scene, and which scene changes are hard cuts (map scenes that continue are not). */
export const sceneStarts = (manifest) => {
  const fps = manifest.format.fps;
  let start = 0;
  return manifest.scenes.map((scene, index) => {
    const entry = {index, start, end: start + Math.round(scene.durationSeconds * fps)};
    start = entry.end;
    return entry;
  });
};

/**
 * The busiest `length` frames that don't cross a scene change, from a coarse
 * scan: `scan` is [{frame, gray}] every few frames. Returns the window's first
 * frame and its summed motion.
 * @param {{format: {fps: number}, scenes: {durationSeconds: number}[]}} manifest
 * Steps across an intended cut (`cuts`, e.g. a reveal) don't count as motion.
 * @param {{frame: number, gray: Uint8Array | number[]}[]} scan
 * @param {number} [length]
 * @param {number[]} [cuts]
 */
export const busiestWindow = (manifest, scan, length = STRIP_LENGTH, cuts = []) => {
  const scenes = sceneStarts(manifest);
  const steps = scanSteps(manifest, scan, cuts);
  let best = {start: 0, motion: -1};
  for (const scene of scenes) {
    const last = scene.end - length;
    for (const step of steps) {
      // Try a window starting at each scanned frame inside the scene.
      if (step.from < scene.start || step.from > last) continue;
      const motion = steps.filter((other) => other.from >= step.from && other.to <= step.from + length).reduce((sum, other) => sum + other.motion, 0);
      if (motion > best.motion) best = {start: step.from, motion};
    }
  }
  return best.motion < 0 ? {start: 0, motion: 0} : best;
};

/** Scenes fade out over their last frames (CompiledEpisodeScene); the scan leaves that fade out. */
export const EXIT_FRAMES = 8;

/**
 * Motion between scanned frames. Steps across a scene change, into a scene's
 * exit fade, or across an intended cut count as none: they are planned.
 */
const scanSteps = (manifest, scan, cuts = []) => {
  const scenes = sceneStarts(manifest);
  const sceneOf = (frame) => scenes.findIndex((scene) => frame >= scene.start && frame < scene.end);
  const smooth = (from, to) => sceneOf(from) === sceneOf(to) && to < scenes[sceneOf(to)].end - EXIT_FRAMES && !cuts.some((cut) => cut > from && cut <= to);
  return scan.slice(1).map((sample, index) => ({from: scan[index].frame, to: sample.frame, motion: smooth(scan[index].frame, sample.frame) ? meanDifference(scan[index].gray, sample.gray) : 0}));
};

/** A scan step below this (0–255, on the small scan frames) is too small to be a snap. */
export const SCAN_FLOOR = 1.5;
/** A scan step this many times larger than the steps either side is sudden. */
export const SUDDEN_SCORE = 3;
/** At most this many sudden places are checked frame by frame, most sudden first. */
export const SUDDEN_WINDOWS = 4;

/**
 * Windows around the scan's most sudden steps: steps much larger than the
 * steps either side, where a snap hides even when the busiest window is
 * elsewhere. Returns up to `count` window starts, each inside its scene.
 */
export const suddenWindows = (manifest, scan, {cuts = [], count = SUDDEN_WINDOWS, length = STRIP_LENGTH} = {}) => {
  const scenes = sceneStarts(manifest);
  const steps = scanSteps(manifest, scan, cuts);
  return steps
    .map((step, index) => ({...step, score: step.motion / Math.max(steps[index - 1]?.motion ?? 0, steps[index + 1]?.motion ?? 0, SCAN_FLOOR)}))
    .filter((step) => step.motion >= SCAN_FLOOR && step.score >= SUDDEN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((step) => {
      const scene = scenes.find((item) => step.from >= item.start && step.from < item.end);
      const centred = Math.round((step.from + step.to - length) / 2);
      return {start: Math.max(scene.start, Math.min(centred, scene.end - length)), motion: step.motion, score: step.score};
    });
};

/** Consecutive frames checked, from the busiest window: 24 frames is 0.8 s at 30 fps. */
export const STRIP_LENGTH = 24;
/** A step this many times larger than the steps around it is a jump. */
export const JUMP_RATIO = 3;
/** Below this mean difference (0–255) a change is too small to see, however it compares. */
export const JUMP_FLOOR = 3;

/**
 * Single-frame jumps in a run of neighbour differences. Smooth motion, even
 * fast, ramps up and down over several frames; a camera snap is one step far
 * larger than the steps either side of it, and a one-frame flicker is two
 * such steps in a row (the frame appears, then disappears).
 * @param {number[]} differences
 * @returns {{at: number, kind: 'snap' | 'flicker', difference: number, around: number}[]} `at` indexes the step (frame at → at+1)
 */
export const findJumps = (differences, {ratio = JUMP_RATIO, floor = JUMP_FLOOR} = {}) => {
  const at = (index) => differences[index] ?? 0;
  const stands = (value, around) => value >= floor && value > ratio * Math.max(around, floor / ratio);
  const jumps = [];
  differences.forEach((difference, index) => {
    const around = Math.max(at(index - 1), at(index + 1));
    if (stands(difference, around)) jumps.push({at: index, kind: 'snap', difference, around});
    else if (index + 1 < differences.length && !jumps.some((jump) => jump.at === index - 1)) {
      const pair = Math.min(difference, at(index + 1));
      const outside = Math.max(at(index - 1), at(index + 2));
      if (stands(pair, outside)) jumps.push({at: index, kind: 'flicker', difference: pair, around: outside});
    }
  });
  return jumps;
};

/**
 * Frames to render twice for the determinism check: the window's start,
 * middle and end, plus the middle of the first and last scenes. The second
 * pass renders them in reverse, so a frame that depends on what was rendered
 * before it (state, randomness, time) comes out different.
 */
export const determinismFrames = (manifest, windowStart, length = STRIP_LENGTH) => {
  const scenes = sceneStarts(manifest);
  const middle = (scene) => Math.floor((scene.start + scene.end) / 2);
  return [...new Set([windowStart, windowStart + Math.floor(length / 2), windowStart + length - 1, middle(scenes[0]), middle(scenes.at(-1))])].sort((a, b) => a - b);
};

/** A pixel whose brightness differs by more than this (0–255) between two renders has visibly changed. */
export const NOISE_LEVEL = 8;
/** Re-rendered frames may differ in at most this share of pixels (anti-aliasing noise, not content). */
export const MAX_CHANGED_SHARE = .0005;

/**
 * How two renders of the same frame differ: the share of pixels changed by
 * more than NOISE_LEVEL, and the largest change. Chrome's anti-aliasing can
 * shift a few pixels by a few levels between renders; randomness or leftover
 * state moves whole shapes.
 */
export const renderDifference = (a, b) => {
  if (a.length !== b.length) throw new Error(`Frame sizes differ (${a.length} vs ${b.length} pixels)`);
  let changed = 0;
  let largest = 0;
  for (let index = 0; index < a.length; index++) {
    const difference = Math.abs(a[index] - b[index]);
    if (difference > NOISE_LEVEL) changed++;
    if (difference > largest) largest = difference;
  }
  return {changedShare: changed / a.length, largest, alike: changed / a.length <= MAX_CHANGED_SHARE};
};
