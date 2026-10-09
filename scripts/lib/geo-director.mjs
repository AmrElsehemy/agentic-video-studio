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
import {mapDirectionProblems, mapVariety} from './map-variety.mjs';
import {reconstruction, rotatePoint} from './plates.mjs';
import {kmToDegrees} from './geodesy.mjs';
import {styleGuideSection} from './shows.mjs';

/** Degrees framed around a named point when the camera targets it. */
export const POINT_SPAN = [2, 1.5];
/** Words that tell the viewer a point is approximate. */
const APPROXIMATE = /\b(APPROX\.?|APPROXIMATE|AREA|NEAR|AROUND|ABOUT)\b|~/i;

/** Numbers in on-screen text ("8,000", "6000–5800 BC" → 8000, 6000, 5800). */
export const textNumbers = (text) => [...String(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) => Number(match[0].replace(/,/g, '')));

const NUMBER_WORDS = {one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12};
/** Small numbers a claim spells out ("ten countries" states 10). */
const wordNumbers = (text) => [...String(text).toLowerCase().matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g)].map((match) => NUMBER_WORDS[match[1]]);

/** A figure and the whole number it rounds to: narration rounds ("14 kilometres" for 14.2), and rounding a stated figure is honest. */
const withRounded = (value) => (Number.isInteger(value) ? [value] : [value, Math.round(value)]);

/** Every number the research states: in its claims (digits or small number words, and what each rounds to), and its datasets' values (#91). */
export const geoResearchNumbers = (research) => new Set([
  ...research.claims.flatMap((claim) => [...textNumbers(claim.text), ...wordNumbers(claim.text)].flatMap(withRounded)),
  ...Object.values(research.datasets ?? {}).flatMap((dataset) => Object.values(dataset.values)),
]);

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
  // Datasets (#91) name their places too; each value is keyed to a map id.
  const datasets = new Map();
  for (const [key, dataset] of Object.entries(research.datasets ?? {})) {
    const names = Object.keys(dataset.values);
    const {resolved: found, problems: unresolved} = resolvePlaces(names, geo);
    if (unresolved.length) throw new Error(`${research.id}'s dataset "${key}" names places the map can't show:\n${unresolved.map((problem) => `- ${problem}`).join('\n')}`);
    datasets.set(key, {label: dataset.label, ...(dataset.unit ? {unit: dataset.unit} : {}), values: names.map((name) => ({entity: found.get(name).id, value: dataset.values[name]}))});
  }
  const subjectId = resolved.get(research.subject).id;
  return {subjectId, places: addNearbyPlaces(places, subjectId, geo), review, datasets};
};

const boxOf = (entity) => entity.frame ?? entity.bbox;

const significant = (value, digits) => (value === 0 ? 0 : Number(value.toPrecision(digits)));

/**
 * Comparison datasets from the pinned map data for the countries among `places` (the research's own
 * first): population, area and density, rounded so they read as the estimates they are (Natural
 * Earth's population and an area computed from its outlines). Needs two or more countries.
 */
export const builtinDatasets = (places) => {
  const countries = [...places.values()].filter((place) => place.kind === 'country' && place.population && place.areaKm2).slice(0, 6);
  if (countries.length < 2) return new Map();
  const make = (label, unit, measure) => ({label, unit, values: countries.map((country) => ({entity: country.id, value: measure(country)}))});
  return new Map([
    ['population', make('Population', 'PEOPLE', (country) => significant(country.population, 3))],
    ['area', make('Area', 'KM²', (country) => significant(country.areaKm2, 3))],
    ['density', make('People per km²', '/KM²', (country) => significant(country.population / country.areaKm2, 2))],
  ]);
};

/** Kinds a scene's text can name: anything on the map except disputed areas. */
const MENTIONABLE = new Set(['country', 'admin1', 'lake', 'river', 'city']);
/** Names that are also everyday words ("Back", "Beaver", "Mountain" are rivers): never taken from a sentence. */
const COMMON_WORDS = new Set(['back', 'beaver', 'mountain', 'copper', 'coco', 'black', 'white', 'blue', 'red', 'green', 'yellow', 'little', 'great', 'long', 'north', 'south', 'east', 'west']);
/** Phrases that contain a country's name without meaning the country ("New Guinea" is not Guinea). */
const NOT_PLACES = ['(?<!Papua )New Guinea'];
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The places a text names. A name must appear as written (capitalised, whole words), be at least
 * four letters and not an everyday word; a name that fits two places of the same specificity is
 * left out rather than guessed. Water bodies and disputed areas are not matched here.
 */
export const mentionedPlaces = (rawText, geo) => {
  // Names that are really a sea, a gulf or a phrase like "New Guinea" are blanked out first, so the country inside them is not mentioned.
  const masks = [...NOT_PLACES, ...[...geo.entities.values()].filter((entity) => entity.kind !== 'country' && !MENTIONABLE.has(entity.kind) && entity.name.length >= 8).map((entity) => `(?<![A-Za-z])${escapeRegex(entity.name)}`)];
  const text = masks.reduce((current, pattern) => current.replace(new RegExp(`${pattern}(?![A-Za-z])`, 'g'), (match) => ' '.repeat(match.length)), rawText);
  const groups = new Map();
  for (const entity of geo.entities.values()) {
    if (!MENTIONABLE.has(entity.kind) || entity.name.length < 4 || COMMON_WORDS.has(entity.name.toLowerCase())) continue;
    const key = entity.name;
    groups.set(key, [...(groups.get(key) ?? []), entity]);
  }
  const rank = {country: 0, admin1: 1, lake: 1, river: 1, city: 2};
  const matches = [];
  for (const [name, entities] of groups) {
    const match = new RegExp(`(?<![A-Za-z])${escapeRegex(name)}(?![A-Za-z])`).exec(text);
    if (!match) continue;
    const best = Math.min(...entities.map((entity) => rank[entity.kind]));
    const top = entities.filter((entity) => rank[entity.kind] === best);
    if (top.length === 1) matches.push({entity: top[0], start: match.index, end: match.index + name.length});
  }
  // A name inside a longer one ("Victoria" in "Lake Victoria", "Nile" in "White Nile") is not a mention of its own.
  return matches
    .filter((match, index) => !matches.some((other, at) => at !== index && other.start <= match.start && other.end >= match.end && other.end - other.start > match.end - match.start))
    .map((match) => match.entity);
};

/** Most of each kind of nearby place offered to the director besides the research's own. */
const NEARBY_LIMITS = {admin1: 25, lake: 5, river: 6, city: 10};

const centreOf = ([west, south, east, north]) => [west > east ? (west + east + 360) / 2 : (west + east) / 2, (south + north) / 2];
const inside = ([lon, lat], [west, south, east, north]) => lat >= south && lat <= north && (west <= east ? lon >= west && lon <= east : lon >= west || lon <= east);

/**
 * Add the rivers, lakes, states and cities around the episode's places, from the pinned map data, so
 * a draft about Egypt can show the Nile or Cairo without anyone listing them in the research. Which
 * ones: those centred inside the box around the subject and the research's countries and states,
 * the more important first (capitals and big cities, great lakes and rivers), a few of each kind.
 * States only when their country is one of the research's.
 */
