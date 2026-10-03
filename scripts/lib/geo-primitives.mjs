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
export const geoProblems = (primitive, {entities, disputed}) => geoReferences(primitive)
  .filter(([, id]) => !(id.startsWith('disputed:') ? disputed.has(id) : entities.has(id)))
  .map(([where, id]) => {
    const close = suggest(id, entities);
    return `${where}: unknown geo entity "${id}"${close.length ? `; did you mean ${close.join(', ')}?` : ''} Ids are listed in public/geo/entities.json (disputed areas in public/geo/disputed.geojson).`;
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
