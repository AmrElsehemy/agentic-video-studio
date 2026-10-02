// Deliberate hard cuts inside a scene: a hidden subject snaps from silhouette
// to artwork. The shots (src/video/shots.tsx) time their reveals from these
// fractions, and the render check (#88) accepts a jump exactly there.

/** When a shot reveals a hidden subject, as a fraction of the scene. */
export const REVEAL_AT = {mystery: .45, impact: .34};

/** Does this scene reveal its subject with a cut? (Only shots, not primitives, do.) */
const revealsSubject = (scene) => !scene.primitive && (
  (scene.shot === 'mystery' && (scene.subjectFocus === 'hidden' || scene.subjectFocus === 'absent'))
  || (scene.shot === 'impact' && scene.subjectFocus === 'hidden'));

/**
 * Episode frames where an intended reveal lands: the step from frame f-1 to f
 * is meant to be a jump.
 * @param {{format: {fps: number}, scenes: {durationSeconds: number, shot: string, subjectFocus: string, primitive?: unknown}[]}} manifest
 */
export const intendedCuts = (manifest) => {
  let start = 0;
  return manifest.scenes.flatMap((scene) => {
    const frames = Math.round(scene.durationSeconds * manifest.format.fps);
    const cut = revealsSubject(scene) ? [start + Math.round(frames * REVEAL_AT[scene.shot])] : [];
    start += frames;
    return cut;
  });
};