export const addNearbyPlaces = (places, subjectId, geo) => {
  const added = new Map();
  // The land border between each pair of the episode's countries, from the pinned boundary lines (independent of the box below).
  const countryIds = [...places.values()].filter((place) => place.kind === 'country').map((place) => place.id.slice('country:'.length));
  for (let i = 0; i < countryIds.length; i++) {
    for (let j = i + 1; j < countryIds.length; j++) {
      const id = `border:${[countryIds[i], countryIds[j]].sort().join('-')}`;
      if (geo.entities.has(id) && !places.has(id)) added.set(id, geo.entities.get(id));
    }
  }
  const anchors = [...places.values()].filter((place) => place.bbox && (place.kind === 'country' || place.kind === 'admin1'));
  if (!anchors.length || anchors.some((place) => place.bbox[0] > place.bbox[2])) return new Map([...places, ...added]);
  const box = [Math.min(...anchors.map((p) => p.bbox[0])), Math.min(...anchors.map((p) => p.bbox[1])), Math.max(...anchors.map((p) => p.bbox[2])), Math.max(...anchors.map((p) => p.bbox[3]))];
  const countries = new Set(anchors.filter((place) => place.kind === 'country').map((place) => place.id.slice('country:'.length)));
  const importance = (entity) => (entity.kind === 'city' ? [entity.capital ? 0 : 1, -(entity.population ?? 0)] : [entity.rank ?? 9, 0]);
  for (const [kind, limit] of Object.entries(NEARBY_LIMITS)) {
    const found = [...geo.entities.values()]
      .filter((entity) => entity.kind === kind && !places.has(entity.id) && inside(centreOf(entity.bbox), box) && (kind !== 'admin1' || countries.has(entity.country)))
      .sort((a, b) => importance(a)[0] - importance(b)[0] || importance(a)[1] - importance(b)[1] || (a.name < b.name ? -1 : 1))
      .slice(0, limit);
    for (const entity of found) added.set(entity.id, entity);
  }
  return new Map([...places, ...added]);
};

/** How many times the director may ask the model to fix rejected or repetitive shots. */
const MAX_REPAIRS = 2;

