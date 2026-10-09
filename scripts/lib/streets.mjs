// Street maps: the roads, water and (for a small area) buildings around a city, from OpenStreetMap.
// Data © OpenStreetMap contributors, under the Open Database Licence (ODbL): every use is credited on screen
// and in the episode's rights. Fetched once from Overpass and kept in public/geo/streets/ (npm run streets:prepare).

export const OSM = {
  name: 'OpenStreetMap',
  license: 'ODbL 1.0',
  licenseUrl: 'https://www.openstreetmap.org/copyright',
  attribution: '© OpenStreetMap contributors (ODbL).',
  overpass: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'],
};
/** Road classes, major first; a class's index is its draw order and its width. */
export const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'path'];
const CLASS_OF = {
  motorway: 'motorway', motorway_link: 'motorway', trunk: 'trunk', trunk_link: 'trunk', primary: 'primary', primary_link: 'primary',
  secondary: 'secondary', secondary_link: 'secondary', tertiary: 'tertiary', tertiary_link: 'tertiary',
  unclassified: 'minor', residential: 'minor', living_street: 'minor', service: 'minor', pedestrian: 'path', footway: 'path', steps: 'path', path: 'path',
};
/** A big area takes only the main roads, a small one everything, so a file stays a sensible size. */
export const classesFor = (radiusKm) => (radiusKm > 4 ? ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'] : radiusKm > 2 ? ROAD_CLASSES.slice(0, 6) : ROAD_CLASSES);
export const withBuildings = (radiusKm) => radiusKm <= 3;

/** Videos are portrait, so the box is taller than wide by this factor: a view of the city then never runs off its data. */
export const TALL = 1.45;
/** The box (south, west, north, east) of `radiusKm` east and west of a centre, and TALL times that north and south. */
export const boxOf = ([lon, lat], radiusKm) => {
  const dLat = (radiusKm * TALL) / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((value) => Math.round(value * 1e5) / 1e5);
};

export const overpassQuery = (center, radiusKm) => {
  const box = boxOf(center, radiusKm).join(',');
  const highways = Object.entries(CLASS_OF).filter(([, cls]) => classesFor(radiusKm).includes(cls)).map(([tag]) => tag).join('|');
  return `[out:json][timeout:120];(
  way["highway"~"^(${highways})$"](${box});
  way["railway"~"^(rail|subway|light_rail|tram)$"](${box});
  way["waterway"~"^(river|canal)$"](${box});
  way["natural"~"^(water|coastline)$"](${box});
  way["waterway"="riverbank"](${box});
  ${withBuildings(radiusKm) ? `way["building"](${box});` : ''}
);out geom tags;`;
};

const round5 = (n) => Math.round(n * 1e5) / 1e5;
const line = (geometry) => geometry.map(({lon, lat}) => [round5(lon), round5(lat)]);
const closed = (points) => points.length >= 4 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1];

/** Overpass `out geom` elements to a compact street file: roads by class, rails, water areas and lines, coast, buildings. */
export const compactStreets = (elements) => {
  const result = {roads: ROAD_CLASSES.map(() => []), rails: [], water: [], rivers: [], coast: [], buildings: []};
  for (const element of elements) {
    if (element.type !== 'way' || !element.geometry?.length) continue;
    const tags = element.tags ?? {};
    const points = line(element.geometry);
    if (tags.highway && CLASS_OF[tags.highway]) result.roads[ROAD_CLASSES.indexOf(CLASS_OF[tags.highway])].push(points);
    else if (tags.railway) result.rails.push(points);
    else if (tags.natural === 'coastline') result.coast.push(points);
    else if (tags.natural === 'water' || tags.waterway === 'riverbank') {if (closed(points)) result.water.push(points);}
    else if (tags.waterway) result.rivers.push(points);
    else if (tags.building && closed(points)) result.buildings.push(points);
  }
  return result;
};
