// GeoMotion camera: framings are Web Mercator views (a centre and a scale), fitted
// to a box and interpolated between keyframes. Pure functions of the frame, so
// renders are deterministic.

export type BBox = [number, number, number, number];
/** Centre in degrees; scale in px per radian (d3-geo's Mercator scale). */
export type View = {lon: number; lat: number; scale: number};
export type Size = {width: number; height: number};
export type CameraKey = {view: View; at: number; ease: 'linear' | 'in-out'};

const RAD = Math.PI / 180;
/** Latitude range for "world" framings: Mercator inflates the poles, so they stay off screen. */
export const WORLD_LATS: [number, number] = [-50, 75];
export const WORLD_BBOX: BBox = [-180, WORLD_LATS[0], 180, WORLD_LATS[1]];
const MAX_LAT = 85;

const clampLat = (lat: number) => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
export const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (clampLat(lat) * RAD) / 2));
export const inverseMercatorY = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;
export const normalizeLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;
/** Width of a box in degrees; west > east means it crosses the antimeridian. */
export const lonSpan = (west: number, east: number) => (east >= west ? east - west : east + 360 - west);

/** The view that fits a box inside the frame, leaving `padding` (a fraction of each side) as margin. */
export const fitView = ([west, south, east, north]: BBox, {width, height}: Size, padding = .15): View => {
  const span = Math.max(lonSpan(west, east), .05) * RAD;
  const ySpan = Math.max(mercatorY(north) - mercatorY(south), .001);
  const scale = Math.min((width * (1 - 2 * padding)) / span, (height * (1 - 2 * padding)) / ySpan);
  return {lon: normalizeLon(west + lonSpan(west, east) / 2), lat: inverseMercatorY((mercatorY(north) + mercatorY(south)) / 2), scale};
};

/**
 * A world framing for a tall frame: it fills the height (latitudes WORLD_LATS),
 * centred on `lon` (where the camera is heading), rather than shrinking the
 * whole globe to fit the width.
 */
export const worldView = (lon: number, {height}: Size, padding = .05): View => ({
  lon: normalizeLon(lon),
  lat: inverseMercatorY((mercatorY(WORLD_LATS[0]) + mercatorY(WORLD_LATS[1])) / 2),
  scale: (height * (1 - 2 * padding)) / (mercatorY(WORLD_LATS[1]) - mercatorY(WORLD_LATS[0])),
});

/** The frame the map is drawn into: the scene's visual area (CompiledEpisodeScene: inset 300px 35px 245px on 1080×1920). */
export const MAP_SIZE: Size = {width: 1010, height: 1375};

type CameraTarget = 'world' | string | {bbox: BBox};
/**
 * A geo-map's camera keyframes as views. `boxOf` gives a place's camera box.
 * "world" is centred on the first specific place the camera visits.
 */
export const cameraKeys = (camera: {target: CameraTarget; at: number; padding: number; ease: 'linear' | 'in-out'}[], boxOf: (target: Exclude<CameraTarget, 'world'>) => BBox, size: Size = MAP_SIZE): CameraKey[] => {
  const destination = camera.find((key) => key.target !== 'world');
  const heading = destination ? fitView(boxOf(destination.target as Exclude<CameraTarget, 'world'>), size).lon : 20;
  return camera.map((key) => ({
    view: key.target === 'world' ? worldView(heading, size, Math.min(key.padding, .1)) : fitView(boxOf(key.target), size, key.padding),
    at: key.at,
    ease: key.ease,
  }));
};

const easeInOut = (t: number) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Interpolate two views: the centre moves the short way round the globe, in
 * Mercator space (so it tracks the map), and zoom changes geometrically (so a
 * 50× zoom feels even rather than rushing at the end).
 */
export const mixViews = (a: View, b: View, t: number): View => {
  let delta = normalizeLon(b.lon - a.lon);
  if (delta === -180 && b.lon > a.lon) delta = 180;
  const y = mercatorY(a.lat) + (mercatorY(b.lat) - mercatorY(a.lat)) * t;
  return {lon: normalizeLon(a.lon + delta * t), lat: inverseMercatorY(y), scale: a.scale * Math.pow(b.scale / a.scale, t)};
};

/** The camera at time `t` (0-1 through the scene): holds before the first key and after the last. */
export const cameraAt = (keys: CameraKey[], t: number): View => {
  if (t <= keys[0].at || keys.length === 1) return keys[0].view;
  for (let index = 0; index < keys.length - 1; index++) {
    const [from, to] = [keys[index], keys[index + 1]];
    if (t < to.at) {
      const progress = (t - from.at) / (to.at - from.at);
      return mixViews(from.view, to.view, to.ease === 'linear' ? progress : easeInOut(progress));
    }
  }
  return keys[keys.length - 1].view;
};
