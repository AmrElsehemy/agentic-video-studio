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
  morph: Boolean(primitive.morph),
  surface: primitive.surface ? [primitive.surface.kind, primitive.surface.rise ?? null] : null,
  route: (primitive.annotations ?? []).some((annotation) => annotation.type === 'route'),
  recon: (primitive.annotations ?? []).some((annotation) => annotation.type === 'reconstruction'),
  truesize: (primitive.annotations ?? []).some((annotation) => annotation.type === 'truesize'),
  flow: (primitive.annotations ?? []).filter((annotation) => annotation.type === 'flow').map((annotation) => annotation.flows.map((flow) => [flow.from, flow.to])),
  daynight: (primitive.annotations ?? []).filter((annotation) => annotation.type === 'daynight').map((annotation) => [annotation.date, annotation.from, annotation.to]),
  ring: (primitive.annotations ?? []).filter((annotation) => annotation.type === 'ring').map((annotation) => annotation.radiusKm),
  photo: (primitive.annotations ?? []).filter((annotation) => annotation.type === 'photo').map((annotation) => annotation.photo),
  satellite: (primitive.annotations ?? []).filter((annotation) => annotation.type === 'satellite').map((annotation) => [annotation.set, annotation.dates, annotation.mode]),
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

/** The devices a map scene can use beyond highlights and labels: what makes an episode more than a template. */
export const mapDevices = (primitive) => {
  const devices = new Set();
  for (const annotation of primitive.annotations ?? []) {
    if (['line', 'ring', 'truesize', 'reconstruction', 'timeline', 'route', 'photo', 'satellite', 'daynight', 'flow'].includes(annotation.type)) devices.add(annotation.type);
  }
  if (primitive.data) devices.add(`data-${primitive.data.view ?? 'map'}`);
  if (primitive.surface) devices.add(`surface-${primitive.surface.kind}`);
  for (const key of ['morph', 'streets', 'relief', 'flags']) if (primitive[key]) devices.add(key);
  if (primitive.globe) devices.add('globe');
  return devices;
};

/** An episode of fewer map scenes than this is not checked for devices. */
export const MIN_SCENES_FOR_DEVICES = 6;
/** An episode should use at least this many different devices (of its map scenes), or it reads as a template. */
export const MIN_DEVICES = 4;

/**
 * Problems with how few different devices an episode's maps use. The director is told which fit, so a repair
 * round can add them where the narration supports them; a device that does not fit is never forced.
 */
export const mapDeviceProblems = (manifest) => {
  const maps = manifest.scenes.filter((scene) => scene.primitive?.kind === 'geo-map');
  // Only a full-length episode is held to this; a two- or three-scene sketch has no room for devices.
  if (maps.length < MIN_SCENES_FOR_DEVICES) return [];
  const used = new Set();
  for (const scene of maps) for (const device of mapDevices(scene.primitive)) used.add(device);
  // The globe bookends and a flag on a label are everywhere; the rest is what gives an episode its own look.
  const own = [...used].filter((device) => device !== 'globe' && device !== 'flags');
  if (own.length >= MIN_DEVICES - 1) return [];
  return [`The episode uses only ${own.length ? own.join(', ') : 'highlights and labels'} as devices, so it looks like every other episode. Use at least ${MIN_DEVICES - 1 - own.length} more where the narration supports it, a different one in each scene: a "line" for a meridian, parallel or latitude; a "ring" for a distance the research states; a "truesize" for an area comparison; a "timeline" for dated steps; a data layer in view "bars" or "bubbles" for a comparison of numbers; "coastDistance" or "elevation" for how far inland or how high; "floodRise" for the sea rising; "morph" for places Mercator inflates; "streets" for a city's layout; "relief" for terrain; a route for a journey. Do not add one the narration does not call for.`];
};
