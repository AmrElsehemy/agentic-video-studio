// Plate reconstructions: where a landmass was in the past, from a published plate-motion model
// (a GPlates rotation file: for each plate, finite rotations at ages, each relative to a "fixed"
// plate). Pure functions: the build script (scripts/plates.mjs) turns the model into a compact table
// in public/geo/plates.json; the renderer rotates a place's outline with it. Nothing is hand-moved.

const RAD = Math.PI / 180;

/** Rows of a GPlates .rot file: {plate, age, lat, lon, angle, fixed}. Comment-only lines are skipped. */
export const parseRotations = (text) => text.split('\n')
  .map((line) => line.split('!')[0].trim())
  .filter(Boolean)
  .map((line) => line.split(/\s+/))
  .filter((parts) => parts.length >= 6)
  .map(([plate, age, lat, lon, angle, fixed]) => ({plate: Number(plate), age: Number(age), lat: Number(lat), lon: Number(lon), angle: Number(angle), fixed: Number(fixed)}));

// Quaternions are [w, x, y, z]; a rotation of `angle` degrees about the pole (lat, lon), counter-clockwise seen from outside.
export const IDENTITY = [1, 0, 0, 0];
export const quatFromPole = (lat, lon, angle) => {
  const half = (angle * RAD) / 2;
  const s = Math.sin(half);
  return [Math.cos(half), s * Math.cos(lat * RAD) * Math.cos(lon * RAD), s * Math.cos(lat * RAD) * Math.sin(lon * RAD), s * Math.sin(lat * RAD)];
};
export const quatMul = ([aw, ax, ay, az], [bw, bx, by, bz]) => [
  aw * bw - ax * bx - ay * by - az * bz,
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
];
export const quatInverse = ([w, x, y, z]) => [w, -x, -y, -z];
export const quatNormalize = (q) => {
  const length = Math.hypot(...q) || 1;
  return q.map((value) => value / length);
};
/** Along the shorter great-circle arc from a to b, `share` (0-1) of the way: normalised lerp, accurate for the small steps used here. */
export const quatBlend = (a, b, share) => {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sign = dot < 0 ? -1 : 1;
  return quatNormalize(a.map((value, index) => value * (1 - share) + sign * b[index] * share));
};

/** A point (lon, lat in degrees) rotated by q. */
export const rotatePoint = (q, [lon, lat]) => {
  const x = Math.cos(lat * RAD) * Math.cos(lon * RAD);
  const y = Math.cos(lat * RAD) * Math.sin(lon * RAD);
  const z = Math.sin(lat * RAD);
  const [, rx, ry, rz] = quatMul(quatMul(q, [0, x, y, z]), quatInverse(q));
  return [Math.atan2(ry, rx) / RAD, Math.asin(Math.max(-1, Math.min(1, rz))) / RAD];
};

/** A GeoJSON geometry (Polygon or MultiPolygon) with every point rotated by q. */
export const rotateGeometry = (geometry, q) => {
  const ring = (points) => points.map((point) => rotatePoint(q, point));
  if (geometry.type === 'Polygon') return {type: 'Polygon', coordinates: geometry.coordinates.map(ring)};
  if (geometry.type === 'MultiPolygon') return {type: 'MultiPolygon', coordinates: geometry.coordinates.map((polygon) => polygon.map(ring))};
  throw new Error(`Cannot rotate a ${geometry.type}`);
};

/**
 * The rotation model: per plate, its segments (a run of rows against one fixed plate, ages rising).
 * A new segment starts where the fixed plate changes, so a plate can re-attach to another as time goes back.
 */
export const buildModel = (rows) => {
  const plates = new Map();
  for (const row of rows) {
    const segments = plates.get(row.plate) ?? [];
    const last = segments.at(-1);
    if (!last || last.fixed !== row.fixed || row.age < last.rows.at(-1).age) segments.push({fixed: row.fixed, rows: []});
    segments.at(-1).rows.push({age: row.age, q: quatFromPole(row.lat, row.lon, row.angle)});
    plates.set(row.plate, segments);
  }
  return plates;
};

/** A plate's rotation relative to the plate it is fixed to at `age` (Ma), and that plate's id; null when the model doesn't have the plate. */
export const relativeToFixed = (model, plate, age) => {
  const segments = model.get(plate);
  if (!segments) return null;
  const segment = segments.find(({rows}) => age >= rows[0].age && age <= rows.at(-1).age) ?? (age < segments[0].rows[0].age ? segments[0] : segments.at(-1));
  const {rows} = segment;
  if (age <= rows[0].age) return {fixed: segment.fixed, q: rows[0].q};
  if (age >= rows.at(-1).age) return {fixed: segment.fixed, q: rows.at(-1).q};
  const next = rows.findIndex((row) => row.age >= age);
  const share = (age - rows[next - 1].age) / (rows[next].age - rows[next - 1].age || 1);
  return {fixed: segment.fixed, q: quatBlend(rows[next - 1].q, rows[next].q, share)};
};

/** A plate's rotation in the absolute frame at `age`: its rotation against its fixed plate, then that plate's, up to the root. */
export const absolute = (model, plate, age, depth = 0) => {
  if (plate === 0 || depth > 20) return IDENTITY;
  const step = relativeToFixed(model, plate, age);
  if (!step) return IDENTITY;
  return quatNormalize(quatMul(absolute(model, step.fixed, age, depth + 1), step.q));
};

/** Absolute rotations of `plates` at each of `ages`, rounded: the compact table the renderer uses. */
export const sampleTable = (model, plates, ages) => ({
  ages,
  plates: Object.fromEntries(plates.map((plate) => [plate, ages.map((age) => absolute(model, plate, age).map((value) => Math.round(value * 1e6) / 1e6))])),
});

/** The table's absolute rotation of `plate` at `age` (Ma), blended between the sampled ages. */
export const tableRotation = (table, plate, age) => {
  const samples = table.plates[plate];
  if (!samples) return null;
  const {ages} = table;
  const clamped = Math.max(ages[0], Math.min(ages.at(-1), age));
  const next = ages.findIndex((value) => value >= clamped);
  if (next <= 0) return samples[0];
  const share = (clamped - ages[next - 1]) / (ages[next] - ages[next - 1]);
  return quatBlend(samples[next - 1], samples[next], share);
};

/** How `plate` sits against `fixed` at `age` (Ma): the rotation that carries it from today's place to where it was, with `fixed` held still. */
export const reconstruction = (table, plate, fixed, age) => {
  const moving = tableRotation(table, plate, age);
  const still = tableRotation(table, fixed, age);
  return moving && still ? quatNormalize(quatMul(quatInverse(still), moving)) : null;
};
