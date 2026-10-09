// More Natural Earth layers for the map: states and provinces, lakes, rivers and cities (#geo).
// Each becomes entities in the registry (ids "admin1:…", "lake:…", "river:…", "city:…") that
// drafts, the director and the renderer use like countries. Pure functions; scripts/geo-data.mjs
// downloads, pins and writes them.
import {bboxOf, roundGeometry, slug} from './geo-data.mjs';

const featureCollection = (features) => ({type: 'FeatureCollection', features});
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Lakes this important or more (Natural Earth scalerank 0 = the largest) are kept. */
export const MAX_LAKE_RANK = 5;
/** Rivers this important or more are kept. */
export const MAX_RIVER_RANK = 6;
/** Cities kept besides every capital. */
export const MIN_CITY_POPULATION = 1_000_000;

/** Number repeated slugs (-2, -3…) in a stable order, as the water layer does. */
const withIds = (items, prefix) => {
  const seen = new Map();
  return items
    .sort((a, b) => byText(a.slug, b.slug) || byText(a.sortKey, b.sortKey))
    .map((item) => {
      const count = (seen.get(item.slug) ?? 0) + 1;
      seen.set(item.slug, count);
      return {...item, id: `${prefix}:${count === 1 ? item.slug : `${item.slug}-${count}`}`};
    });
};

/** States, provinces and regions: id "admin1:<code>" (Natural Earth's adm1_code), with the country's code. */
export const slimAdmin1 = (source) => featureCollection(source.features
  .filter((feature) => feature.properties.name)
  .map((feature) => ({
    type: 'Feature',
    id: `admin1:${feature.properties.adm1_code}`,
    properties: {name: feature.properties.name, country: feature.properties.adm0_a3, type: feature.properties.type_en ?? null},
    geometry: roundGeometry(feature.geometry, 3),
  }))
  .sort((a, b) => byText(a.id, b.id)));

/** Lakes of rank MAX_LAKE_RANK or better, by name: id "lake:<slug>". */
export const slimLakes = (source) => {
  const kept = source.features
    .filter((feature) => feature.properties.name && feature.properties.scalerank <= MAX_LAKE_RANK && feature.geometry)
    .map((feature) => ({
      slug: slug(feature.properties.name),
      sortKey: bboxOf(feature.geometry).join(),
      properties: {name: feature.properties.name, rank: feature.properties.scalerank},
      geometry: roundGeometry(feature.geometry, 3),
    }));
  return featureCollection(withIds(kept, 'lake').map(({id, properties, geometry}) => ({type: 'Feature', id, properties, geometry})));
};

const lineParts = (geometry) => (geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates);
const roundLine = (points, decimals) => {
  const factor = 10 ** decimals;
  const out = [];
  for (const [lon, lat] of points) {
    const point = [Math.round(lon * factor) / factor, Math.round(lat * factor) / factor];
    const last = out.at(-1);
    if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
  }
  return out;
};

/**
 * Rivers of rank MAX_RIVER_RANK or better. Natural Earth cuts a river into pieces, so pieces with
 * one name are joined into one feature (a MultiLineString): id "river:<slug>". Lake centrelines
 * (the line a river takes through a lake) are not rivers and are left out.
 */
export const slimRivers = (source) => {
  const byName = new Map();
  for (const feature of source.features) {
    const {featurecla, scalerank, name_en: english, name} = feature.properties;
    const label = english || name;
    if (featurecla !== 'River' || !label || scalerank > MAX_RIVER_RANK || !feature.geometry) continue;
    const entry = byName.get(label) ?? {label, rank: scalerank, parts: []};
    entry.rank = Math.min(entry.rank, scalerank);
    entry.parts.push(...lineParts(feature.geometry).map((part) => roundLine(part, 3)).filter((part) => part.length > 1));
    byName.set(label, entry);
  }
  const kept = [...byName.values()].filter((entry) => entry.parts.length).map((entry) => {
    const geometry = {type: 'MultiLineString', coordinates: entry.parts};
    return {slug: slug(entry.label), sortKey: bboxOf({type: 'Polygon', coordinates: [entry.parts.flat()]}).join(), properties: {name: entry.label, rank: entry.rank}, geometry};
  });
  return featureCollection(withIds(kept, 'river').map(({id, properties, geometry}) => ({type: 'Feature', id, properties, geometry})));
};

