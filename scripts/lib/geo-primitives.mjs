// Checks a geo-map primitive against the pinned map data, and the rights entry
// that credits that data. The primitive schema checks shape and ranges; this
// checks that every place exists, which needs the entity registry on disk.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The entity registry and dataset manifest from public/geo/. */
export const loadGeoData = (root = repoRoot) => {
  const read = (file) => {
    const target = path.join(root, 'public', 'geo', file);
    if (!fs.existsSync(target)) throw new Error(`public/geo/${file} is missing. Run: npm run geo:prepare`);
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  };
  return {
    entities: new Map(read('entities.json').map((entity) => [entity.id, entity])),
    disputed: new Set(read('disputed.geojson').features.map((feature) => feature.id)),
    manifest: read('manifest.json'),
    // Which plate each country rides on and the pinned plate-motion table (npm run plates:prepare); absent before it is built.
    plates: fs.existsSync(path.join(root, 'public', 'geo', 'plates.json')) ? read('plates.json') : undefined,
    // The photographs on file with their credits (npm run photos); absent before one is added.
    photos: fs.existsSync(path.join(root, 'public', 'photos', 'index.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'public', 'photos', 'index.json'), 'utf8')).photos : undefined,
    // The satellite stills on file with their credits (npm run satellite); absent before one is added.
    satellite: fs.existsSync(path.join(root, 'public', 'satellite', 'index.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'public', 'satellite', 'index.json'), 'utf8')).sets : undefined,
    // The yearly World Bank figures (npm run series:prepare); absent before it is run.
    series: fs.existsSync(path.join(root, 'public', 'geo', 'series.json')) ? read('series.json') : undefined,
    // The cities with street maps (npm run streets:prepare); absent before it is run.
    streets: fs.existsSync(path.join(root, 'public', 'geo', 'streets', 'index.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'public', 'geo', 'streets', 'index.json'), 'utf8')) : undefined,
  };
};

/** Every entity id a geo-map refers to, with where it is used. */
export const geoReferences = (primitive) => [
  ...primitive.camera.flatMap((key, index) => (typeof key.target === 'string' && key.target !== 'world' ? [[`camera[${index}].target`, key.target]] : [])),
  ...primitive.highlights.map((highlight, index) => [`highlights[${index}].entity`, highlight.entity]),
  ...primitive.annotations.flatMap((annotation, index) => ['anchor', 'from', 'to']
    .filter((key) => typeof annotation[key] === 'string')
    .map((key) => [`annotations[${index}].${key}`, annotation[key]])),
  ...(primitive.data?.values ?? []).map(({entity}, index) => [`data.values[${index}].entity`, entity]),
  ...primitive.annotations.flatMap((annotation, index) => (annotation.type === 'ring' && typeof annotation.center === 'string' ? [[`annotations[${index}].center`, annotation.center]] : [])),
  ...primitive.annotations.flatMap((annotation, index) => (annotation.type === 'daynight' ? annotation.places.map((place, at) => [`annotations[${index}].places[${at}]`, place]) : [])),
  ...primitive.annotations.flatMap((annotation, index) => (annotation.type === 'truesize' ? [[`annotations[${index}].entity`, annotation.entity], [`annotations[${index}].onto`, annotation.onto]] : [])),
  ...primitive.annotations.flatMap((annotation, index) => (annotation.type === 'reconstruction' ? [...annotation.entities.map((entity, at) => [`annotations[${index}].entities[${at}]`, entity]), [`annotations[${index}].fixed`, annotation.fixed]] : [])),
  ...primitive.annotations.flatMap((annotation, index) => (annotation.type === 'route' ? annotation.path : [])
    .flatMap((stop, at) => (typeof stop === 'string' ? [[`annotations[${index}].path[${at}]`, stop]] : []))),
];

const suggest = (id, entities) => {
  const [prefix, rest = ''] = id.split(':');
  const needle = rest.toLowerCase();
  return [...entities.values()]
    .filter((entity) => entity.id.startsWith(`${prefix}:`) && (entity.id.toLowerCase().includes(needle) || entity.name.toLowerCase().includes(needle.replace(/-/g, ' '))))
    .slice(0, 3)
    .map((entity) => `${entity.id} (${entity.name})`);
};

/** Problems with a geo-map's places, as actionable messages (empty when it's fine). */
export const geoProblems = (primitive, geo) => [...geoReferenceProblems(primitive, geo), ...reconstructionProblems(primitive, geo), ...trueSizeProblems(primitive, geo), ...streetsProblems(primitive, geo), ...photoProblems(primitive, geo), ...satelliteProblems(primitive, geo), ...seriesProblems(primitive, geo)];

/** A chart over time needs the pinned table, years it covers, and for a line a figure for every country drawn. */
export const seriesProblems = (primitive, {series}) => {
  const chart = primitive.series;
  if (!chart) return [];
  const table = series?.indicators?.[chart.indicator];
  if (!table) return [`series: there is no yearly data for "${chart.indicator}". Run: npm run series:prepare`];
  const last = table.years.at(-1);
  const problems = [];
  for (const key of ['from', 'to']) if (chart[key] < table.years[0] || chart[key] > last) problems.push(`series.${key}: ${chart[key]} is outside the years we have for ${chart.indicator} (${table.years[0]}–${last})`);
  chart.places.forEach((id, index) => {
    const code = id.startsWith('country:') ? id.slice('country:'.length) : undefined;
    const values = code && table.countries[code];
    if (!values) problems.push(`series.places[${index}]: the World Bank has no ${chart.indicator} figures for ${id}`);
    else {
      const lo = Math.min(chart.from, chart.to) - table.years[0];
      const hi = Math.max(chart.from, chart.to) - table.years[0];
      if (values[lo] === null || values[hi] === null) problems.push(`series.places[${index}]: ${id} has no ${chart.indicator} figure for ${values[lo] === null ? Math.min(chart.from, chart.to) : Math.max(chart.from, chart.to)}, so the line would start or stop in mid-air`);
    }
  });
  return problems;
};

/** A satellite annotation needs its set and every date on file, and each mark must fall inside the set's box (a label off the picture would point at nothing). */
export const satelliteProblems = (primitive, {satellite}) => primitive.annotations.flatMap((annotation, index) => {
  if (annotation.type !== 'satellite') return [];
  const set = satellite?.[annotation.set];
  if (!set) return [`annotations[${index}]: no satellite set "${annotation.set}" on file. Add it with: npm run satellite -- add ${annotation.set} --layer=... --bbox=... --dates=...`];
  const missing = annotation.dates.filter((date) => !set.dates[date]);
  const [west, south, east, north] = set.bbox;
  const outside = annotation.marks.filter(({lon, lat}) => lon < west || lon > east || lat < south || lat > north);
  return [
    ...(missing.length ? [`annotations[${index}]: satellite set "${annotation.set}" has no still for ${missing.join(', ')} (it has ${Object.keys(set.dates).join(', ')})`] : []),
    ...outside.map(({text}) => `annotations[${index}]: the mark "${text}" lies outside the satellite picture of "${annotation.set}"`),
  ];
});

/** A photo annotation needs the photo on file, with a credit and a licence that allows it. */
export const photoProblems = (primitive, {photos}) => primitive.annotations.flatMap((annotation, index) => {
  if (annotation.type !== 'photo') return [];
  const photo = photos?.[annotation.photo];
  if (!photo) return [`annotations[${index}]: no photo "${annotation.photo}" on file. Add it with: npm run photos -- add ${annotation.photo} "File:..."`];
  if (!['public-domain', 'attribution'].includes(photo.kind) || !photo.author || !photo.attribution) return [`annotations[${index}]: photo "${annotation.photo}" has no usable licence and credit`];
  return [];
});

/** A street map needs the city's data, and a camera that stays inside it (outside it the map would be blank). */
export const streetsProblems = (primitive, {streets}) => {
  if (!primitive.streets) return [];
  const city = streets?.cities?.[primitive.streets.city];
  if (!city) return [`streets: there is no street data for "${primitive.streets.city}". Run: npm run streets:prepare ${primitive.streets.city}`];
  const [south, west, north, east] = city.box ?? boxAround(city);
  return primitive.camera.flatMap((key, index) => {
    const bbox = key.target?.bbox;
    if (!bbox) return [`camera[${index}].target: a street map needs a bbox camera inside the city's data`];
    return bbox[0] < west || bbox[2] > east || bbox[1] < south || bbox[3] > north ? [`camera[${index}].target: the view leaves ${city.name}'s street data, so part of the map would be blank`] : [];
  });
};
const boxAround = ({center: [lon, lat], radiusKm}) => [lat - (radiusKm * 1.45) / 111.32, lon - radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180)), lat + (radiusKm * 1.45) / 111.32, lon + radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))];

/** The rights entry crediting OpenStreetMap, for a street map. */
export const osmRightsAsset = ({streets}) => ({
  kind: 'map-data',
  sourceUrl: streets.licenseUrl,
  owner: 'OpenStreetMap contributors',
  licenseStatus: 'licensed',
  publicReleaseApproved: true,
  notes: streets.attribution,
});
const geoReferenceProblems = (primitive, {entities, disputed}) => geoReferences(primitive)
  .filter(([, id]) => !(id.startsWith('disputed:') ? disputed.has(id) : entities.has(id)))
  .map(([where, id]) => {
    const close = suggest(id, entities);
    return `${where}: unknown geo entity "${id}"${close.length ? `; did you mean ${close.join(', ')}?` : ''} Ids are listed in public/geo/entities.json (disputed areas in public/geo/disputed.geojson).`;
  });

/** Kinds with an outline that can be copied across the map, and kinds a copy can land on. */
const COPYABLE = new Set(['country', 'admin1', 'lake']);
const LANDABLE = new Set(['country', 'admin1', 'lake', 'city']);

/** Problems with a true-size comparison's places: the one that moves needs an outline, the one it lands on a place. */
export const trueSizeProblems = (primitive, {entities}) => primitive.annotations.flatMap((annotation, index) => {
  if (annotation.type !== 'truesize') return [];
  const problems = [];
  const [moving, target] = [entities.get(annotation.entity), entities.get(annotation.onto)];
  if (moving && !COPYABLE.has(moving.kind)) problems.push(`annotations[${index}].entity: ${annotation.entity} is a ${moving.kind}, which has no outline to copy; use a country, state or lake`);
  if (target && !LANDABLE.has(target.kind)) problems.push(`annotations[${index}].onto: ${annotation.onto} is a ${target.kind}; a copy can land on a country, state, lake or city`);
  return problems;
});

/** Problems with a plate reconstruction's places: each must ride on a plate the model covers, and the moving ones must differ from the fixed one's plate. */
export const reconstructionProblems = (primitive, {plates}) => primitive.annotations.flatMap((annotation, index) => {
  if (annotation.type !== 'reconstruction') return [];
  if (!plates) return [`annotations[${index}]: plate reconstruction data is missing. Run: npm run plates:prepare`];
  const plateOf = (id) => plates.entityPlates[id];
  const problems = [];
  for (const [where, id] of [...annotation.entities.map((entity, at) => [`entities[${at}]`, entity]), ['fixed', annotation.fixed]]) {
    if (!plateOf(id)) problems.push(`annotations[${index}].${where}: ${id} is not on a plate the reconstruction model covers (${Object.values(plates.plates).join(', ')})`);
  }
  for (const entity of annotation.entities) {
    if (plateOf(entity) && plateOf(entity) === plateOf(annotation.fixed)) problems.push(`annotations[${index}]: ${entity} is on the same plate as ${annotation.fixed}, so it would not move; pick a fixed place on another plate`);
  }
  return problems;
});

/** The rights entry crediting the plate-motion model behind a reconstruction. */
export const plateRightsAsset = ({plates}) => ({
  kind: 'map-data',
  sourceUrl: plates.source.licenseUrl,
  owner: `${plates.source.name.split(' global')[0]} plate model`,
  licenseStatus: 'licensed',
  publicReleaseApproved: true,
  notes: plates.source.attribution,
});

/** The rights entry crediting the pinned map data. */
export const geoRightsAsset = ({manifest}) => ({
  kind: 'map-data',
  sourceUrl: manifest.source.licenseUrl,
  owner: `${manifest.source.name} ${manifest.source.version}`,
  licenseStatus: 'public-domain',
  publicReleaseApproved: true,
  notes: manifest.source.attribution,
});

/** The rights entry crediting the World Bank figures behind a chart over time. */
export const seriesRightsAsset = (geo) => ({
  kind: 'map-data',
  sourceUrl: geo.series.url,
  owner: 'World Bank',
  licenseStatus: 'licensed',
  publicReleaseApproved: true,
  notes: geo.series.attribution,
});

/** The rights entry crediting the flag set. */
export const flagRightsAsset = () => ({
  kind: 'map-data',
  sourceUrl: 'https://github.com/lipis/flag-icons/blob/main/LICENSE',
  owner: 'flag-icons',
  licenseStatus: 'licensed',
  publicReleaseApproved: true,
  notes: 'Flags: flag-icons (MIT).',
});

/** The rights entry crediting the NASA imagery of one satellite set (printed in the description with the photo credits). */
export const satelliteRightsAsset = (id, set, dates) => ({
  kind: 'photo',
  sourceUrl: 'https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs',
  owner: 'NASA EOSDIS GIBS',
  licenseStatus: 'public-domain',
  publicReleaseApproved: true,
  notes: `Satellite imagery: NASA EOSDIS Global Imagery Browse Services (${[...new Set(dates.map((date) => set.dates[date]?.title).filter(Boolean))].join('; ')}), ${dates.join(', ')}. NASA imagery is free to use with acknowledgement.`,
});

/** The rights entry crediting one photograph. */
export const photoRightsAsset = (slug, photo) => ({
  kind: 'photo',
  sourceUrl: photo.pageUrl,
  owner: photo.author,
  licenseStatus: photo.kind === 'public-domain' ? 'public-domain' : 'licensed',
  publicReleaseApproved: true,
  notes: photo.attribution,
});
