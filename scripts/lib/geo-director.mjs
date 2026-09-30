// Geo Visual Director (#74): gives every scene of a geography draft a map
// shot. The model chooses the choreography (what the camera frames, what
// lights up, what is labelled) but never coordinates or outlines: it can only
// name places the research resolved to map ids, the research's named points,
// or a framing "around" several places. Every number on screen must be in the
// research, and a point that isn't surveyed must say so. A shot that breaks a
// rule is replaced by a plain map of the subject, with a warning.
import {primitiveSchema} from '../primitive-schema.mjs';
import {geoResearchSchema} from '../geo-research-schema.mjs';
import {compileEpisode} from './compiler.mjs';
import {parseJsonReply} from './fact-verifier.mjs';
import {geoProblems, loadGeoData} from './geo-primitives.mjs';
import {resolvePlaces} from './geo-resolver.mjs';

/** Degrees framed around a named point when the camera targets it. */
export const POINT_SPAN = [2, 1.5];
/** Words that tell the viewer a point is approximate. */
const APPROXIMATE = /\b(APPROX\.?|APPROXIMATE|AREA|NEAR|AROUND|ABOUT)\b|~/i;

/** Numbers in on-screen text ("8,000", "6000–5800 BC" → 8000, 6000, 5800). */
export const textNumbers = (text) => [...String(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) => Number(match[0].replace(/,/g, '')));

/** Every number the research's claims state. */
export const geoResearchNumbers = (research) => new Set(research.claims.flatMap((claim) => textNumbers(claim.text)));

/**
 * Resolve the research's subject and regions to map ids. Returns the places
 * the director may use, the subject's id, and the review flags of any of
 * them (their disputed areas may also be used, for hatching). Throws when a
 * name doesn't resolve: the research needs fixing, not the model.
 */