/**
 * Land borders between two countries, each pair joined into one feature (a MultiLineString): id
 * "border:<code>-<code>" with the two ISO-style codes in alphabetical order (border:CAN-USA). Only lines
 * Natural Earth tags with a country on each side are kept.
 */
export const slimBorders = (source) => {
  const byPair = new Map();
  for (const feature of source.features) {
    const {ADM0_A3_L: left, ADM0_A3_R: right, ADM0_LEFT: leftName, ADM0_RIGHT: rightName} = feature.properties;
    if (!left || !right || left === right || !feature.geometry) continue;
    const [a, b] = [left, right].sort();
    const entry = byPair.get(`${a}-${b}`) ?? {codes: [a, b], names: left === a ? [leftName, rightName] : [rightName, leftName], parts: []};
    entry.parts.push(...lineParts(feature.geometry).map((part) => roundLine(part, 3)).filter((part) => part.length > 1));
    byPair.set(`${a}-${b}`, entry);
  }
  return featureCollection([...byPair].filter(([, entry]) => entry.parts.length).map(([key, entry]) => ({
    type: 'Feature',
    id: `border:${key}`,
    properties: {name: `${entry.names[0]}–${entry.names[1]} border`, countries: entry.codes},
    geometry: {type: 'MultiLineString', coordinates: entry.parts},
  })).sort((a, b) => byText(a.id, b.id)));
};

/** Capitals and cities of at least MIN_CITY_POPULATION, as {id "city:<slug>-<country>", name, lon, lat, …}. */
export const slimCities = (source) => {
  const kept = source.features
    .filter(({properties}) => properties.name && (/Admin-0 capital/i.test(properties.featurecla ?? '') || properties.pop_max >= MIN_CITY_POPULATION) && !/Historic|station/i.test(properties.featurecla ?? ''))
    .map(({properties}) => ({
      slug: `${slug(properties.nameascii || properties.name)}-${String(properties.adm0_a3 ?? 'xxx').toLowerCase()}`,
      // The biggest city of a repeated name keeps the plain id.
      sortKey: String(1e10 - (properties.pop_max ?? 0)).padStart(12, '0'),
      name: properties.name,
      country: properties.adm0_a3 ?? null,
      capital: /Admin-0 capital/i.test(properties.featurecla ?? ''),
      population: properties.pop_max ?? null,
      lon: Math.round(properties.longitude * 1000) / 1000,
      lat: Math.round(properties.latitude * 1000) / 1000,
    }));
  return withIds(kept, 'city').map(({slug: _slug, sortKey: _key, ...city}) => city);
};

/** Registry entries for the new layers; cities are points, so their box is the point itself. */
export const layerEntities = ({admin1 = featureCollection([]), lakes = featureCollection([]), rivers = featureCollection([]), borders = featureCollection([]), cities = []}) => [
  ...borders.features.map((feature) => ({id: feature.id, kind: 'border', name: feature.properties.name, countries: feature.properties.countries, bbox: bboxOf({type: 'Polygon', coordinates: [feature.geometry.coordinates.flat()]}), layer: 'borders'})),
  ...admin1.features.map((feature) => {
    const bbox = bboxOf(feature.geometry);
    return {id: feature.id, kind: 'admin1', name: feature.properties.name, country: feature.properties.country, bbox, layer: 'admin1'};
  }),
  ...lakes.features.map((feature) => ({id: feature.id, kind: 'lake', name: feature.properties.name, rank: feature.properties.rank, bbox: bboxOf(feature.geometry), layer: 'lakes'})),
  ...rivers.features.map((feature) => ({id: feature.id, kind: 'river', name: feature.properties.name, rank: feature.properties.rank, bbox: bboxOf({type: 'Polygon', coordinates: [feature.geometry.coordinates.flat()]}), layer: 'rivers'})),
  ...cities.map((city) => ({id: city.id, kind: 'city', name: city.name, country: city.country, ...(city.capital ? {capital: true} : {}), ...(city.population ? {population: city.population} : {}), bbox: [city.lon, city.lat, city.lon, city.lat], label: [city.lon, city.lat], layer: 'places'})),
];
