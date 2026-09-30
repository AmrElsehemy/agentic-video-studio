// Resolve place names from research ("Georgia", "the Black Sea", "USA") to
// entity ids in the pinned map data, so nothing downstream ever handles raw
// coordinates or outlines. Names that could mean several places, or none,
// are reported rather than guessed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ALIASES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'geo-aliases.json'), 'utf8'));

/** Case-, accent- and punctuation-insensitive key; a leading "the" is dropped. */
export const placeKey = (name) => String(name).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');

/** An index from every usable name (registry name, ISO code, Wikidata id, alias) to entity ids. */
export const buildPlaceIndex = (entities) => {
  const index = new Map();
  const add = (key, id) => {
    if (!key) return;
    index.set(key, [...new Set([...(index.get(key) ?? []), id])]);
  };
  for (const entity of entities.values()) {
    add(placeKey(entity.name), entity.id);
    if (entity.iso3) add(placeKey(entity.iso3), entity.id);
    if (entity.wikidata) add(placeKey(entity.wikidata), entity.id);
  }
  for (const [alias, id] of Object.entries(ALIASES.aliases)) if (entities.has(id)) add(placeKey(alias), id);
  for (const [alias, ids] of Object.entries(ALIASES.ambiguous)) for (const id of ids) if (entities.has(id)) add(placeKey(alias), id);
  return index;
};

/**
 * Resolve one name. Returns {status: 'resolved', id, entity, review?},
 * {status: 'ambiguous', candidates}, or {status: 'unknown', suggestions}.
 * `review` lists disputed areas that concern the place, for a person to check.
 */
export const resolvePlace = (name, {entities, index = buildPlaceIndex(entities)}) => {
  const key = placeKey(name);
  const ids = index.get(key) ?? [];
  if (ids.length === 1) {
    const entity = entities.get(ids[0]);
    return {status: 'resolved', id: entity.id, entity, ...(entity.review ? {review: entity.review} : {})};
  }
  if (ids.length > 1) return {status: 'ambiguous', candidates: ids.map((id) => ({id, name: entities.get(id).name}))};
  const suggestions = [...index.keys()]
    .filter((candidate) => candidate.length > 2 && (candidate.includes(key) || key.includes(candidate)))
    .flatMap((candidate) => index.get(candidate))
    .filter((id, position, all) => all.indexOf(id) === position)
    .slice(0, 3)
    .map((id) => ({id, name: entities.get(id).name}));
  return {status: 'unknown', suggestions};
};

/** Resolve a list of names; problems explain every name that didn't resolve to exactly one place. */
export const resolvePlaces = (names, geo) => {
  const index = buildPlaceIndex(geo.entities);
  const resolved = new Map();
  const problems = [];
  for (const name of names) {
    const result = resolvePlace(name, {entities: geo.entities, index});
    if (result.status === 'resolved') resolved.set(name, result);
    else if (result.status === 'ambiguous') problems.push(`"${name}" could be ${result.candidates.map((item) => `${item.name} (${item.id})`).join(' or ')}; use the specific name.`);
    else problems.push(`"${name}" isn't in the map data${result.suggestions.length ? `; did you mean ${result.suggestions.map((item) => `${item.name} (${item.id})`).join(', ')}?` : '.'} Add a common name to scripts/lib/geo-aliases.json if it is one.`);
  }
  return {resolved, problems};
};
