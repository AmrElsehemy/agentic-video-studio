// Beat-snapped reveals (#87): map highlights, labels, routes, data and camera
// arrivals land on a beat of the episode's music bed. The bed plays from the
// first frame at a fixed tempo (scripts/generate-audio.mjs), so beat k falls at
// k × 60 / bpm seconds. Snapping runs when the render props are prepared,
// after narration timing has set each scene's final length, so the beats line
// up with what is actually heard. Same manifest, same timing: same frames.
import {FOLLOW_LATEST, primitiveSchema, routeUntil} from '../primitive-schema.mjs';

/**
 * `at` (a fraction of the scene) moved to the nearest beat, or to the other
 * beat beside it when the nearest one breaks `ok`; unchanged when neither
 * fits or the value is the scene's very start or end.
 */
const snapper = ({start, frames, fps, beatFrames}) => (at, ok = () => true) => {
  if (at <= 0 || at >= 1) return at;
  const frame = start + at * frames;
  const below = Math.floor(frame / beatFrames) * beatFrames;
  const beats = [below, below + beatFrames].sort((a, b) => Math.abs(a - frame) - Math.abs(b - frame));
  for (const beat of beats) {
    // Whole frames, so a reveal starts exactly on the frame the beat falls in.
    const snapped = (Math.round(beat) - start) / frames;
    if (snapped > 0 && snapped < 1 && ok(snapped)) return Number(snapped.toFixed(6));
  }
  return at;
};

/** A map primitive with its times on beats; the original when the snapped one would be invalid. */
export const snapPrimitive = (primitive, scene) => {
  const snap = snapper(scene);
  let previous = 0;
  const camera = primitive.camera.map((key, index) => {
    const at = index === 0 ? key.at : snap(key.at, (value) => value > previous);
    previous = at;
    return {...key, at};
  });
  const annotations = primitive.annotations.map((annotation) => {
    const at = snap(annotation.at);
    if (annotation.type === 'route') {
      const until = routeUntil(annotation);
      const latest = annotation.follow ? FOLLOW_LATEST : 1;
      return {...annotation, at, until: snap(until, (value) => value > at && value <= latest)};
    }
    if ((annotation.type === 'label' || annotation.type === 'marker') && annotation.until !== undefined) {
      return {...annotation, at, until: snap(annotation.until, (value) => value > at)};
    }
    return {...annotation, at};
  });
  const snapped = {
    ...primitive,
    camera,
    highlights: primitive.highlights.map((highlight) => ({...highlight, at: snap(highlight.at)})),
    annotations,
    ...(primitive.data ? {data: {...primitive.data, at: snap(primitive.data.at)}} : {}),
  };
  return primitiveSchema.safeParse(snapped).success ? snapped : primitive;
};

/**
 * The manifest with every map scene's times on the music's beats. Scenes
 * without a map, and episodes without a music bed, are returned unchanged.
 */
export const snapToBeats = (manifest) => {
  const bpm = manifest.audio?.bed?.bpm;
  if (!bpm) return manifest;
  const fps = manifest.format.fps;
  const beatFrames = (60 / bpm) * fps;
  let start = 0;
  const scenes = manifest.scenes.map((scene) => {
    // Scene lengths round to whole frames one by one, as the renderer lays them out.
    const frames = Math.round(scene.durationSeconds * fps);
    const timing = {start, frames, fps, beatFrames};
    start += frames;
    return scene.primitive?.kind === 'geo-map' ? {...scene, primitive: snapPrimitive(scene.primitive, timing)} : scene;
  });
  return {...manifest, scenes};
};
