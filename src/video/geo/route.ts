import {geoDistance, geoInterpolate} from 'd3-geo';
import {mixViews, type View} from './camera';

// Routes (#90): a path through places, computed along great circles (the
// shortest way across the globe), drawn a little more each frame with a
// marker at its head. Longitudes may jump across the antimeridian between
// samples; d3's projection cuts the line there, so it draws whole.

export type LonLat = [number, number];
/** Sampled points, the distance (radians) travelled at each, and the index of each stop in `points`. */
export type RouteLine = {points: LonLat[]; distances: number[]; stops: number[]};

/** Degrees between samples on each leg: smooth curves at any zoom without thousands of points. */
const STEP_DEGREES = 1;
const MIN_SAMPLES = 8;
const DEG = 180 / Math.PI;

/**
 * The route through `stops` as sampled points along great circles, the
 * distance (radians) travelled at each point, and where each stop falls.
 */
export const routeLine = (stops: LonLat[]): RouteLine => {
  const points: LonLat[] = [stops[0]];
  const distances = [0];
  const stopIndexes = [0];
  for (let index = 1; index < stops.length; index++) {
    const [from, to] = [stops[index - 1], stops[index]];
    const leg = geoDistance(from, to);
    const samples = Math.max(MIN_SAMPLES, Math.ceil(leg * DEG / STEP_DEGREES));
    const along = geoInterpolate(from, to);
    const start = distances[distances.length - 1];
    for (let step = 1; step <= samples; step++) {
      // Each leg ends exactly on its stop, so stop dots and labels line up.
      points.push(step === samples ? to : along(step / samples) as LonLat);
      distances.push(start + leg * step / samples);
    }
    stopIndexes.push(points.length - 1);
  }
  return {points, distances, stops: stopIndexes};
};

/** The part of the route drawn at `progress` (0–1 of its length), ending at the marker. */
export const partialRoute = (line: RouteLine, progress: number): {points: LonLat[]; head: LonLat} => {
  const total = line.distances[line.distances.length - 1];
  const target = Math.max(0, Math.min(1, progress)) * total;
  const next = line.distances.findIndex((distance) => distance >= target);
  if (next <= 0) return {points: [line.points[0]], head: line.points[0]};
  const [a, b] = [line.distances[next - 1], line.distances[next]];
  const head = geoInterpolate(line.points[next - 1], line.points[next])(b > a ? (target - a) / (b - a) : 1) as LonLat;
  return {points: [...line.points.slice(0, next), head], head};
};

const smoothstep = (value: number) => {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
};
/** The route's drawing speeds up and slows down at the ends, like the camera. */
export const routeProgress = (t: number, at: number, until: number) => smoothstep((t - at) / (until - at));

/** Scene time the follow camera takes to settle on the marker, and to hand back to the keyframes. */
export const FOLLOW_IN = .1;
export const FOLLOW_OUT = .15;

/**
 * How strongly the camera follows the marker at `t`: easing in as the route
 * starts, fully on it while it draws, easing out after it finishes. A route
 * that ends by FOLLOW_LATEST (schema) is fully handed back before the scene
 * ends, so a continuous camera picks up from the keyframes without a jump.
 */
export const followWeight = (t: number, at: number, until: number) => {
  const easeIn = (time: number) => smoothstep((time - at) / FOLLOW_IN);
  // A short route may finish before the camera fully settles: hand back from wherever it got to.
  return t < until ? easeIn(t) : easeIn(until) * (1 - smoothstep((t - until) / FOLLOW_OUT));
};

/** The camera with its centre pulled towards the marker; the zoom stays the keyframes'. */
export const followView = (view: View, head: LonLat, weight: number): View => (weight <= 0 ? view : mixViews(view, {lon: head[0], lat: head[1], scale: view.scale}, weight));
