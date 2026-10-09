// Does the map change from scene to scene? A map episode where scene after scene shows the same
// camera, the same highlight and no data layer reads as a slideshow of one picture, however good
// the narration is. This checks the shots themselves (no render needed), so it runs at release
// time and when a draft is directed.

/** The part of a map shot a viewer sees as "the same picture": framing, what is lit, and the layers. */
const viewOf = (primitive) => JSON.stringify({
  camera: primitive.camera ?? [],
  highlights: (primitive.highlights ?? []).map(({entity, style}) => [entity, style]),
  data: primitive.data?.label ?? null,
  relief: Boolean(primitive.relief),
  route: (primitive.annotations ?? []).some((annotation) => annotation.type === 'route'),
  recon: (primitive.annotations ?? []).some((annotation) => annotation.type === 'reconstruction'),
  truesize: (primitive.annotations ?? []).some((annotation) => annotation.type === 'truesize'),
  ring: (primitive.annotations ?? []).filter((annotation) => annotation.type === 'ring').map((annotation) => annotation.radiusKm),
});

/** At least this share of consecutive map scenes must differ from the one before... */
export const MIN_CHANGING_SHARE = 0.6;
/** ...and at least this share of all map scenes must show a view no other scene does (3 of 7 fail). */
export const MIN_DISTINCT_SHARE = 0.5;

/**
 * @param manifest a video manifest (or draft) whose scenes may carry geo-map primitives
 * @returns {{scenes: number, repeats: string[], problems: string[]}} the scenes that repeat the one
 *   before, and a problem when too many do
 */
export const mapVariety = (manifest) => {
  const maps = manifest.scenes.filter((scene) => scene.primitive?.kind === 'geo-map');
  const repeats = [];
  for (let index = 1; index < maps.length; index++) {
    if (viewOf(maps[index].primitive) === viewOf(maps[index - 1].primitive)) repeats.push(maps[index].id);
  }
  const problems = [];
  const pairs = maps.length - 1;
  const distinct = new Set(maps.map((scene) => viewOf(scene.primitive))).size;
  if (pairs >= 2 && (pairs - repeats.length) / pairs < MIN_CHANGING_SHARE) {
    problems.push(`The map barely changes: ${repeats.length} of ${pairs} scenes repeat the previous scene's camera, highlights and layers (${repeats.join(', ')}). Direct it: npm run geo:direct -- <id> --write.`);
  } else if (maps.length >= 4 && distinct / maps.length < MIN_DISTINCT_SHARE) {
    problems.push(`The map keeps returning to the same few pictures: ${distinct} different views in ${maps.length} scenes. Direct it: npm run geo:direct -- <id> --write.`);
  }
  return {scenes: maps.length, distinct, repeats, problems};
};

/**
 * Direction problems the Geo Visual Director fixes in its repair rounds (not release blockers, so
 * episodes already published are unaffected): the whole-world view is for the opening and the close
 * only. A scene about one place that opens on the world shows a speck for half its length.
 */
export const mapDirectionProblems = (manifest) => {
  const maps = manifest.scenes.filter((scene) => scene.primitive?.kind === 'geo-map');
  const misplaced = maps
    .filter((scene, index) => scene.primitive.camera?.[0]?.target === 'world' && index !== 0 && index !== maps.length - 1)
    .map((scene) => scene.id);
  return misplaced.length
    ? [`Scene${misplaced.length > 1 ? 's' : ''} ${misplaced.join(', ')} open${misplaced.length > 1 ? '' : 's'} on the whole-world view. Only the first and last scene may; open the others on the places they discuss.`]
    : [];
};
