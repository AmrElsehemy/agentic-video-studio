import {geoContains, geoDistance, geoInterpolate} from 'd3-geo';

// Reach: how far a place is from each country, measured to the country's nearest border in a straight line over the
// Earth (great-circle distance), so a growing ring can light up the countries it has reached and count them. A country
// the centre lies inside is at 0. Computed from the map's own boundaries (long edges are walked in small steps, so a
// straight stretch of border between two far-apart points is not missed), memoised per centre.

const EARTH_KM = 6371;
const STEP_KM = 25;
type LonLat = [number, number];
type Geometry = {type: string; coordinates: any};
export type Boundary = {id: string; geometry: Geometry};

const rings = (geometry: Geometry): LonLat[][] => {
  if (geometry.type === 'Polygon') return geometry.coordinates as LonLat[][];
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as LonLat[][][]).flat();
  return [];
};

/** The shortest distance (km) from `centre` to the boundary of the geometry, or 0 when the centre lies inside it. */
export const nearestKm = (feature: Boundary, centre: LonLat) => {
  if (geoContains({type: 'Feature', properties: {}, geometry: feature.geometry} as never, centre)) return 0;
  let best = Infinity;
  for (const ring of rings(feature.geometry)) {
    for (let i = 1; i < ring.length; i++) {
      const [a, b] = [ring[i - 1], ring[i]];
      const edge = geoDistance(a, b) * EARTH_KM;
      best = Math.min(best, geoDistance(centre, a) * EARTH_KM);
      if (edge > STEP_KM) {
        // Only walk an edge that could come closer than the best so far.
        if (geoDistance(centre, a) * EARTH_KM - edge > best) continue;
        const along = geoInterpolate(a, b);
        const steps = Math.ceil(edge / STEP_KM);
        for (let k = 1; k < steps; k++) best = Math.min(best, geoDistance(centre, along(k / steps) as LonLat) * EARTH_KM);
      }
    }
  }
  return best;
};

const cache = new Map<string, Map<string, number>>();

/** Each country's distance (km) to the nearest border from `centre`, for the countries given; memoised by centre. */
export const reachDistances = (features: Boundary[], centre: LonLat) => {
  const key = `${centre[0].toFixed(4)},${centre[1].toFixed(4)}`;
  let found = cache.get(key);
  if (!found) {
    found = new Map();
    cache.set(key, found);
  }
  for (const feature of features) if (!found.has(feature.id)) found.set(feature.id, nearestKm(feature, centre));
  return found;
};

/** The ids of the countries whose nearest border is within `radiusKm`. */
export const countriesWithin = (distances: Map<string, number>, radiusKm: number) => [...distances.entries()].filter(([, km]) => km <= radiusKm).map(([id]) => id).sort();
