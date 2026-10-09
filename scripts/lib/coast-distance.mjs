import {contours} from 'd3-contour';

// How far inland every place is: the distance to the nearest coast, worked out from the pinned Natural Earth
// country outlines (nothing downloaded). The world is laid on a grid (CELL degrees), each cell either sea or
// land; each land cell then takes its great-circle distance to the nearest sea cell. Distances are to the nearest
// cell centre, so they are good to about a quarter of a degree (under 30 km) and the bands are drawn at 250 km and up.
//
// "Sea" is the open ocean and the seas that join it. Water that does not (the Caspian, the Aral Sea, big lakes)
// counts as land, so Kazakhstan is far from the sea, as it is.

export const CELL = 0.25;
export const WIDTH = 360 / CELL;
export const HEIGHT = 180 / CELL;
/** Band edges in km; the surface is drawn as the land at least this far from the sea. */
export const LEVELS_KM = [250, 500, 1000, 1500, 2000];
/** Points in each sea that joins the ocean, to tell it from an inland lake or inland sea. */
export const SEA_SEEDS = [[-30, 30], [-150, 0], [80, -20], [0, -70], [-160, 70], [-90, 60], [19, 58], [18, 35], [34, 43], [38, 20], [52, 27], [125, 25], [100, 10], [-90, 25], [-70, 15], [150, -30], [-60, -55], [60, 15], [140, 45], [23, 40]];
const EARTH_KM = 6371;
const rad = Math.PI / 180;

const cellLon = (i) => -180 + (i + .5) * CELL;
const cellLat = (j) => 90 - (j + .5) * CELL;

/** Great-circle distance in km between two lon/lat points. */
export const haversineKm = (lon1, lat1, lon2, lat2) => {
  const [p1, p2] = [lat1 * rad, lat2 * rad];
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** Land = 1, water = 0, by filling every country polygon scanline by scanline (even-odd, so holes stay holes). */
export const landMask = (countries) => {
  const crossings = Array.from({length: HEIGHT}, () => []);
  const ring = (points) => {
    for (let k = 0; k < points.length - 1; k++) {
      const [x1, y1] = points[k];
      const [x2, y2] = points[k + 1];
      if (y1 === y2) continue;
      const [low, high] = y1 < y2 ? [y1, y2] : [y2, y1];
      const first = Math.max(0, Math.ceil((90 - high) / CELL - .5));
      const last = Math.min(HEIGHT - 1, Math.floor((90 - low) / CELL - .5));
      for (let j = first; j <= last; j++) {
        const lat = cellLat(j);
        if (lat < low || lat >= high) continue;
        crossings[j].push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
  };
  for (const feature of countries.features) {
    const {type, coordinates} = feature.geometry;
    for (const polygon of type === 'Polygon' ? [coordinates] : coordinates) for (const points of polygon) ring(points);
  }
  const mask = new Uint8Array(WIDTH * HEIGHT);
  crossings.forEach((xs, j) => {
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const first = Math.max(0, Math.ceil((xs[k] + 180) / CELL - .5));
      const last = Math.min(WIDTH - 1, Math.floor((xs[k + 1] + 180) / CELL - .5));
      for (let i = first; i <= last; i++) mask[j * WIDTH + i] = 1;
    }
  });
  return mask;
};

/** The cells of water that join the open ocean (flood fill from the seeds, wrapping around the date line). */
export const openSea = (mask) => {
  const sea = new Uint8Array(mask.length);
  const stack = [];
  for (const [lon, lat] of SEA_SEEDS) {
    const index = Math.floor((90 - lat) / CELL) * WIDTH + Math.floor((lon + 180) / CELL);
    if (mask[index] === 0 && !sea[index]) {sea[index] = 1; stack.push(index);}
  }
  while (stack.length) {
    const index = stack.pop();
    const [j, i] = [Math.floor(index / WIDTH), index % WIDTH];
    for (const [dj, di] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nj = j + dj;
      if (nj < 0 || nj >= HEIGHT) continue;
      const next = nj * WIDTH + ((i + di + WIDTH) % WIDTH);
      if (mask[next] === 0 && !sea[next]) {sea[next] = 1; stack.push(next);}
    }
  }
  return sea;
};

/** Distance in km from every cell to the nearest open-sea cell (0 in the sea). */
export const distanceGrid = (sea) => {
  const distance = new Float32Array(sea.length).fill(Infinity);
  const source = new Int32Array(sea.length).fill(-1);
  sea.forEach((value, index) => {if (value) {distance[index] = 0; source[index] = index;}});
  const offer = (index, from) => {
    const near = source[from];
    if (near < 0) return false;
    const d = haversineKm(cellLon(index % WIDTH), cellLat(Math.floor(index / WIDTH)), cellLon(near % WIDTH), cellLat(Math.floor(near / WIDTH)));
    if (d >= distance[index]) return false;
    distance[index] = d;
    source[index] = near;
    return true;
  };
  const neighbours = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  for (let pass = 0; pass < 40; pass++) {
    let changed = false;
    for (const forward of [true, false]) {
      for (let n = 0; n < sea.length; n++) {
        const index = forward ? n : sea.length - 1 - n;
        const [j, i] = [Math.floor(index / WIDTH), index % WIDTH];
        for (const [dj, di] of neighbours) {
          const nj = j + dj;
          if (nj < 0 || nj >= HEIGHT) continue;
          if (offer(index, nj * WIDTH + ((i + di + WIDTH) % WIDTH))) changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return distance;
};

/** Distance in km from a point to the nearest sea, read from the grid. */
export const coastDistanceKm = (grid, [lon, lat]) => {
  const i = Math.min(WIDTH - 1, Math.max(0, Math.floor((lon + 180) / CELL)));
  const j = Math.min(HEIGHT - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
  return grid[j * WIDTH + i];
};

/** The land at least each level from the sea, as polygons in lon/lat (one feature per level), wound the way d3-geo wants (the contours come out the other way round). */
export const bandPolygons = (distance) => {
  const values = Array.from(distance, (d) => (Number.isFinite(d) ? d : 0));
  const rounded = (n) => Math.round(n * 100) / 100;
  return contours().size([WIDTH, HEIGHT]).thresholds(LEVELS_KM)(values).map((band) => ({
    type: 'Feature',
    properties: {km: band.value},
    geometry: {
      type: 'MultiPolygon',
      coordinates: band.coordinates.map((polygon) => polygon.map((points) => points.map(([x, y]) => [rounded(-180 + x * CELL), rounded(90 - y * CELL)]).reverse())),
    },
  }));
};

/** The farthest-from-sea cell of a land area, for checks. */
export const farthest = (distance, box = [-180, -90, 180, 90]) => {
  let best = {km: -1, lon: 0, lat: 0};
  for (let j = 0; j < HEIGHT; j++) for (let i = 0; i < WIDTH; i++) {
    const [lon, lat] = [cellLon(i), cellLat(j)];
    if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue;
    const km = distance[j * WIDTH + i];
    if (Number.isFinite(km) && km > best.km) best = {km, lon, lat};
  }
  return best;
};
