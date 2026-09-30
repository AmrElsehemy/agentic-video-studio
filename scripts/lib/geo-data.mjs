// GeoMotion map data: turns pinned Natural Earth layers into slim, deterministic
// assets and an entity registry the renderer and Visual Director can rely on.
// Pure functions only; scripts/geo-data.mjs does the downloading and writing.
import crypto from 'node:crypto';

/** The pinned source. Changing it is a deliberate, reviewed update (see docs/geomotion-data.md). */
export const NATURAL_EARTH = {
  name: 'Natural Earth',
  version: 'v5.1.2',
  license: 'Public domain',
  licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
  attribution: 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.',
  baseUrl: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson',
  layers: {
    countries: {file: 'ne_50m_admin_0_countries.geojson', sha256: '3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb'},
    water: {file: 'ne_50m_geography_marine_polys.geojson', sha256: '6fe58083e0cc5c7fad9e396970e28a8580bbd8770cfa4d1d7b5a34423e912f97'},
    disputed: {file: 'ne_50m_admin_0_breakaway_disputed_areas.geojson', sha256: 'e91f0f9518b24355ceec6668f4df874d6f39db7d0bc9ec22d9b14429bfb6be01'},
  },
};

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

/** Round every coordinate, dropping points that collapse onto the previous one. */
export const roundGeometry = (geometry, decimals) => {
  const factor = 10 ** decimals;
  const round = ([lon, lat]) => [Math.round(lon * factor) / factor, Math.round(lat * factor) / factor];
  const ring = (points) => {
    const out = [];
    for (const point of points.map(round)) {
      const last = out.at(-1);
      if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
    }
    return out;
  };
  if (geometry.type === 'Polygon') return {type: 'Polygon', coordinates: geometry.coordinates.map(ring)};
  if (geometry.type === 'MultiPolygon') return {type: 'MultiPolygon', coordinates: geometry.coordinates.map((polygon) => polygon.map(ring))};
  throw new Error(`Unsupported geometry type ${geometry.type}`);
};

const positions = (geometry) => (geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2));

/**
 * Bounding box [west, south, east, north]. A shape that crosses the
 * antimeridian (Fiji, Russia's far east) gets west > east, the GeoJSON
 * convention, instead of a box spanning the whole world.
 */
export const bboxOf = (geometry) => {
  const points = positions(geometry);
  const lats = points.map(([, lat]) => lat);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const lons = points.map(([lon]) => lon);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  // Shifting negative longitudes by 360° measures the box the other way round the globe.
  const shifted = lons.map((lon) => (lon < 0 ? lon + 360 : lon));
  const shiftedWest = Math.min(...shifted);
  const shiftedEast = Math.max(...shifted);
  if (shiftedEast - shiftedWest < east - west) {
    const wrap = (lon) => (lon > 180 ? lon - 360 : lon);
    return [wrap(shiftedWest), south, wrap(shiftedEast), north].map((value) => Math.round(value * 1000) / 1000);
  }
  return [west, south, east, north].map((value) => Math.round(value * 1000) / 1000);
};

export const crossesAntimeridian = ([west, , east]) => west > east;

export const slug = (text) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const featureCollection = (features) => ({type: 'FeatureCollection', features});

/** Code-unit order: the same on every machine, unlike localeCompare, whose collation depends on ICU and locale. */
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Countries: stable id "country:<ADM0_A3>", ISO code, name, Wikidata id; coordinates to 3 decimals (~100 m). */
export const slimCountries = (source) => featureCollection(source.features
  .map((feature) => ({
    type: 'Feature',
    id: `country:${feature.properties.ADM0_A3}`,
    properties: {
      name: feature.properties.NAME,
      iso3: feature.properties.ISO_A3_EH === '-99' ? null : feature.properties.ISO_A3_EH,
      wikidata: feature.properties.WIKIDATAID ?? null,
      label: [feature.properties.LABEL_X, feature.properties.LABEL_Y],
    },
    geometry: roundGeometry(feature.geometry, 3),
  }))
  .sort((a, b) => byText(a.id, b.id)));

