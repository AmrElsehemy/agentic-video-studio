// A deterministic pass over a directed Geographica draft: the score for its mood, an ambience for every map scene
// that the director left without one, and flags on the scenes that are about countries as countries. It only adds
// what is missing, so the director's own choices (and a re-run of the director) always win.

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
    const next = {...primitive};
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