/** Smallest box (degrees, about 50 km across) a camera frames: a tinier place (the Vatican) stays a speck, but its surroundings (the coast, the city) show. */
const MIN_FRAME = [0.6, 0.45];
/** A camera target for a place: its id, or a box at least MIN_FRAME across around its centre when the place is tinier than that. */
const frameTarget = (entity) => {
  if (entity.kind === 'city') {
    const [lon, lat] = entity.label;
    return {bbox: [lon - POINT_SPAN[0] / 2, lat - POINT_SPAN[1] / 2, lon + POINT_SPAN[0] / 2, lat + POINT_SPAN[1] / 2].map((value) => Math.round(value * 1000) / 1000)};
  }
  const [west, south, east, north] = boxOf(entity);
  if (west > east || (east - west >= MIN_FRAME[0] && north - south >= MIN_FRAME[1])) return entity.id;
  const [lon, lat] = [(west + east) / 2, (south + north) / 2];
  const [halfWidth, halfHeight] = [Math.max(east - west, MIN_FRAME[0]) / 2, Math.max(north - south, MIN_FRAME[1]) / 2];
  return {bbox: [lon - halfWidth, lat - halfHeight, lon + halfWidth, lat + halfHeight].map((value) => Math.round(value * 1000) / 1000)};
};

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
export const shotToPrimitive = (shot, {places, research, datasets = new Map()}) => {
  if (!shot || typeof shot !== 'object') throw new Error('no shot');
  const allowed = [...places.keys()];
  const placeId = (id, where) => {
    if (typeof id === 'string' && !places.has(id) && research.places[id]) throw new Error(`${where}: "${id}" is a named point, not a place id; only anchors and camera targets take points (write {"place": "${id}"} there)`);
    if (typeof id !== 'string' || !places.has(id)) throw new Error(`${where}: "${id}" isn't one of the episode's places (${allowed.join(', ')})`);
    if (where.startsWith('highlights') && places.get(id)?.kind === 'city') throw new Error(`${where}: "${id}" is a city, a point on the map; use it for a label, marker, arrow or camera, not a highlight`);
    if (id.startsWith('disputed:') && !where.startsWith('highlights')) throw new Error(`${where}: a disputed area can only be highlighted; frame or label the country`);
    return id;
  };
  const point = (ref, where) => {
    const place = research.places[ref.place];
    if (!place) throw new Error(`${where}: no named point "${ref.place}" in the research (${Object.keys(research.places).join(', ') || 'none'})`);
    return place;
  };
  // A bare string that is one of the research's named points ("port-said") means {"place": "port-said"}.
  const asPoint = (ref) => (typeof ref === 'string' && !places.has(ref) && research.places[ref] ? {place: ref} : ref);
  const anchor = (ref, where) => {
    ref = asPoint(ref);
    if (ref && typeof ref === 'object' && 'place' in ref) {
      const place = point(ref, where);
      return {lon: place.lon, lat: place.lat};
    }
    return placeId(ref, where);
  };
  const camera = (Array.isArray(shot.camera) ? shot.camera : []).map((key, index) => {
    const where = `camera[${index}]`;
    const target = asPoint(key?.target);
    let resolved;
    if (target === 'world') resolved = 'world';
    else if (target && typeof target === 'object' && Array.isArray(target.around)) resolved = {bbox: aroundBox(target.around.map((id, at) => placeId(id, `${where}.around[${at}]`)), places)};
    else if (target && typeof target === 'object' && 'place' in target) {
      const {lon, lat} = point(target, where);
      resolved = {bbox: [lon - POINT_SPAN[0] / 2, lat - POINT_SPAN[1] / 2, lon + POINT_SPAN[0] / 2, lat + POINT_SPAN[1] / 2].map((value) => Math.round(value * 1000) / 1000)};
    } else {
      resolved = placeId(target, where);
      if (!resolved.startsWith('disputed:')) resolved = frameTarget(places.get(resolved));
    }
    return {...key, target: resolved};
  });
  const highlights = (Array.isArray(shot.highlights) ? shot.highlights : []).map((highlight, index) => ({...highlight, entity: placeId(highlight?.entity, `highlights[${index}]`)}));
  // Every research number, and every value of a dataset the shot may show.
  const numbers = new Set([...geoResearchNumbers(research), ...[...datasets.values()].flatMap((dataset) => dataset.values.map(({value}) => value))]);
  const annotations = (Array.isArray(shot.annotations) ? shot.annotations : []).map((annotation, index) => {
    const where = `annotations[${index}]`;
    // Arrow text is drawn too, so every annotation's numbers are checked.
    // A line's own degrees are a fact of the line (the 0 of "0° prime meridian"), so its text may state them.
    const stated = annotation?.type === 'line' && typeof annotation.degrees === 'number' ? new Set([...numbers, Math.abs(annotation.degrees)])
      : annotation?.type === 'reconstruction' ? new Set([...numbers, annotation.from, annotation.to ?? 0])
        : numbers;
    for (const number of textNumbers(annotation?.text ?? '')) {
      if (!stated.has(number)) throw new Error(`${where}: "${annotation.text}" states ${number}, which is not in the research`);
    }
    if (annotation?.type === 'line') return annotation;
    if (annotation?.type === 'ring') {
      // The radius is a claim: it must be a number the research states.
      if (!numbers.has(annotation.radiusKm)) throw new Error(`${where}: the ring's radius ${annotation.radiusKm} km is not a number in the research`);
      return {...annotation, center: anchor(annotation.center, `${where}.center`)};
    }
    if (annotation?.type === 'truesize') return {...annotation, entity: placeId(annotation.entity, `${where}.entity`), onto: placeId(annotation.onto, `${where}.onto`)};
    if (annotation?.type === 'reconstruction') {
      const entities = (Array.isArray(annotation.entities) ? annotation.entities : []).map((id, at) => placeId(id, `${where}.entities[${at}]`));
      return {...annotation, entities, ...(annotation.fixed ? {fixed: placeId(annotation.fixed, `${where}.fixed`)} : {})};
    }
    if (annotation?.type === 'timeline') {
      // A timeline's words are claims too: every number in a step must be in the research.
      for (const step of Array.isArray(annotation.steps) ? annotation.steps : []) {
        for (const number of textNumbers(`${step?.label ?? ''} ${step?.detail ?? ''}`)) {
          if (!numbers.has(number)) throw new Error(`${where}: the step "${step.label}" states ${number}, which is not in the research`);
        }
      }
      return annotation;
    }
    if (annotation?.type === 'arrow') return {...annotation, from: anchor(annotation.from, `${where}.from`), to: anchor(annotation.to, `${where}.to`)};
    if (annotation?.type === 'route') {
      // A route runs only between places the map knows and the research's named points.
      if (!Array.isArray(annotation.path)) throw new Error(`${where}.path: a route needs a list of 2-6 stops`);
      const approximate = annotation.path.find((ref) => ref && typeof ref === 'object' && research.places[ref.place]?.approximate);
      if (approximate && annotation.text && !APPROXIMATE.test(annotation.text)) throw new Error(`${where}: the route passes the approximate point "${approximate.place}", so its text must say so`);
      return {...annotation, path: annotation.path.map((ref, at) => anchor(ref, `${where}.path[${at}]`))};
    }
    const ref = annotation?.anchor;
    if (ref && typeof ref === 'object' && research.places[ref.place]?.approximate && !APPROXIMATE.test(annotation.text ?? '')) {
      throw new Error(`${where}: "${ref.place}" is an approximate point, so its text must say so (e.g. "${String(annotation.text ?? '').slice(0, 18)} (APPROX.)")`);
    }
    return {...annotation, anchor: anchor(ref, where)};
  });
  // A data map takes its values from a research dataset, by key: the model never writes the numbers.
  let data;
  if (shot.data !== undefined && shot.data !== null) {
    const key = typeof shot.data === 'string' ? shot.data : shot.data?.dataset;
    const dataset = datasets.get(key);
    if (!dataset) throw new Error(`data: "${key}" isn't one of the research datasets (${[...datasets.keys()].join(', ') || 'none'})`);
    const view = typeof shot.data === 'object' && ['map', 'bars', 'both', 'bubbles'].includes(shot.data.view) ? shot.data.view : 'map';
    data = {...dataset, at: typeof shot.data === 'object' && typeof shot.data.at === 'number' ? shot.data.at : 0, view};
  }
  // A comparison is only valid in an equal-area projection; assembly sets the episode's, so judge the shot as if Albers.
  const comparing = annotations.some((annotation) => annotation.type === 'truesize');
  const parsed = primitiveSchema.safeParse({kind: 'geo-map', camera, highlights, annotations, ...(comparing ? {projection: 'albers'} : {}), ...(shot.cut === true ? {cut: true} : {}), ...(shot.globe === true ? {globe: true} : {}), ...(shot.relief === true ? {relief: true} : {}), ...(data ? {data} : {})});
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'shot'}: ${issue.message}`).join('; '));
  return parsed.data;
};

/** The order a scene's mentioned places are taken when it names more than the shot can show. */
const SHOW_ORDER = ['admin1', 'river', 'lake', 'city', 'country'];
/** Most mentioned places a scene is asked to show. */
const MAX_SHOWN = 4;

/** The places (of those offered) a scene's text names, the most specific first, at most MAX_SHOWN. */
export const sceneMentions = (scene, places, geo) => mentionedPlaces(`${scene.headline ?? ''}. ${scene.narration ?? ''}. ${scene.caption ?? ''}`, geo)
  .filter((entity) => places.has(entity.id))
  .sort((a, b) => SHOW_ORDER.indexOf(a.kind) - SHOW_ORDER.indexOf(b.kind))
  .slice(0, MAX_SHOWN);

/** Is `place` shown by the shot: highlighted, an anchor, in a data layer, or inside a camera framing other than the whole world? */
export const shotShows = (primitive, place, boxes) => {
  const id = place.id;
  if (primitive.highlights.some((highlight) => highlight.entity === id)) return true;
  if (primitive.annotations.some((annotation) => [annotation.anchor, annotation.from, annotation.to, annotation.center, ...(annotation.path ?? []), ...(annotation.entities ?? []), annotation.entity, annotation.onto].includes(id))) return true;
  if ((primitive.data?.values ?? []).some(({entity}) => entity === id)) return true;
  const centre = centreOf(place.bbox);
  return primitive.camera.some((key) => {
    if (key.target === 'world') return false;
    const box = typeof key.target === 'string' ? boxes.get(key.target) : key.target.bbox;
    return Boolean(box) && inside(centre, box);
  });
};

const overlaps = ([w1, s1, e1, n1], [w2, s2, e2, n2]) => s1 <= n2 && s2 <= n1 && w1 <= e2 && w2 <= e1;
const grow = ([west, south, east, north], share) => [west - (east - west) * share, south - (north - south) * share, east + (east - west) * share, north + (north - south) * share];

const WORLD_BOX = [-180, -60, 180, 80];

/** The camera's framing (a box) `t` of the way through the scene: the keyframes' boxes blended linearly (an approximation of the real flight). */
const frameAt = (keys, frames, t) => {
  const last = keys.length - 1;
  if (t <= keys[0].at) return frames[0];
  if (t >= keys[last].at) return frames[last];
  const next = keys.findIndex((key) => key.at >= t);
  const share = (t - keys[next - 1].at) / (keys[next].at - keys[next - 1].at);
  return frames[next - 1].map((value, index) => value + (frames[next][index] - value) * share);
};

/** How soon after a highlight or label starts the camera must have it in frame (a share of the scene). */
const FRAMED_BY = 0.15;

/**
 * The places a shot highlights or labels that its camera does not have in frame when they appear (a
 * little after): a highlight must overlap the camera's framing then, and a label's point must sit inside
 * it (with a little margin). Judged at the time each layer starts, not just at the end of the flight, so a
 * camera that only reaches India in the last frame doesn't excuse an arrow to India that appears at the
 * start. Boxes across the antimeridian are not judged.
 */
export const offFramePlaces = (primitive, places, boxes) => {
  const keys = primitive.camera;
  const frames = keys.map((key) => (key.target === 'world' ? WORLD_BOX : typeof key.target === 'string' ? boxes.get(key.target) : key.target.bbox));
  if (frames.some((frame) => !frame || frame[0] > frame[2])) return [];
  const missing = new Map();
  const seenAt = (at) => frameAt(keys, frames, Math.min(1, at + FRAMED_BY));
  for (const highlight of primitive.highlights) {
    const place = places.get(highlight.entity);
    if (place?.bbox && place.bbox[0] <= place.bbox[2] && !overlaps(place.bbox, seenAt(highlight.at ?? 0))) missing.set(place.id, place);
  }
  for (const annotation of primitive.annotations) {
    for (const id of [annotation.anchor, annotation.from, annotation.to, annotation.center, ...(annotation.path ?? [])]) {
      const place = typeof id === 'string' ? places.get(id) : undefined;
      if (!place?.bbox || place.bbox[0] > place.bbox[2]) continue;
      const point = place.label ?? centreOf(place.bbox);
      if (!inside(point, grow(seenAt(annotation.at ?? 0), 0.1))) missing.set(place.id, place);
    }
  }
  return [...missing.values()];
};

const nameOf = (id, places) => places.get(id)?.name ?? id;
const inBox = (place, box) => place?.bbox && place.bbox[0] <= place.bbox[2] && box[0] <= box[2] && overlaps(place.bbox, box);

/** A plain-language account of a shot, for a reviewer: what the camera frames, what is lit, drawn and written. */
export const describeShot = (primitive, places, boxes) => {
  const framing = primitive.camera.map((key) => {
    if (key.target === 'world') return 'the whole world';
    const box = typeof key.target === 'string' ? boxes.get(key.target) : key.target.bbox;
    const named = typeof key.target === 'string' ? nameOf(key.target, places) : [...places.values()].filter((place) => place.kind !== 'city' && inBox(place, box)).slice(0, 6).map((place) => place.name).join(', ');
    return `${named || 'an area'}${key.at ? ` (from ${Math.round(key.at * 100)}% of the scene)` : ''}`;
  });
  const parts = [`camera: ${framing.join(' → ')}${primitive.globe ? ' (on a globe)' : ''}`];
  if (primitive.highlights.length) parts.push(`lit: ${primitive.highlights.map((highlight) => `${nameOf(highlight.entity, places)} (${highlight.style})`).join(', ')}`);
  for (const annotation of primitive.annotations) {
    if (annotation.type === 'label' || annotation.type === 'marker') parts.push(`${annotation.type}: "${annotation.text ?? ''}" on ${nameOf(annotation.anchor?.place ?? annotation.anchor, places)}`);
    else if (annotation.type === 'arrow') parts.push(`arrow: ${typeof annotation.from === 'string' ? nameOf(annotation.from, places) : 'a point'} → ${typeof annotation.to === 'string' ? nameOf(annotation.to, places) : 'a point'}${annotation.text ? ` "${annotation.text}"` : ''}`);
    else if (annotation.type === 'route') parts.push(`route: ${annotation.path.map((stop) => (typeof stop === 'string' ? nameOf(stop, places) : 'a point')).join(' → ')}`);
    else if (annotation.type === 'line') parts.push(`${annotation.kind} line at ${annotation.degrees}°${annotation.text ? ` "${annotation.text}"` : ''}`);
    else if (annotation.type === 'ring') parts.push(`distance ring: ${annotation.radiusKm} km around ${typeof annotation.center === 'string' ? nameOf(annotation.center, places) : 'a point'}${annotation.text ? ` "${annotation.text}"` : ''}`);
    else if (annotation.type === 'truesize') parts.push(`true-size comparison: a copy of ${nameOf(annotation.entity, places)} slides onto ${nameOf(annotation.onto, places)} at its real size, with a note that it was moved and a dashed outline of its real position`);
    else if (annotation.type === 'reconstruction') parts.push(`reconstruction: ${annotation.entities.map((id) => nameOf(id, places)).join(', ')} drifting from ${annotation.from} million years ago to ${annotation.to ? `${annotation.to} million years ago` : 'today'}, with ${nameOf(annotation.fixed, places)} held still, an age counter and a dashed outline of the final position`);
    else if (annotation.type === 'timeline') parts.push(`timeline: ${annotation.steps.map((step, index) => `${index === annotation.active ? '[' : ''}${step.label}${index === annotation.active ? ']' : ''}`).join(' · ')}`);
  }
  if (primitive.data) parts.push(`data: ${primitive.data.label} as ${primitive.data.view ?? 'map'} for ${primitive.data.values.map(({entity}) => nameOf(entity, places)).join(', ')}`);
  return parts.join('; ');
};

/**
 * A second opinion on the shots: does each scene's picture show what its narration claims? Returns the
 * scenes it finds weak, each with the problem and a fix the shot options can make. A reviewer that fails
 * or answers badly changes nothing (an empty list).
 */
export const judgeShots = async ({complete, draft, shots, places, boxes}) => {
  try {
    const scenes = draft.scenes.filter((scene) => shots.has(scene.id)).map((scene) => ({id: scene.id, headline: scene.headline, narration: scene.narration, shot: describeShot(shots.get(scene.id), places, boxes)}));
    const reply = parseJsonReply(await complete({
      system: `You review the map shots of a short explainer video. For each scene decide whether the shot SHOWS what the narration claims. The viewer has only the picture and the words.

