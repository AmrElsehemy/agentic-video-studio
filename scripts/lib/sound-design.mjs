// Deterministic sound-design planning from story beats. This keeps audio
// punctuation data-driven: every generated episode gets cues without manual
// timeline editing or subject-specific hard-coding.
const CUE_BY_BEAT = {
  hook: 'impact',
  evidence: 'whoosh',
  escalation: 'riser',
  twist: 'reveal',
  reveal: 'reveal',
  payoff: 'impact',
  verdict: 'chime',
  interaction: 'chime',
};

const CUE_BY_ROLE = {
  hook: 'impact',
  evidence: 'whoosh',
  escalation: 'riser',
  payoff: 'impact',
  interaction: 'chime',
};

export const cueForScene = (scene = {}) => CUE_BY_BEAT[scene.beat] || CUE_BY_ROLE[scene.role] || 'whoosh';

export const sceneEnergy = (scene = {}) => {
  const beat = scene.beat || scene.role;
  if (beat === 'hook') return 1.08;
  if (beat === 'escalation' || beat === 'twist' || beat === 'reveal') return 1.12;
  if (beat === 'payoff') return 1.06;
  if (beat === 'verdict' || beat === 'interaction') return 0.9;
  return 1;
};

export const planSoundEvents = (scenes = []) => {
  let cursor = 0;
  return scenes.map((scene, index) => {
    const event = {
      sceneId: scene.id,
      index,
      time: cursor,
      cue: cueForScene(scene),
      energy: sceneEnergy(scene),
    };
    cursor += scene.durationSeconds;
    return event;
  });
};

// Map sound (#geo): a map scene's own events get their own cues, on top of the scene-change cue.
// A highlight lights up with a swell (a trace draws with a soft hiss), a label or marker pops, an
// arrow ticks, a route ticks along its journey, a data map rises, and a camera that changes target
// sweeps. They come from the shot, so a retimed scene moves its sounds with it.

/** Cues, most important first: when two fall close together the later-priority one is dropped. */
const MAP_CUE_PRIORITY = ['swell', 'rise', 'trace', 'pop', 'sweep', 'travel', 'tick'];
/** Closest two map cues may be, in seconds: faster than this reads as a rattle, not as sounds. */
export const MAP_CUE_SPACING = 0.14;
/** Most map cues one scene gets. */
export const MAP_CUES_PER_SCENE = 6;
/** Ticks along a followed route are this far apart, up to this many. */
const TRAVEL_STEP = 0.2;
const TRAVEL_TICKS = 5;

const targetKey = (target) => (typeof target === 'string' ? target : JSON.stringify(target));

/** The cues a geo-map shot calls for, as {offset (0-1 of the scene), cue, gain}, before spacing is applied. */
const mapCuesOf = (primitive, durationSeconds) => {
  const cues = [];
  for (const highlight of primitive.highlights ?? []) {
    cues.push({offset: highlight.at, cue: highlight.style === 'trace' ? 'trace' : 'swell', gain: 1});
  }
  for (const annotation of primitive.annotations ?? []) {
    if (annotation.type === 'label' || annotation.type === 'marker') cues.push({offset: annotation.at, cue: 'pop', gain: 0.9});
    else if (annotation.type === 'arrow') cues.push({offset: annotation.at, cue: 'tick', gain: 1});
    else if (annotation.type === 'route') {
      const end = Math.min(annotation.until ?? annotation.at + 0.4, 1);
      const ticks = Math.min(TRAVEL_TICKS, Math.max(1, Math.floor(((end - annotation.at) * durationSeconds) / TRAVEL_STEP)));
      for (let i = 0; i < ticks; i++) cues.push({offset: annotation.at + (i * TRAVEL_STEP) / durationSeconds, cue: 'travel', gain: 0.55 + 0.1 * Math.min(i, 3)});
    }
  }
  if (primitive.data) cues.push({offset: primitive.data.at ?? 0, cue: 'rise', gain: 1});
  const camera = primitive.camera ?? [];
  for (let i = 1; i < camera.length; i++) {
    // A move that starts with the scene is already marked by the scene-change cue.
    if (camera[i - 1].at >= 0.05 && targetKey(camera[i].target) !== targetKey(camera[i - 1].target)) cues.push({offset: camera[i - 1].at, cue: 'sweep', gain: 0.7});
  }
  return cues;
};

/**
 * The map cues for every geo-map scene, as events like planSoundEvents' (time in seconds from the
 * start of the episode). Cues in a scene are thinned to MAP_CUE_SPACING apart, keeping the more
 * important ones, and capped at MAP_CUES_PER_SCENE. Scenes without a map get none.
 */
export const planMapSoundEvents = (scenes = []) => {
  const events = [];
  let cursor = 0;
  scenes.forEach((scene, index) => {
    if (scene.primitive?.kind === 'geo-map') {
      const wanted = mapCuesOf(scene.primitive, scene.durationSeconds)
        .map((item) => ({...item, time: cursor + Math.min(Math.max(item.offset, 0), 0.97) * scene.durationSeconds}))
        // A cue exactly on the scene change would pile onto that scene's own cue.
        .map((item) => ({...item, time: Math.max(item.time, cursor + 0.08)}))
        .sort((a, b) => MAP_CUE_PRIORITY.indexOf(a.cue) - MAP_CUE_PRIORITY.indexOf(b.cue) || a.time - b.time);
      const kept = [];
      for (const item of wanted) {
        if (kept.length >= MAP_CUES_PER_SCENE) break;
        if (kept.every((other) => Math.abs(other.time - item.time) >= MAP_CUE_SPACING)) kept.push(item);
      }
      for (const item of kept.sort((a, b) => a.time - b.time)) events.push({sceneId: scene.id, index, time: item.time, cue: item.cue, energy: item.gain});
    }
    cursor += scene.durationSeconds;
  });
  return events;
};
