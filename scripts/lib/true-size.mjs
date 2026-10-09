// True-size comparisons: a place copied onto another by rotating the sphere, so its area and shape stay
// exactly true (on a flat map a place only looks the right size when it is near the centre of an
// equal-area projection). Pure functions; the renderer uses them to slide the copy across the map.
import {IDENTITY, quatBlend, quatInverse, quatMul, quatNormalize} from './plates.mjs';

const RAD = Math.PI / 180;
const clamp = (value) => Math.max(-1, Math.min(1, value));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (v) => Math.hypot(...v);
const unit = (v) => v.map((value) => value / (length(v) || 1));

/** The point (lon, lat in degrees) as a unit vector. */
export const toVector = ([lon, lat]) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
/** Which way is north at a point, as a unit vector tangent to the sphere. */
const northAt = ([lon, lat]) => [-Math.sin(lat * RAD) * Math.cos(lon * RAD), -Math.sin(lat * RAD) * Math.sin(lon * RAD), Math.cos(lat * RAD)];
const axisAngle = (axis, angle) => [Math.cos(angle / 2), ...axis.map((value) => value * Math.sin(angle / 2))];
const rotateVector = (q, v) => quatMul(quatMul(q, [0, ...v]), quatInverse(q)).slice(1);

/** The shortest rotation that carries the point `from` onto the point `to`, about the axis perpendicular to both. */
export const alignRotation = (from, to) => {
  const [a, b] = [toVector(from), toVector(to)];
  const cosine = clamp(dot(a, b));
  if (cosine > 1 - 1e-12) return IDENTITY;
  let axis = cross(a, b);
  if (length(axis) < 1e-12) axis = cross(a, Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
  return axisAngle(unit(axis), Math.acos(cosine));
};

/**
 * The rotation that carries `from` onto `to` and keeps the shape "north up" there: after the shortest
 * move, the shape is turned about its new centre until its north points north again (moving along a
 * great circle otherwise leaves it tilted). Area and shape are unchanged by it.
 */
export const trueSizeRotation = (from, to) => {
  const move = alignRotation(from, to);
  const carried = rotateVector(move, northAt(from));
  const north = northAt(to);
  const axis = toVector(to);
  const turn = Math.atan2(dot(axis, cross(carried, north)), dot(carried, north));
  return quatNormalize(quatMul(axisAngle(axis, turn), move));
};

/** The rotation `share` (0-1) of the way: the identity at 0, the whole move at 1. */
export const partialRotation = (q, share) => quatBlend(IDENTITY, q, share);