Flag a scene (ok: false) when, for example:
- the narration is about a line (a meridian, the equator, a border) or says "one line crosses ..." and no line is drawn;
- it compares sizes, populations or distances and nothing shows the comparison;
- it moves through time (dates, "then", "years ago") and nothing shows the sequence;
- it names a place, a river or a lake that is not lit, labelled or framed;
- the shot only lights up the subject and writes its name, when the narration says something more specific;
- the camera does the same zoom on the same thing as the scene before, with nothing new.

Do not flag a scene whose job is only to introduce or name a place, to ask the viewer a closing question, or whose shot already shows its claim. The fixes you suggest must be possible with these options: highlight (fill, outline, trace), label, marker, arrow, route, a line of longitude or latitude, a timeline strip, a data layer (map shading or ranked bars), a globe, and the camera framing. Reply with JSON only: {"scenes": [{"id": "<scene id>", "ok": true | false, "problem": "<one sentence>", "fix": "<one sentence>"}]}`,
      messages: [{role: 'user', content: `Episode: ${draft.title ?? ''}\n\n${JSON.stringify(scenes, null, 2)}`}],
    }));
    const items = Array.isArray(reply) ? reply : Array.isArray(reply?.scenes) ? reply.scenes : [];
    return items.filter((item) => item && item.ok === false && typeof item.id === 'string' && shots.has(item.id) && typeof item.problem === 'string')
      .map((item) => ({id: item.id, problem: item.problem, fix: typeof item.fix === 'string' ? item.fix : ''}));
  } catch {
    return [];
  }
};

/** The box a drifting place sweeps: its outline's box at the oldest age, a third of the way, and today. */
const journeyBox = (place, annotation, geo) => {
  const plates = geo.plates;
  const plate = plates?.entityPlates[place.id];
  const fixed = plates?.entityPlates[annotation.fixed ?? 'country:ZAF'];
  if (!plate || !fixed || !place.bbox || place.bbox[0] > place.bbox[2]) return null;
  const [west, south, east, north] = place.bbox;
  const corners = [[west, south], [east, south], [east, north], [west, north], [(west + east) / 2, (south + north) / 2]];
  const points = [...corners];
  for (const age of [annotation.from, annotation.from * 0.67, annotation.from * 0.33]) {
    const q = reconstruction(plates.table, plate, fixed, age);
    if (q) points.push(...corners.map((corner) => rotatePoint(q, corner)));
  }
  return [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))];
};

/** The box a true-size copy sweeps: where the place is, and a box of its size centred on where it lands. */
const slideBox = (place, target) => {
  if (!place?.bbox || !target?.bbox || place.bbox[0] > place.bbox[2]) return null;
  // A destination that crosses the antimeridian (the USA) is judged by its label point.
  const centre = target.label ?? (target.bbox[0] <= target.bbox[2] ? centreOf(target.bbox) : null);
  if (!centre) return null;
  const [west, south, east, north] = place.bbox;
  const [cx, cy] = centre;
  const [halfWidth, halfHeight] = [(east - west) / 2, (north - south) / 2];
  return [Math.min(west, cx - halfWidth), Math.min(south, cy - halfHeight), Math.max(east, cx + halfWidth), Math.max(north, cy + halfHeight)];
};

/** A drifting place must not also be highlighted, labelled or pointed at in the same scene (its present position is wrong while it moves). */
export const reconstructionConflicts = (primitive) => {
  const moving = new Set(primitive.annotations.flatMap((annotation) => (annotation.type === 'reconstruction' ? annotation.entities : annotation.type === 'truesize' ? [annotation.entity] : [])));
  if (!moving.size) return [];
  const used = new Set([
    ...primitive.highlights.map((highlight) => highlight.entity),
    ...primitive.annotations.flatMap((annotation) => [annotation.anchor, annotation.from, annotation.to, ...(annotation.path ?? [])]).filter((id) => typeof id === 'string'),
  ]);
  return [...moving].filter((id) => used.has(id));
};

/** The drifting places whose whole journey no camera framing holds (at least RIVER_FRAMED_SHARE of its box, in one framing). */
export const unframedJourneys = (primitive, places, boxes, geo) => {
  const frames = primitive.camera.map((key) => (key.target === 'world' ? 'world' : typeof key.target === 'string' ? boxes.get(key.target) : key.target.bbox));
  if (frames.includes('world') || frames.some((frame) => !frame || frame[0] > frame[2])) return [];
  return primitive.annotations.flatMap((annotation) => (annotation.type === 'reconstruction' ? annotation.entities.map((id) => ({id, annotation})) : annotation.type === 'truesize' ? [{id: annotation.entity, annotation}] : []))
    .filter(({id, annotation}) => {
      const place = places.get(id);
      const box = place && (annotation.type === 'truesize' ? slideBox(place, places.get(annotation.onto)) : journeyBox(place, annotation, geo));
      return box && area(box) > 0 && !frames.some((frame) => area(intersection(box, frame)) / area(box) >= RIVER_FRAMED_SHARE);
    })
    .map(({id}) => places.get(id));
};

/** Most labels and markers with text one scene may carry, and most on one place. */
const MAX_LABELS = 3;
const MAX_LABELS_PER_PLACE = 2;

/**
 * Text piled on a map: more than MAX_LABELS labels and markers in a scene, or more than
 * MAX_LABELS_PER_PLACE on one place (they print over each other and nobody can read them).
 * Returns what is wrong, as a sentence, or null.
 */
export const labelClutter = (primitive) => {
  const texts = primitive.annotations.filter((annotation) => (annotation.type === 'label' || annotation.type === 'marker') && annotation.text);
  const perPlace = new Map();
  for (const annotation of texts) {
    const key = typeof annotation.anchor === 'string' ? annotation.anchor : `${annotation.anchor.lon},${annotation.anchor.lat}`;
    perPlace.set(key, (perPlace.get(key) ?? 0) + 1);
  }
  const crowded = [...perPlace].filter(([, count]) => count > MAX_LABELS_PER_PLACE).map(([key]) => key);
  if (crowded.length) return `${crowded.length > 1 ? 'Places' : 'The place'} ${crowded.join(', ')} carr${crowded.length > 1 ? 'y' : 'ies'} more than ${MAX_LABELS_PER_PLACE} labels, which print over each other. Keep at most ${MAX_LABELS_PER_PLACE} per place.`;
  if (texts.length > MAX_LABELS) return `${texts.length} labels and markers is too many; keep at most ${MAX_LABELS} so they can be read.`;
  return null;
};

/** A traced river must have at least this share of its box inside one camera framing. */
const RIVER_FRAMED_SHARE = 0.6;
const area = ([west, south, east, north]) => Math.max(0, east - west) * Math.max(0, north - south);
const intersection = ([w1, s1, e1, n1], [w2, s2, e2, n2]) => [Math.max(w1, w2), Math.max(s1, s2), Math.min(e1, e2), Math.min(n1, n2)];

/**
 * The traced rivers whose course the camera never frames: a river draws on over its length, so some
 * framing must hold most of it (a camera parked on one spot shows a river as a short stub, or nothing).
 * A camera that starts on the whole world frames everything, and boxes across the antimeridian are not judged.
 */
export const unframedRivers = (primitive, places, boxes) => {
  const frames = primitive.camera.map((key) => (key.target === 'world' ? 'world' : typeof key.target === 'string' ? boxes.get(key.target) : key.target.bbox));
  if (frames.includes('world') || frames.some((frame) => !frame || frame[0] > frame[2])) return [];
  return primitive.highlights
    .map((highlight) => places.get(highlight.entity))
    .filter((place) => place?.kind === 'river' && place.bbox && area(place.bbox) > 0 && !frames.some((frame) => area(intersection(place.bbox, frame)) / area(place.bbox) >= RIVER_FRAMED_SHARE));
};

/**
 * The projection an episode's maps use, from where its subject sits: Mercator within 30 degrees of the
 * equator (it is fine there), a conic equal-area map from 30 to 75 degrees (the USA, Canada, Russia keep
 * their true size and shape), azimuthal beyond. One per episode, so the camera flows between scenes.
 */
export const chooseProjection = (place) => {
  const lat = Math.abs(place?.label?.[1] ?? (place?.bbox ? (place.bbox[1] + place.bbox[3]) / 2 : 0));
  return lat <= 30 ? 'mercator' : lat <= 75 ? 'albers' : 'azimuthal';
};

/** The box a distance ring covers: its centre plus its radius each way (wider in longitude away from the equator). */
const ringBox = (annotation, places) => {
  const centre = typeof annotation.center === 'string' ? (places.get(annotation.center)?.label ?? (places.get(annotation.center)?.bbox ? centreOf(places.get(annotation.center).bbox) : null)) : [annotation.center.lon, annotation.center.lat];
  if (!centre) return null;
  const half = kmToDegrees(annotation.radiusKm);
  const wide = half / Math.max(0.2, Math.cos((centre[1] * Math.PI) / 180));
  return [centre[0] - wide, centre[1] - half, centre[0] + wide, centre[1] + half];
};

/** The distance rings the camera never frames whole (at least RIVER_FRAMED_SHARE of the ring's box in one framing). */
export const unframedRings = (primitive, places, boxes) => {
  const frames = primitive.camera.map((key) => (key.target === 'world' ? 'world' : typeof key.target === 'string' ? boxes.get(key.target) : key.target.bbox));
  if (frames.includes('world') || frames.some((frame) => !frame || frame[0] > frame[2])) return [];
  return primitive.annotations.filter((annotation) => annotation.type === 'ring').filter((annotation) => {
    const box = ringBox(annotation, places);
    return box && area(box) > 0 && !frames.some((frame) => area(intersection(box, frame)) / area(box) >= RIVER_FRAMED_SHARE);
  });
};

/** The shot a scene gets when the model gives none, or an invalid one: the subject, filled and named. */
export const defaultShot = (subject) => primitiveSchema.parse({
  kind: 'geo-map',
  camera: [{target: frameTarget(subject), at: 0}],
  // A city is a point (no outline to light); a river is a line (it can only be traced).
  highlights: subject.kind === 'city' ? [] : [{entity: subject.id, style: subject.kind === 'river' ? 'trace' : 'fill', at: .15}],
  annotations: [{type: subject.kind === 'city' ? 'marker' : 'label', anchor: subject.id, text: subject.name.toUpperCase().slice(0, 28), at: .4}],
});

export const buildGeoDirectorPrompt = ({draft, research, places, datasets, mentions = new Map(), showId = draft.show?.id ?? 'geographica'}) => ({
  system: `You are the map director of ${draft.show?.name ?? 'a geography series'}, vertical short videos told with animated maps. Give EVERY scene one map shot that shows what its narration says.