export const resolveResearchPlaces = (research, geo) => {
  const names = [research.subject, ...research.regions];
  const {resolved, problems} = resolvePlaces(names, geo);
  if (problems.length) throw new Error(`${research.id}'s research names places the map can't show:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  const places = new Map();
  const review = [];
  for (const name of names) {
    const {entity, review: flags} = resolved.get(name);
    places.set(entity.id, entity);
    if (flags) review.push({id: entity.id, name: entity.name, areas: flags});
  }
  for (const {areas} of review) for (const area of areas) if (geo.disputed.has(area.disputed)) places.set(area.disputed, {id: area.disputed, kind: 'disputed', name: area.name});
  return {subjectId: resolved.get(research.subject).id, places, review};
};

const boxOf = (entity) => entity.frame ?? entity.bbox;

/** One box around several places; places across the antimeridian can't be combined. */
const aroundBox = (ids, places) => {
  const boxes = ids.map((id) => boxOf(places.get(id)));
  if (boxes.some(([west, , east]) => west > east)) throw new Error('"around" can\'t combine a place that crosses the antimeridian; target it on its own');
  return [Math.min(...boxes.map((box) => box[0])), Math.min(...boxes.map((box) => box[1])), Math.max(...boxes.map((box) => box[2])), Math.max(...boxes.map((box) => box[3]))];
};

/**
 * Turn the model's shot (ids, {place}, {around}) into a geo-map primitive, or
 * throw with the reason. Checks places, approximate points and numbers.
 */
export const shotToPrimitive = (shot, {places, research}) => {
  if (!shot || typeof shot !== 'object') throw new Error('no shot');
  const allowed = [...places.keys()];
  const placeId = (id, where) => {
    if (typeof id !== 'string' || !places.has(id)) throw new Error(`${where}: "${id}" isn't one of the episode's places (${allowed.join(', ')})`);
    if (id.startsWith('disputed:') && !where.startsWith('highlights')) throw new Error(`${where}: a disputed area can only be highlighted; frame or label the country`);
    return id;
  };
  const point = (ref, where) => {
    const place = research.places[ref.place];
    if (!place) throw new Error(`${where}: no named point "${ref.place}" in the research (${Object.keys(research.places).join(', ') || 'none'})`);
    return place;
  };
  const anchor = (ref, where) => {
    if (ref && typeof ref === 'object' && 'place' in ref) {
      const place = point(ref, where);
      return {lon: place.lon, lat: place.lat};
    }
    return placeId(ref, where);
  };
  const camera = (Array.isArray(shot.camera) ? shot.camera : []).map((key, index) => {
    const where = `camera[${index}]`;
    const {target} = key ?? {};
    let resolved;
    if (target === 'world') resolved = 'world';
    else if (target && typeof target === 'object' && Array.isArray(target.around)) resolved = {bbox: aroundBox(target.around.map((id, at) => placeId(id, `${where}.around[${at}]`)), places)};
    else if (target && typeof target === 'object' && 'place' in target) {
      const {lon, lat} = point(target, where);
      resolved = {bbox: [lon - POINT_SPAN[0] / 2, lat - POINT_SPAN[1] / 2, lon + POINT_SPAN[0] / 2, lat + POINT_SPAN[1] / 2].map((value) => Math.round(value * 1000) / 1000)};
    } else resolved = placeId(target, where);
    return {...key, target: resolved};
  });
  const highlights = (Array.isArray(shot.highlights) ? shot.highlights : []).map((highlight, index) => ({...highlight, entity: placeId(highlight?.entity, `highlights[${index}]`)}));
  const numbers = geoResearchNumbers(research);
  const annotations = (Array.isArray(shot.annotations) ? shot.annotations : []).map((annotation, index) => {
    const where = `annotations[${index}]`;
    if (annotation?.type === 'arrow') return {...annotation, from: anchor(annotation.from, `${where}.from`), to: anchor(annotation.to, `${where}.to`)};
    const ref = annotation?.anchor;
    if (ref && typeof ref === 'object' && research.places[ref.place]?.approximate && !APPROXIMATE.test(annotation.text ?? '')) {
      throw new Error(`${where}: "${ref.place}" is an approximate point, so its text must say so (e.g. "${String(annotation.text ?? '').slice(0, 18)} (APPROX.)")`);
    }
    for (const number of textNumbers(annotation?.text ?? '')) {
      if (!numbers.has(number)) throw new Error(`${where}: "${annotation.text}" states ${number}, which is not in the research`);
    }
    return {...annotation, anchor: anchor(ref, where)};
  });
  const parsed = primitiveSchema.safeParse({kind: 'geo-map', camera, highlights, annotations});
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'shot'}: ${issue.message}`).join('; '));
  return parsed.data;
};

/** The shot a scene gets when the model gives none, or an invalid one: the subject, filled and named. */
export const defaultShot = (subject) => primitiveSchema.parse({
  kind: 'geo-map',
  camera: [{target: subject.id, at: 0}],
  highlights: [{entity: subject.id, style: 'fill', at: .15}],
  annotations: [{type: 'label', anchor: subject.id, text: subject.name.toUpperCase().slice(0, 28), at: .4}],
});

