// Fine coastlines from GSHHG (Wessel & Smith, LGPL-3.0+): land outlines at two sharper resolutions than
// Natural Earth's 1:10m, cut into small tiles so a close-up loads only the coast it shows.
// Pure functions here; scripts/fine-coast.mjs reads the shapefiles and writes the tiles.

export const FINE_COAST = {
  name: 'GSHHG',
  version: '2.3.7',
  license: 'LGPL-3.0-or-later',
  licenseUrl: 'https://www.gnu.org/licenses/lgpl-3.0.html',
  sourceUrl: 'https://www.soest.hawaii.edu/pwessel/gshhg/gshhg-shp-2.3.7.zip',
  sha256: '8dbbe7e071e77e9e75f2d639239099ebca8d5c16d6a07df8169729d49f15cf41',
  attribution: 'Coastlines: GSHHG v2.3.7 (Wessel & Smith, SOEST / NOAA), LGPL.',
  /** Tiles are TILE degrees square. Resolution `h` (~200 m) serves views up to H_MAX degrees wide, `f` (~50 m) below F_MAX. */
  tile: 5,
  margin: 0.03,
  levels: {
    h: {folder: 'h', file: 'GSHHS_h_L1.shp', tolerance: 0.002, decimals: 3, maxSpan: 14},
    f: {folder: 'f', file: 'GSHHS_f_L1.shp', tolerance: 0.0008, decimals: 4, maxSpan: 3.5},
  },
};

/** Douglas–Peucker on an open polyline of [x, y], iterative so a ring of millions of points cannot overflow the stack. */
export const simplify = (points, tolerance) => {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const squared = tolerance * tolerance;
  while (stack.length) {
    const [from, to] = stack.pop();
    const [ax, ay] = points[from];
    const dx = points[to][0] - ax;
    const dy = points[to][1] - ay;
    const length2 = dx * dx + dy * dy;
    let far = -1;
    let farDistance = squared;
    for (let index = from + 1; index < to; index++) {
      const px = points[index][0] - ax;
      const py = points[index][1] - ay;
      let distance2;
      if (length2 === 0) distance2 = px * px + py * py;
      else {
        const along = Math.max(0, Math.min(1, (px * dx + py * dy) / length2));
        const ex = px - along * dx;
        const ey = py - along * dy;
        distance2 = ex * ex + ey * ey;
      }
      if (distance2 > farDistance) { farDistance = distance2; far = index; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([from, far], [far, to]); }
  }
  return points.filter((_, index) => keep[index]);
};

/** Sutherland–Hodgman against one axis-aligned half-plane. `axis` 0 = x, 1 = y; keeps the side where sign*(v - limit) <= 0. */
const clipHalf = (ring, axis, limit, sign) => {
  const out = [];
  const inside = (p) => sign * (p[axis] - limit) <= 0;
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    const aIn = inside(a);
    const bIn = inside(b);
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (limit - a[axis]) / (b[axis] - a[axis]);
      out.push(axis === 0 ? [limit, a[1] + t * (b[1] - a[1])] : [a[0] + t * (b[0] - a[0]), limit]);
    }
  }
  return out;
};

export const clipRect = (ring, [west, south, east, north]) => {
  let out = clipHalf(ring, 0, east, 1);
  if (out.length) out = clipHalf(out, 0, west, -1);
  if (out.length) out = clipHalf(out, 1, north, 1);
  if (out.length) out = clipHalf(out, 1, south, -1);
  return out.length >= 3 ? out : [];
};

const bboxOf = (ring) => {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [x, y] of ring) { if (x < west) west = x; if (x > east) east = x; if (y < south) south = y; if (y > north) north = y; }
  return [west, south, east, north];
};

/** The tile key for a lon/lat corner: the south-west corner of its tile, e.g. "50_20" or "-10_-40". */
export const tileKey = (lon, lat, size = FINE_COAST.tile) => `${Math.floor(lon / size) * size}_${Math.floor(lat / size) * size}`;

/**
 * Cut a ring into the tiles it touches. Each piece reaches `margin` degrees past its tile so neighbouring pieces overlap
 * (opaque fill, so the overlap is invisible and no hairline seam opens between tiles).
 * @returns {Map<string, number[][][]>} tile key -> pieces
 */
export const sliceRing = (ring, {size = FINE_COAST.tile, margin = FINE_COAST.margin} = {}) => {
  const tiles = new Map();
  const visit = (piece, west, south, east, north) => {
    const box = bboxOf(piece);
    const tx0 = Math.floor(Math.max(box[0], west) / size), tx1 = Math.floor(Math.min(box[2], east - 1e-9) / size);
    const ty0 = Math.floor(Math.max(box[1], south) / size), ty1 = Math.floor(Math.min(box[3], north - 1e-9) / size);
    if (piece.length < 3 || tx0 > tx1 || ty0 > ty1) return;
    if (tx0 === tx1 && ty0 === ty1) {
      const key = `${tx0 * size}_${ty0 * size}`;
      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key).push(piece);
      return;
    }
    if (tx1 - tx0 >= ty1 - ty0) {
      const mid = (tx0 + Math.floor((tx1 - tx0 + 1) / 2)) * size;
      visit(clipRect(piece, [box[0] - 1, box[1] - 1, mid + margin, box[3] + 1]), west, south, mid, north);
      visit(clipRect(piece, [mid - margin, box[1] - 1, box[2] + 1, box[3] + 1]), mid, south, east, north);
    } else {
      const mid = (ty0 + Math.floor((ty1 - ty0 + 1) / 2)) * size;
      visit(clipRect(piece, [box[0] - 1, box[1] - 1, box[2] + 1, mid + margin]), west, south, east, mid);
      visit(clipRect(piece, [box[0] - 1, mid - margin, box[2] + 1, box[3] + 1]), west, mid, east, north);
    }
  };
  const box = bboxOf(ring);
  visit(ring, box[0], box[1], box[2], box[3]);
  return tiles;
};

/** Round to `decimals` and write one ring as a flat [x0, y0, x1, y1, ...]. */
export const flatten = (ring, decimals) => {
  const factor = 10 ** decimals;
  const out = [];
  for (const [x, y] of ring) {
    const rx = Math.round(x * factor) / factor;
    const ry = Math.round(y * factor) / factor;
    const n = out.length;
    if (n >= 2 && out[n - 2] === rx && out[n - 1] === ry) continue;
    out.push(rx, ry);
  }
  return out;
};

/**
 * Build the tiles of one resolution.
 * @param {{rings: number[][][]}[]} polygons records from readPolygons
 * @returns {Map<string, number[][]>} tile key -> flat rings
 */
export const buildTiles = (polygons, {tolerance, decimals, size = FINE_COAST.tile, margin = FINE_COAST.margin}) => {
  const tiles = new Map();
  for (const polygon of polygons) {
    for (const ring of polygon.rings) {
      const simple = simplify(ring.slice(0, -1), tolerance);
      if (simple.length < 3) continue;
      for (const [key, pieces] of sliceRing(simple, {size, margin})) {
        for (const piece of pieces) {
          const flat = flatten(piece, decimals);
          if (flat.length < 6) continue;
          if (!tiles.has(key)) tiles.set(key, []);
          tiles.get(key).push(flat);
        }
      }
    }
  }
  return tiles;
};