A shot is JSON:
{"id": "<scene id>",
 "camera": [{"target": T, "at": 0, "padding": 0.15}, ...],   // 1-4 keyframes; at = fraction of the scene, first at 0, then increasing
 "highlights": [{"entity": "<place id>", "style": "fill" | "outline" | "trace", "at": 0.3}],   // up to 4
 "annotations": [{"type": "label" | "marker", "anchor": A, "text": "SHORT CAPS", "at": 0.5, "until": 0.9},
                 {"type": "ring", "center": A, "radiusKm": 14, "text": "14 KM", "at": 0.3},
                 {"type": "truesize", "entity": "<place id>", "onto": "<place id>", "at": 0.2, "until": 0.6},
                 {"type": "reconstruction", "entities": ["country:MDG"], "fixed": "country:ZAF", "from": 180, "to": 0, "at": 0.1, "until": 0.9},
                 {"type": "timeline", "steps": [{"label": "180 MYA", "detail": "AFRICA"}, ...], "active": 0, "at": 0.3},
                 {"type": "line", "kind": "meridian" | "parallel", "degrees": 0, "text": "0° PRIME MERIDIAN", "at": 0.2},   // until is optional: when it fades out
                 {"type": "arrow", "from": A, "to": A, "at": 0.7},
                 {"type": "route", "path": [A, A, ...], "text": "SHORT CAPS", "at": 0.2, "until": 0.8, "follow": false}],   // up to 4 in all
 "globe": false,   // optional: draw the map on a spinning globe
 "relief": false,   // optional: shaded relief for terrain and altitude
 "data": {"dataset": "<dataset key>", "at": 0.3, "view": "map" | "bars" | "both" | "bubbles"},   // optional: show a dataset: shade the places (map), a ranked bar chart (bars), both, or sized circles on the places (bubbles)
 "why": "one sentence"}