export const buildGeoDirectorPrompt = ({draft, research, places}) => ({
  system: `You are the map director of ${draft.show?.name ?? 'a geography series'}, vertical short videos told with animated maps. Give EVERY scene one map shot that shows what its narration says.

A shot is JSON:
{"id": "<scene id>",
 "camera": [{"target": T, "at": 0, "padding": 0.15}, ...],   // 1-4 keyframes; at = fraction of the scene, first at 0, then increasing
 "highlights": [{"entity": "<place id>", "style": "fill" | "outline" | "trace", "at": 0.3}],   // up to 4
 "annotations": [{"type": "label" | "marker", "anchor": A, "text": "SHORT CAPS", "at": 0.5},
                 {"type": "arrow", "from": A, "to": A, "at": 0.7}],   // up to 4
 "why": "one sentence"}

T (camera target) is "world", a place id, {"around": ["<place id>", ...]} to frame several places together, or {"place": "<point key>"} to frame a named point closely.
A (anchor) is a place id or {"place": "<point key>"}.

Rules:
- Use only the place ids and point keys listed below. Never write coordinates or boxes.
- A point marked APPROXIMATE must be labelled as approximate in its text (e.g. "DIG SITES (APPROX.)").
- Text is at most 28 characters. Every number in a text must appear in the research claims.
- A good sequence moves: open wide (the world or a region), then push in; vary framings between scenes; reveal with a trace or fill; keep labels to what the narration names.
- Disputed areas can be highlighted (outline) when the narration is about them; never frame them alone.

Reply with a JSON object only: {"scenes": [<shot>, ...]}`,
  messages: [{role: 'user', content: `Places (id: name, kind):\n${[...places.values()].map((place) => `- ${place.id}: ${place.name}, ${place.kind}`).join('\n')}\n\nNamed points:\n${Object.entries(research.places).map(([key, place]) => `- ${key}${place.approximate ? ' (APPROXIMATE)' : ''}${place.note ? `: ${place.note}` : ''}`).join('\n') || '- none'}\n\nResearch claims:\n${research.claims.map((claim) => `- ${claim.text}`).join('\n')}\n\nScenes:\n${JSON.stringify(draft.scenes.map((scene) => ({id: scene.id, headline: scene.headline, narration: scene.narration, caption: scene.caption})), null, 2)}`}],
});

/**
 * Direct the maps of a geography draft. Every scene gets a geo-map: the
 * model's shot when it passes every check, otherwise the subject's default
 * map (listed in `fallbacks`). Without a model every scene gets the default.
 * Returns the directed draft, its manifest and the places needing a borders
 * review before publishing.
 */
export const directGeoVisuals = async ({draft, research: rawResearch, complete, showId = draft.show?.id ?? 'geographica', geo = loadGeoData()}) => {
  const research = geoResearchSchema.parse(rawResearch);
  const {subjectId, places, review} = resolveResearchPlaces(research, geo);
  const subject = places.get(subjectId);
  const shots = new Map();
  const assigned = [];
  const fallbacks = [];
  let modelError;
  if (complete) {
    try {
      const reply = parseJsonReply(await complete(buildGeoDirectorPrompt({draft, research, places})));
      const items = Array.isArray(reply) ? reply : Array.isArray(reply?.scenes) ? reply.scenes : [];
      for (const item of items) {
        const id = typeof item?.id === 'string' ? item.id : '?';
        if (!draft.scenes.some((scene) => scene.id === id)) { fallbacks.push({id, reason: 'no such scene'}); continue; }
        if (shots.has(id)) continue;
        try {
          const primitive = shotToPrimitive(item, {places, research});
          const problems = geoProblems(primitive, geo);
          if (problems.length) throw new Error(problems.join('; '));
          shots.set(id, primitive);
          assigned.push({id, why: typeof item.why === 'string' ? item.why : ''});
        } catch (error) {
          fallbacks.push({id, reason: error instanceof Error ? error.message : String(error)});
        }
      }
    } catch (error) {
      modelError = error instanceof Error ? error.message : String(error);
    }
  }
  for (const scene of draft.scenes) {
    if (!shots.has(scene.id)) {
      if (!fallbacks.some((item) => item.id === scene.id)) fallbacks.push({id: scene.id, reason: complete ? 'the model gave no shot' : 'no model'});
      shots.set(scene.id, defaultShot(subject));
    }
  }
  const directed = {
    ...draft,
    subject: {...draft.subject, attributes: {...draft.subject.attributes, geoEntity: subjectId}},
    scenes: draft.scenes.map((scene) => ({...scene, primitive: shots.get(scene.id)})),
  };
  const {manifest} = compileEpisode(directed, {showId, geo});
  return {draft: directed, manifest, assigned, fallbacks, review, ...(modelError ? {modelError} : {})};
};
