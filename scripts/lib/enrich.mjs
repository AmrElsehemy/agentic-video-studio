// A deterministic pass over a directed Geographica draft: the score for its mood, an ambience for every map scene
// that the director left without one, and flags on the scenes that are about countries as countries. It only adds
// what is missing, so the director's own choices (and a re-run of the director) always win.

/** The first thing a scene shows should arrive almost at once: a scene that waits a second for its first label is a map doing nothing. */
export const FIRST_REVEAL = 0.06;
/** The last thing may arrive this late, so there is still time to read it. */
const LAST_REVEAL = 0.9;
/** Times already this early are left alone, so retiming a scene twice changes nothing. */
const ALREADY_PROMPT = 0.08;

/**
 * A map shot with its reveals pulled forward so the first lands at FIRST_REVEAL: every highlight, annotation, data
 * layer and photo time is mapped by one straight line from [earliest, 1] to [FIRST_REVEAL, LAST_REVEAL], so their order
 * and spacing are kept (a little tighter). The camera, street plans and surfaces are not touched.
 */
export const retimeReveals = (primitive) => {
  const times = [...primitive.highlights.map((highlight) => highlight.at), ...primitive.annotations.map((annotation) => annotation.at), ...(primitive.data ? [primitive.data.at] : [])];
  if (!times.length) return primitive;
  const earliest = Math.min(...times);
  if (earliest <= ALREADY_PROMPT) return primitive;
  const map = (at) => Math.round((FIRST_REVEAL + (at - earliest) * ((LAST_REVEAL - FIRST_REVEAL) / (1 - earliest))) * 1000) / 1000;
  // An `until` keeps its place after its own `at` and at least as late as before relative to the scene's end.
  const until = (value, at) => (value === undefined ? undefined : Math.max(map(value), Math.min(1, at + 0.05)));
  return {
    ...primitive,
    highlights: primitive.highlights.map((highlight) => ({...highlight, at: map(highlight.at)})),
    annotations: primitive.annotations.map((annotation) => {
      const at = map(annotation.at);
      return {...annotation, at, ...(annotation.until !== undefined ? {until: until(annotation.until, at)} : {})};
    }),
    ...(primitive.data ? {data: {...primitive.data, at: map(primitive.data.at)}} : {}),
  };
};

const WATER = new Set(['lake', 'river', 'water']);
const MAX_FLAG_SCENES = 3;

/** The countries a map shot is about: highlighted, labelled, or either side of a border. */
const countriesOf = (primitive) => {
  const ids = [
    ...primitive.highlights.map((highlight) => highlight.entity),
    ...primitive.annotations.flatMap((annotation) => ((annotation.type === 'label' || annotation.type === 'marker') && typeof annotation.anchor === 'string' ? [annotation.anchor] : [])),
  ].flatMap((id) => (id.startsWith('border:') ? id.slice('border:'.length).split('-').map((code) => `country:${code}`) : [id]));
  return [...new Set(ids.filter((id) => id.startsWith('country:')))];
};

/** `fallbackAmbience` fills scenes with no setting of their own: a globe is space, water is the sea, the rest the episode's. */
export const enrichDraft = (draft, {score, ambience: fallbackAmbience, entities}) => {
  let flagged = 0;
  const scenes = draft.scenes.map((scene) => {
    const primitive = scene.primitive;
    if (primitive?.kind !== 'geo-map') return scene;
    const next = {...retimeReveals(primitive)};
    if (!next.ambience) {
      const water = [...primitive.highlights.map((highlight) => highlight.entity), ...primitive.annotations.flatMap((annotation) => (typeof annotation.anchor === 'string' ? [annotation.anchor] : []))]
        .some((id) => WATER.has(entities?.get(id)?.kind));
      next.ambience = primitive.globe ? 'space' : water ? 'sea' : fallbackAmbience;
    }
    // Flags where the story is about countries: a border, or two or more countries together; a few scenes only, so they stay special.
    const countries = countriesOf(primitive).filter((id) => !entities?.get(id)?.review?.length);
    const aboutCountries = primitive.highlights.some((highlight) => highlight.entity.startsWith('border:')) || countries.length >= 2;
    if (next.flags === undefined && aboutCountries && !primitive.globe && !primitive.streets && flagged < MAX_FLAG_SCENES) {
      next.flags = true;
      flagged += 1;
    }
    return {...scene, primitive: next};
  });
  return {...draft, score: draft.score ?? score, scenes};
};