T (camera target) is "world", a place id, {"around": ["<place id>", ...]} to frame several places together, or {"place": "<point key>"} to frame a named point closely.
A (anchor) is a place id or {"place": "<point key>"}.

Rules:
- Use only the place ids and point keys listed below. Never write coordinates or boxes.
- A point marked APPROXIMATE must be labelled as approximate in its text (e.g. "DIG SITES (APPROX.)").
- Text is at most 28 characters. Every number in a text must appear in the research claims.
- A good sequence moves: open wide (the world or a region), then push in; vary framings between scenes; reveal with a trace or fill; keep labels to what the narration names.
- Disputed areas can be highlighted (outline) when the narration is about them; never frame them alone.
- Places also include rivers, lakes, states and cities near the episode's subject. A river highlight always draws its course (use "trace"); a lake or state can be filled or outlined like a country; a city is a point: use it for a label, marker, arrow or camera, never a highlight. Prefer a real river, lake, state or city over a vague label when the narration names it or it makes the map clearer.
- "globe": true draws the map on a globe that spins between the camera framings: a dramatic opening or closing. Use it on the first scene (a planet turning to the place) and, if it suits, the last; never in between, because the map changes from globe to flat map with a cut.
- "relief": true adds shaded relief (mountains and valleys) under the map. Use it when the narration is about terrain or altitude: mountains, highlands, plateaus, valleys.
- "data" shows one of the datasets listed below. Use it when the narration compares places by a number (heights, sizes, populations, how crowded or empty a place is). Name the dataset only; its values come from the research or the map data. "view": "map" shades the places with a legend; "bars" shows a ranked bar chart of them beside the map (the clearest way to compare sizes or populations: use it at least once in an episode that compares places); "both" does both; "bubbles" puts a circle on each place, its area in proportion to its value, right on the map (good when the places are spread out and you want the comparison to sit on the geography; the bars are better for a ranked list). Frame the places the dataset covers.
- A "ring" draws a true circle of "radiusKm" around "center" (a place id or a named point), growing out from the centre, with its text on the ring's east edge. Use it when the narration is about a DISTANCE from a place: "within 14 kilometres", "400 kilometres of water", "farthest from the sea", or two shores a short way apart (a ring from one shore that reaches the other shows how close they are). The radius must be a number the research states (it is checked); the text may say it. Frame the whole ring. At most two rings in a scene.
- A "truesize" copies the place "entity" (a country, state or lake) and slides the copy onto the place "onto" (a country, state, lake or city), rotated on the sphere so its size and shape stay exactly true, to show how big one place is against another. Use it when the narration compares AREA: "as big as", "larger than", "twice the size of", "would cover", "fits inside". The map says the copy was moved and shows where the place really is as a dashed outline. It always uses an equal-area projection (the system sets it). Frame both where the place really is and where it lands, and do not also highlight, label or point at the place that is moving: its home position is wrong while it slides. Use it at most once or twice an episode, on the scenes that are about size.
- A "reconstruction" shows how a landmass moved: the places in "entities" (one or two) are drawn where a published plate-motion model puts them "from" millions of years ago and drift to where they are "to" (default 0, today), while the place in "fixed" (default country:ZAF, Africa) stays still; an age counter runs on the map and a dashed outline marks where each ends up. Use it whenever the narration says a place split, broke away, drifted, collided or opened: Madagascar leaving Africa, India crossing the ocean, the Atlantic opening. The ages must come from the research (numbers in the text). It works for countries on these plates: Africa, Madagascar, India, Antarctica, Australia, South America, North America (US, Canada), Greenland, Arabia, Europe. Frame the whole journey (where it starts and where it ends) and do not also highlight, label or point at a place that is drifting: its present position is wrong while it moves. A scene can have one reconstruction.
- A "timeline" shows a strip of 2-4 dated steps along the bottom, with the scene's own step lit ("active", counting from 0). Use it when the story moves through time: a split, a purchase, a construction, a reform. Labels are at most 14 characters and come from the research (every number must be in a claim). Give every scene of the sequence the SAME steps, so the strip reads as one timeline, and light the step the scene is on.
- A border between two countries (border:AAA-BBB, the two codes in alphabetical order, such as border:CAN-USA) is listed among the places when both countries are in the episode: highlight it with the style "trace" and the actual border line draws itself along its whole length. Use it whenever the narration is about a border, a frontier or two countries meeting: the line is the picture. Frame the whole border.
- A "line" draws a line of longitude ("meridian") or latitude ("parallel") from the map's grid: use it whenever the story is about one, such as the prime meridian (meridian, 0), the equator (parallel, 0), the tropics (parallel, 23.4 or -23.4), the date line (meridian, 180) or any parallel or meridian the narration names. It draws itself across the map (a meridian from north to south, a parallel from west to east; "reverse": true flips that) and its text sits where it crosses the middle of the frame. Draw the line FIRST, then light up the places it crosses in the order the narration names them. A story about a line must show the line.
- A route (2-6 stops) draws a journey, trade road, migration or voyage along the shortest path across the globe, with a marker moving along it from "at" to "until". Use it only when the narration describes movement. Frame the whole route in the camera, or set "follow": true to have the camera ride along with the marker (then "until" must be at most 0.85).
- Labels stay inside the frame, and where two overlap the older one fades. Give a label or marker an "until" when the camera will pull out and crowd it.
- Every scene must look different from the one before it: change the framing, what is highlighted, or add a layer (data, relief, route, an arrow between two places). Never give two consecutive scenes the same camera and the same highlight. When the narration states a size, a count or a comparison, show it: frame the places being compared together and label each one, or shade them with a dataset.
- A scene's "names" are places its text mentions. Show every one of them in that scene's shot: highlight it, label it, point an arrow at it, or frame it with the camera.
- A river's pieces carry its name (the Nile's pieces are the Nile, the White Nile, the Blue Nile, the Victoria Nile, the Albert Nile; the main "Nile" feature is only the northern stretch). When the narration is about the whole river, trace every piece listed.
- When a scene traces a river, hold a camera framing on the river's own id for part of the scene so its whole course is visible as it draws; never leave the camera parked on one spot while a long river draws.
- Keep text sparse: at most 3 labels and markers in a scene, and at most 2 on the same place. Text that overlaps is unreadable, so prefer one clear label plus the picture to four small ones.
- Show what the narration is about while it is being said: the place a scene discusses is highlighted by 0.35 of the scene at the latest, and the camera is already on it (or on the places it is compared with). Open on "world" at most twice in the episode (the first scene and, if it helps, the last), never for a scene whose subject is a single place.
- Consecutive scenes are one continuous flight: each scene's camera starts where the previous one ended and flies to its first target. Plan the episode as one journey. Add "cut": true only when the story jumps somewhere unrelated.

