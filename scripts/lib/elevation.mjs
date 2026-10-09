import {contours} from 'd3-contour';

// Elevation and sea-level-rise flooding, from NOAA's ETOPO 2022 (60 arc-second surface model, public domain).
// The grid is sampled every 0.05 degrees (about 5.5 km): land and sea floor as one height in metres. From it:
//   - elevation bands: the land at least 200, 500, 1000, 2000, 3000, 4000 and 5000 m up;
//   - flood bands: the land that a rise of 1, 2, 5, 10, 20 and 50 m in the sea would cover, where the water can
//     reach it from the open sea (a low basin walled off from the sea, like the Dead Sea shore, stays dry).
// A flood band is a "bathtub": the height alone decides, with no defences, tides, rivers or ground sinking. It is
// approximate, to the grid and to the model's vertical accuracy, so it is for the shape of a story, not a plan.

export const ETOPO = {
  name: 'ETOPO 2022 60 arc-second surface elevation',
  publisher: 'NOAA National Centers for Environmental Information',
  doi: 'https://doi.org/10.25921/fd45-gt74',
  license: 'Public domain',
  url: 'https://www.ngdc.noaa.gov/thredds/dodsC/global/ETOPO2022/60s/60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc',
};
export const STEP = 3;
export const CELL = STEP / 60;
export const WIDTH = 360 / CELL;
export const HEIGHT = 180 / CELL;
export const ELEVATION_LEVELS = [200, 500, 1000, 2000, 3000, 4000, 5000];
export const FLOOD_LEVELS = [1, 2, 5, 10, 20, 50];

/** The floats of an OPeNDAP (DAP2) `.dods` reply for a single grid: the array comes first, big-endian. */
export const parseDods = (buffer) => {
  const marker = buffer.indexOf('\nData:\n');
  if (marker < 0) throw new Error(`The elevation server did not return data: ${buffer.subarray(0, 300).toString('utf8')}`);
  const start = marker + '\nData:\n'.length;
  const count = buffer.readUInt32BE(start);
  const values = new Float32Array(count);
  for (let i = 0; i < count; i++) values[i] = buffer.readFloatBE(start + 8 + i * 4);
  return values;
};

const cellLat = (j) => 90 - (j + .5) * CELL;
const rad = Math.PI / 180;

/** Every cell of the open sea (at or below sea level and joined to the ocean), found by flood fill from the middle of the Atlantic and Pacific, wrapping round the date line. */
export const floodFrom = (grid, level, seeds = [[-30, 30], [-150, 0], [80, -20], [0, -70], [-160, 70], [19, 58], [18, 35], [34, 43], [38, 20], [52, 27], [125, 25], [100, 10], [-90, 25]]) => {
  const wet = new Uint8Array(grid.length);
  const stack = [];
  for (const [lon, lat] of seeds) {
    const index = Math.floor((90 - lat) / CELL) * WIDTH + Math.floor((lon + 180) / CELL);
    if (grid[index] <= level && !wet[index]) {wet[index] = 1; stack.push(index);}
  }
  while (stack.length) {
    const index = stack.pop();
    const [j, i] = [Math.floor(index / WIDTH), index % WIDTH];
    for (const [dj, di] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nj = j + dj;
      if (nj < 0 || nj >= HEIGHT) continue;
      const next = nj * WIDTH + ((i + di + WIDTH) % WIDTH);
      if (grid[next] <= level && !wet[next]) {wet[next] = 1; stack.push(next);}
    }
  }
  return wet;
};

const round = (n) => Math.round(n * 100) / 100;
/** Douglas-Peucker: drop points that lie within `tolerance` (in cells) of the line between their neighbours. */
export const simplify = (points, tolerance) => {
  if (points.length <= 2) return points;
  const [a, b] = [points[0], points[points.length - 1]];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = Math.hypot(dx, dy);
  let [worst, at] = [-1, 0];
  for (let i = 1; i < points.length - 1; i++) {
    const d = length === 0 ? Math.hypot(points[i][0] - a[0], points[i][1] - a[1]) : Math.abs(dy * points[i][0] - dx * points[i][1] + b[0] * a[1] - b[1] * a[0]) / length;
    if (d > worst) [worst, at] = [d, i];
  }
  if (worst <= tolerance) return [a, b];
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
};
const ringArea = (ring) => Math.abs(ring.reduce((sum, [x, y], i) => sum + x * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y, 0)) / 2;
/** Rings smaller than this many cells are specks; the bands are for the shape of the land, not for islets. */
const MIN_RING_CELLS = 6;
const SIMPLIFY_CELLS = .7;
/** Contour polygons wound the way d3-geo wants (contours come out the other way round), in lon/lat, simplified so the file stays small. */
const toGeo = (band) => band.coordinates.flatMap((polygon) => {
  const rings = polygon.map((ring, index) => (index === 0 || ringArea(ring) >= MIN_RING_CELLS ? simplify(ring, SIMPLIFY_CELLS) : []))
    .filter((ring, index) => (index === 0 ? ringArea(polygon[0]) >= MIN_RING_CELLS : ring.length >= 4));
  return rings.length && rings[0].length >= 4 ? [rings.map((ring) => ring.map(([x, y]) => [round(-180 + x * CELL), round(90 - y * CELL)]).reverse())] : [];
});

export const elevationBands = (grid) => contours().size([WIDTH, HEIGHT]).thresholds(ELEVATION_LEVELS)(Array.from(grid, (z) => z)).map((band) => ({
  type: 'Feature', properties: {metres: band.value}, geometry: {type: 'MultiPolygon', coordinates: toGeo(band)},
}));

export const floodBands = (grid) => FLOOD_LEVELS.map((level) => {
  const wet = floodFrom(grid, level);
  const [band] = contours().size([WIDTH, HEIGHT]).thresholds([.5])(Array.from(wet, (w) => w));
  return {type: 'Feature', properties: {metres: level}, geometry: {type: 'MultiPolygon', coordinates: toGeo(band)}};
});

/** Height in metres at a point, from the grid. */
export const elevationAt = (grid, [lon, lat]) => {
  const i = Math.min(WIDTH - 1, Math.max(0, Math.floor((lon + 180) / CELL)));
  const j = Math.min(HEIGHT - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
  return grid[j * WIDTH + i];
};
export const cellAreaKm2 = (j) => (CELL * rad * 6371) ** 2 * Math.cos(cellLat(j) * rad);