/** Seas, oceans, gulfs…: id "water:<slug>", numbered (-2, -3…) when a name repeats; coordinates to 2 decimals (~1 km). */
export const slimWater = (source) => {
  const features = source.features
    .filter((feature) => feature.properties.name)
    .map((feature) => ({
      type: 'Feature',
      properties: {name: feature.properties.name, kind: feature.properties.featurecla, wikidata: feature.properties.wikidataid ?? null},
      geometry: roundGeometry(feature.geometry, 2),
    }))
    // A stable order (name, then position) so repeated names always get the same numbers.
    .sort((a, b) => byText(a.properties.name, b.properties.name) || byText(bboxOf(a.geometry).join(), bboxOf(b.geometry).join()));
  const seen = new Map();
  for (const feature of features) {
    const base = slug(feature.properties.name);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    feature.id = `water:${count === 1 ? base : `${base}-${count}`}`;
  }
  return featureCollection(features.map(({properties, geometry, id}) => ({type: 'Feature', id, properties, geometry})).sort((a, b) => byText(a.id, b.id)));
};

/** Breakaway and disputed areas, kept separately so they are never silently drawn as settled borders. */
export const slimDisputed = (source) => featureCollection(source.features
  .map((feature) => ({
    type: 'Feature',
    id: `disputed:${slug(feature.properties.BRK_NAME || feature.properties.NAME)}-${feature.properties.BRK_A3}`,
    properties: {name: feature.properties.BRK_NAME || feature.properties.NAME, administeredBy: feature.properties.SOVEREIGNT, note: feature.properties.NOTE_BRK ?? null},
    geometry: roundGeometry(feature.geometry, 3),
  }))
  .sort((a, b) => byText(a.id, b.id)));

const overlaps = ([w1, s1, e1, n1], [w2, s2, e2, n2]) => {
  if (s1 > n2 || s2 > n1) return false;
  const span = (w, e) => (w <= e ? [[w, e]] : [[w, 180], [-180, e]]);
  return span(w1, e1).some(([a, b]) => span(w2, e2).some(([c, d]) => a <= d && c <= b));
};

/** Does a disputed area's note or administrator name this country ("Claimed by Azer." counts for Azerbaijan)? */
const concerns = (area, countryName) => {
  const text = `${area.properties.administeredBy ?? ''}; ${area.properties.note ?? ''}`;
  return text.split(/[;,]| by /).map((part) => part.trim().replace(/\.$/, '')).some((part) => part.length >= 4 && countryName.startsWith(part));
};

/**
 * The entity registry: every country and named body of water with its kind,
 * bounds, label point and source layer. Countries that administer or claim a
 * disputed area carry `review` notes, so an episode touching them goes to a
 * person before publishing.
 */
export const buildEntities = ({countries, water, disputed}) => {
  const entities = [
    ...countries.features.map((feature) => {
      const bbox = bboxOf(feature.geometry);
      const areas = disputed.features.filter((area) => overlaps(bbox, bboxOf(area.geometry)) && concerns(area, feature.properties.name));
      return {
        id: feature.id, kind: 'country', name: feature.properties.name, iso3: feature.properties.iso3, wikidata: feature.properties.wikidata,
        bbox, ...(crossesAntimeridian(bbox) ? {crossesAntimeridian: true} : {}), label: feature.properties.label, layer: 'countries',
        ...(areas.length ? {review: areas.map((area) => ({disputed: area.id, name: area.properties.name, note: area.properties.note}))} : {}),
      };
    }),
    ...water.features.map((feature) => {
      const bbox = bboxOf(feature.geometry);
      return {
        id: feature.id, kind: feature.properties.kind, name: feature.properties.name, wikidata: feature.properties.wikidata,
        bbox, ...(crossesAntimeridian(bbox) ? {crossesAntimeridian: true} : {}), layer: 'water',
      };
    }),
  ];
  return entities.sort((a, b) => byText(a.id, b.id));
};

/** Stable JSON: sorted input, fixed formatting, trailing newline, so assets hash the same on every machine. */
export const serialize = (value) => `${JSON.stringify(value)}\n`;