Reply with a JSON object only: {"scenes": [<shot>, ...]}${styleGuideSection(showId)}`,
  messages: [{role: 'user', content: `Episode: ${draft.title ?? ''}${draft.premise ? `\nPremise: ${draft.premise}` : ''}\n\n${datasets?.size ? `Datasets (key: label, places):\n${[...datasets.entries()].map(([key, dataset]) => `- ${key}: ${dataset.label}${dataset.unit ? ` (${dataset.unit})` : ''}, ${dataset.values.map(({entity}) => entity).join(', ')}`).join('\n')}\n\n` : ''}Places (id: name, kind):\n${[...places.values()].map((place) => `- ${place.id}: ${place.name}, ${place.kind}`).join('\n')}\n\nNamed points:\n${Object.entries(research.places).map(([key, place]) => `- ${key}${place.approximate ? ' (APPROXIMATE)' : ''}${place.note ? `: ${place.note}` : ''}`).join('\n') || '- none'}\n\nResearch claims:\n${research.claims.map((claim) => `- ${claim.text}`).join('\n')}\n\nScenes:\n${JSON.stringify(draft.scenes.map((scene) => ({id: scene.id, headline: scene.headline, narration: scene.narration, caption: scene.caption, ...(mentions.get(scene.id)?.length ? {names: mentions.get(scene.id).map((place) => `${place.name} (${place.id})`)} : {})})), null, 2)}`}],
});

/**
 * Direct the maps of a geography draft. Every scene gets a geo-map: the
 * model's shot when it passes every check, otherwise the subject's default
 * map (listed in `fallbacks`). Without a model every scene gets the default.
 * Returns the directed draft, its manifest and the places needing a borders
 * review before publishing.
 */
/**
 * `shotProblems(primitive)` may add checks the renderer knows (a camera that would collapse); the CLI
 * passes the renderer's own. A shot it flags is rejected with its reasons, so the repair round can fix it.
 */
export const directGeoVisuals = async ({draft, research: rawResearch, complete, showId = draft.show?.id ?? 'geographica', geo = loadGeoData(), shotProblems = () => []}) => {
  const research = geoResearchSchema.parse(rawResearch);
  const resolvedResearch = resolveResearchPlaces(research, geo);
  const {subjectId, review} = resolvedResearch;
  // Offer every place the scenes (or the research claims) name, besides the research's own and the nearby ones.
  const allText = [...draft.scenes.map((scene) => `${scene.headline ?? ''}. ${scene.narration ?? ''}. ${scene.caption ?? ''}`), ...research.claims.map((claim) => claim.text)].join('\n');
  const places = new Map([...resolvedResearch.places, ...mentionedPlaces(allText, geo).filter((entity) => !resolvedResearch.places.has(entity.id)).map((entity) => [entity.id, entity])]);
  const subject = places.get(subjectId);
  // Research datasets win over a built-in one with the same key.
  const datasets = new Map([...builtinDatasets(places), ...resolvedResearch.datasets]);
  const mentions = new Map(draft.scenes.map((scene) => [scene.id, sceneMentions(scene, places, geo)]));
  const boxes = new Map([...places].map(([id, place]) => [id, boxOf(place)]));
  /** Mentioned places a scene's shot doesn't show, as the repair feedback words them. */
  const unshown = (id, primitive) => (mentions.get(id) ?? []).filter((place) => !shotShows(primitive, place, boxes));
  const cutOff = (primitive) => offFramePlaces(primitive, places, boxes);
  const unframed = (primitive) => unframedRivers(primitive, places, boxes);
  const journeys = (primitive) => unframedJourneys(primitive, places, boxes, geo);
  const rings = (primitive) => unframedRings(primitive, places, boxes);
  let shots = new Map();
  let whys = new Map();
  let fallbacks = [];
  let modelError;

  /** The valid shots in a model reply (the first one per scene), and the reasons the others were rejected. */
  const read = (replyText) => {
    const reply = parseJsonReply(replyText);
    const items = Array.isArray(reply) ? reply : Array.isArray(reply?.scenes) ? reply.scenes : [];
    const valid = new Map();
    const reasons = [];
    for (const item of items) {
      const id = typeof item?.id === 'string' ? item.id : '?';
      if (!draft.scenes.some((scene) => scene.id === id)) { reasons.push({id, reason: 'no such scene'}); continue; }
      if (valid.has(id)) continue;
      try {
        const primitive = shotToPrimitive(item, {places, research, datasets});
        const problems = [...geoProblems(primitive, geo), ...shotProblems(primitive)];
        if (problems.length) throw new Error(problems.join('; '));
        valid.set(id, {primitive, why: typeof item.why === 'string' ? item.why : ''});
      } catch (error) {
        reasons.push({id, reason: error instanceof Error ? error.message : String(error)});
      }
    }
    return {valid, reasons};
  };
  const adopt = (valid) => {
    shots = new Map([...valid].map(([id, {primitive}]) => [id, primitive]));
    whys = new Map([...valid].map(([id, {why}]) => [id, why]));
  };
  /** The shots so far in scene order, the default map standing in for scenes that have none. */
  const sequence = () => ({scenes: draft.scenes.map((scene) => ({id: scene.id, primitive: shots.get(scene.id) ?? defaultShot(subject)}))});

  if (complete) {
    try {
      const prompt = buildGeoDirectorPrompt({draft, research, places, datasets, mentions, showId});
      const first = await complete(prompt);
      const firstRead = read(first);
      adopt(firstRead.valid);
      fallbacks = firstRead.reasons;
      // Up to MAX_REPAIRS repair rounds: the model sees which shots were rejected, and whether the map
      // barely changes. Per scene the repaired shot wins when it is valid; otherwise the earlier shot stays.
      let transcript = [...prompt.messages, {role: 'assistant', content: first}];
      let weak = [];
      let latest = firstRead;
      for (let round = 0; round < MAX_REPAIRS; round++) {
        const missing = draft.scenes.map((scene) => scene.id).filter((id) => !shots.has(id));
        const variety = [...mapVariety(sequence()).problems, ...mapDirectionProblems(sequence())];
        const unseen = draft.scenes.filter((scene) => shots.has(scene.id)).map((scene) => ({id: scene.id, places: unshown(scene.id, shots.get(scene.id))})).filter((item) => item.places.length);
        const outside = draft.scenes.filter((scene) => shots.has(scene.id)).map((scene) => ({id: scene.id, places: cutOff(shots.get(scene.id))})).filter((item) => item.places.length);
        const clutter = draft.scenes.filter((scene) => shots.has(scene.id)).map((scene) => ({id: scene.id, problem: labelClutter(shots.get(scene.id))})).filter((item) => item.problem);
        const stubs = draft.scenes.filter((scene) => shots.has(scene.id)).map((scene) => ({id: scene.id, places: unframed(shots.get(scene.id))})).filter((item) => item.places.length);
        // The rule checks first; once the shots are clean by the rules, a reviewer asks whether they show what is claimed.
        const drifting = draft.scenes.filter((scene) => shots.has(scene.id)).map((scene) => ({id: scene.id, conflicts: reconstructionConflicts(shots.get(scene.id)).map((id) => nameOf(id, places)), unframed: journeys(shots.get(scene.id)).map((place) => place.name), rings: rings(shots.get(scene.id)).map((ring) => `${ring.radiusKm} km`)})).filter((item) => item.conflicts.length || item.unframed.length || item.rings.length);
        const rulesClean = !missing.length && !variety.length && !unseen.length && !outside.length && !stubs.length && !clutter.length && !drifting.length;
        weak = rulesClean || round === 0 ? await judgeShots({complete, draft, shots, places, boxes}) : weak;
        if (rulesClean && !weak.length) break;
        const notes = [
          ...fallbacks.map(({id, reason}) => `- Scene "${id}" was rejected: ${reason}`),
          ...missing.filter((id) => !fallbacks.some((item) => item.id === id)).map((id) => `- Scene "${id}" had no shot.`),
          ...unseen.map(({id, places: names}) => `- Scene "${id}" names ${names.map((place) => `${place.name} (${place.id})`).join(', ')} but its shot doesn't show ${names.length > 1 ? 'them' : 'it'}: highlight, label, anchor or frame ${names.length > 1 ? 'each' : 'it'}.`),
          ...outside.map(({id, places: names}) => `- Scene "${id}" highlights or labels ${names.map((place) => `${place.name} (${place.id})`).join(', ')} but its camera never frames ${names.length > 1 ? 'them' : 'it'}, so ${names.length > 1 ? 'they are' : 'it is'} cut off. Frame ${names.length > 1 ? 'them' : 'it'} too: target {"around": [<ids>]} with the subject, or drop the ${names.length > 1 ? 'highlights and labels' : 'highlight or label'}.`),
          ...drifting.flatMap(({id, conflicts, unframed: lost, rings: cut}) => [
            ...(cut.length ? [`- Scene "${id}" draws a ${cut.join(', ')} ring but its camera never frames the whole ring; frame wide enough to hold it (target {"around": [...]} or a bigger area).`] : []),
            ...(conflicts.length ? [`- Scene "${id}" highlights, labels or points at ${conflicts.join(', ')} while a reconstruction moves it; remove those, the reconstruction already draws it.`] : []),
            ...(lost.length ? [`- Scene "${id}" reconstructs ${lost.join(', ')} but its camera never frames the whole journey from the oldest position to today; use a framing (target {"around": [...]} or a box) that holds both.`] : []),
          ]),
          ...clutter.map(({id, problem}) => `- Scene "${id}": ${problem}`),
          ...weak.map(({id, problem, fix}) => `- Scene "${id}" is weak as a picture: ${problem}${fix ? ` ${fix}` : ''}`),
          ...stubs.map(({id, places: rivers}) => `- Scene "${id}" traces ${rivers.map((place) => `${place.name} (${place.id})`).join(', ')} but its camera never frames most of ${rivers.length > 1 ? 'their courses' : 'its course'}, so the river shows as a stub. Give a camera keyframe a target of the river's own id (or {"around": [...]} several) so its whole length is in view, then move on to the part the narration is about.`),
          ...variety.map((problem) => `- ${problem}`),
        ];
        const feedback = `Fix these and reply with the complete {"scenes": [...] } again, one valid shot per scene. Keep the shots that were fine, but change framing, highlights or layers where scenes repeat.\n${notes.join('\n')}`;
        transcript = [...transcript, {role: 'user', content: feedback}];
        const reply = await complete({...prompt, messages: transcript});
        transcript = [...transcript, {role: 'assistant', content: reply}];
        latest = read(reply);
        const merged = new Map();
        for (const scene of draft.scenes) {
          const earlier = shots.has(scene.id) ? {primitive: shots.get(scene.id), why: whys.get(scene.id)} : undefined;
          const pick = latest.valid.get(scene.id) ?? earlier;
          if (pick) merged.set(scene.id, pick);
        }
        adopt(merged);
        fallbacks = latest.reasons.filter(({id}) => !shots.has(id));
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
  const assigned = draft.scenes.filter((scene) => whys.has(scene.id)).map((scene) => ({id: scene.id, why: whys.get(scene.id)}));
  // A globe is for the first and last scene only; where the projection changes between scenes, the map cuts.
  const order = draft.scenes.map((scene) => scene.id);
  for (const [id, shot] of shots) {
    const index = order.indexOf(id);
    if (shot.globe && index !== 0 && index !== order.length - 1) shots.set(id, (({globe: _globe, ...rest}) => rest)(shot));
  }
  order.forEach((id, index) => {
    if (index > 0 && Boolean(shots.get(id).globe) !== Boolean(shots.get(order[index - 1]).globe) && !shots.get(id).cut) shots.set(id, {...shots.get(id), cut: true});
  });
  // One projection for the whole episode (the globe bookends keep theirs); Mercator is left unset, as before.
  const chosen = draft.projection && draft.projection !== 'auto' ? draft.projection : chooseProjection(subject);
  // A true-size comparison is only honest in an equal-area projection, so one forces Albers on an episode that would be Mercator.
  const comparing = [...shots.values()].some((shot) => shot.annotations.some((annotation) => annotation.type === 'truesize'));
  const projection = comparing && !['albers', 'equal-earth'].includes(chosen) ? 'albers' : chosen;
  for (const [id, shot] of shots) {
    const {projection: _old, ...rest} = shot;
    shots.set(id, shot.globe || projection === 'mercator' ? rest : {...rest, projection});
  }
  const directed = {
    ...draft,
    subject: {...draft.subject, attributes: {...draft.subject.attributes, geoEntity: subjectId}},
    scenes: draft.scenes.map((scene) => ({...scene, primitive: shots.get(scene.id)})),
  };
  const {manifest} = compileEpisode(directed, {showId, geo});
  const weakShots = complete && !modelError ? await judgeShots({complete, draft, shots, places, boxes}) : [];
  const unseenMentions = draft.scenes.map((scene) => ({id: scene.id, places: unshown(scene.id, shots.get(scene.id)).map((place) => place.id)})).filter((item) => item.places.length);
  const offFrame = draft.scenes.map((scene) => ({id: scene.id, places: cutOff(shots.get(scene.id)).map((place) => place.id)})).filter((item) => item.places.length);
  return {draft: directed, manifest, assigned, fallbacks, review, variety: mapVariety(directed), unseenMentions, offFrame, weakShots, ...(modelError ? {modelError} : {})};
};
