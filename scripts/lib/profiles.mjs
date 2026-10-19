// Elevation profiles along a path: the height of the land (or sea floor) under a line, from NOAA's ETOPO 2022 model
// (public domain), sampled at even steps of distance. A profile is fetched once into public/geo/profiles/<id>.json,
// so a render needs no network and the numbers never change under a published episode.
import {geoDistance, geoInterpolate} from 'd3-geo';
import {ETOPO} from './elevation.mjs';

export const EARTH_KM = 6371;
/** The model's own grid: one cell per arc-minute, row 0 at the south pole, column 0 at 180° W. */
export const CELLS_PER_DEGREE = 60;
export const MAX_CELLS = 3_000_000;

export const PROFILE_SOURCE = {name: ETOPO.name, publisher: ETOPO.publisher, url: ETOPO.url, doi: ETOPO.doi, license: ETOPO.license};

/** The path as dense [lon, lat] points along great circles, with the distance run (km) at each. */
export const densify = (stops, stepKm = 2) => {
  const points = [stops[0]];
  const distances = [0];
  for (let i = 1; i < stops.length; i++) {
    const [a, b] = [stops[i - 1], stops[i]];
    const km = geoDistance(a, b) * EARTH_KM;
    const along = geoInterpolate(a, b);
    const steps = Math.max(1, Math.ceil(km / stepKm));
    for (let k = 1; k <= steps; k++) {
      points.push(along(k / steps));
      distances.push(distances[distances.length - 1] + (km / steps));
    }
  }
  return {points, distances};
};

/** The cell window (rows and columns of the model's grid) covering the points, with a one-cell margin. */
export const windowOf = (points) => {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const [west, east] = [Math.min(...lons), Math.max(...lons)];
  const [south, north] = [Math.min(...lats), Math.max(...lats)];
  const col0 = Math.max(0, Math.floor((west + 180) * CELLS_PER_DEGREE) - 1);
  const col1 = Math.min(360 * CELLS_PER_DEGREE - 1, Math.ceil((east + 180) * CELLS_PER_DEGREE) + 1);
  const row0 = Math.max(0, Math.floor((south + 90) * CELLS_PER_DEGREE) - 1);
  const row1 = Math.min(180 * CELLS_PER_DEGREE - 1, Math.ceil((north + 90) * CELLS_PER_DEGREE) + 1);
  return {row0, row1, col0, col1, columns: col1 - col0 + 1, rows: row1 - row0 + 1};
};

/** Height (m) at a point by bilinear interpolation of the window's cell centres. */
export const heightAt = (grid, window, [lon, lat]) => {
  const x = (lon + 180) * CELLS_PER_DEGREE - 0.5 - window.col0;
  const y = (lat + 90) * CELLS_PER_DEGREE - 0.5 - window.row0;
  const [i, j] = [Math.max(0, Math.min(window.columns - 2, Math.floor(x))), Math.max(0, Math.min(window.rows - 2, Math.floor(y)))];
  const [fx, fy] = [Math.max(0, Math.min(1, x - i)), Math.max(0, Math.min(1, y - j))];
  const at = (di, dj) => grid[(j + dj) * window.columns + (i + di)];
  return at(0, 0) * (1 - fx) * (1 - fy) + at(1, 0) * fx * (1 - fy) + at(0, 1) * (1 - fx) * fy + at(1, 1) * fx * fy;
};

/** `samples` evenly spaced (by distance) heights along the dense path: {distanceKm, elevationM, points}. */
export const sampleProfile = (grid, window, dense, samples) => {
  const total = dense.distances[dense.distances.length - 1];
  const out = {distanceKm: [], elevationM: [], points: []};
  let cursor = 0;
  for (let s = 0; s < samples; s++) {
    const target = (total * s) / (samples - 1);
    while (cursor < dense.distances.length - 2 && dense.distances[cursor + 1] < target) cursor++;
    const [d0, d1] = [dense.distances[cursor], dense.distances[cursor + 1]];
    const mix = d1 > d0 ? Math.max(0, Math.min(1, (target - d0) / (d1 - d0))) : 0;
    const a = dense.points[cursor];
    const b = dense.points[cursor + 1];
    const point = [a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix];
    out.distanceKm.push(Math.round(target * 10) / 10);
    out.elevationM.push(Math.round(heightAt(grid, window, point)));
    out.points.push([Math.round(point[0] * 1e4) / 1e4, Math.round(point[1] * 1e4) / 1e4]);
  }
  return out;
};
