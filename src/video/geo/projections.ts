import {geoAzimuthalEquidistant, geoConicEqualArea, geoEqualEarth, geoEqualEarthRaw, geoMercator, geoProjection, type GeoProjection} from 'd3-geo';
import type {Size, View} from './camera';

// The map projections a shot can use. The camera (camera.ts) thinks in Mercator views (a centre and a
// scale in px per radian); makeProjection turns the same view into any of these so the framings carry
// over. Each projection suits different stories:
//   mercator     the familiar web map; straight meridians, so lines and routes are simple. Inflates high latitudes.
//   equal-earth  the whole world with areas kept true: size comparisons, world-scale shots.
//   albers       a conic equal-area map: countries in the mid-latitudes (the USA, Canada, Russia, Brazil) keep their shape and size.
//   azimuthal    distances true from the centre: regional views around a place, polar views, distance rings.

export const PROJECTION_KINDS = ['mercator', 'equal-earth', 'albers', 'azimuthal'] as const;
export type ProjectionKind = (typeof PROJECTION_KINDS)[number];

/** Equal Earth is narrower than Mercator near the equator by this factor (px per radian of longitude, per unit of scale). */
export const EQUAL_EARTH_K = geoEqualEarthRaw(1, 0)[0];
/** Away from the equator a degree of longitude covers less ground; framings are widened by 1/cos(latitude), but never beyond this. */
const MIN_COS = 0.35;
/** Azimuthal views show this much of the sphere around the centre (degrees): the far side is hugely stretched. */
export const AZIMUTHAL_CLIP = 150;

const widen = (lat: number) => 1 / Math.max(MIN_COS, Math.cos((lat * Math.PI) / 180));

/**
 * The projection for a camera `view` in a frame of `size`, the centre of the view at the middle of the
 * frame (lifted by `lift` px, to leave room for a chart). A view that fills the frame in Mercator fills
 * it about the same in the others, near the centre.
 */
export const makeProjection = (kind: ProjectionKind, view: View, size: Size, lift = 0): GeoProjection => {
  const translate: [number, number] = [size.width / 2, size.height / 2 - lift];
  switch (kind) {
    case 'equal-earth':
      return geoEqualEarth().rotate([-view.lon, 0]).center([0, view.lat]).scale((view.scale * widen(view.lat)) / EQUAL_EARTH_K).translate(translate);
    case 'albers': {
      const spread = 6;
      return geoConicEqualArea().parallels([view.lat - spread, view.lat + spread]).rotate([-view.lon, 0]).center([0, view.lat]).scale(view.scale * widen(view.lat)).translate(translate).precision(0.1);
    }
    case 'azimuthal':
      return geoAzimuthalEquidistant().rotate([-view.lon, -view.lat]).scale(view.scale * widen(view.lat)).translate(translate).clipAngle(AZIMUTHAL_CLIP).precision(0.1);
    default:
      return geoMercator().rotate([-view.lon, 0]).center([0, view.lat]).scale(view.scale).translate(translate);
  }
};

/** Does the projection draw the whole world as a shape of its own (an egg, a disc) rather than filling the frame? */
export const hasSphereOutline = (kind: ProjectionKind) => kind === 'equal-earth' || kind === 'azimuthal';

/** Mercator cannot show the poles; the morph draws up to this latitude (degrees). */
const MORPH_MAX_LAT = 85;
/** Eases a scene's progress into the morph's mix: still at first, true by the end. */
export const morphMix = (t: number, from = .2, to = .8) => {
  const x = Math.max(0, Math.min(1, (t - from) / (to - from)));
  return x * x * (3 - 2 * x);
};

/**
 * A projection part-way from Mercator (mix 0) to Equal Earth (mix 1): every point is the blend of where
 * the two put it, so the map flows from one to the other and areas settle to their true size.
 */
export const makeMorphProjection = (view: View, size: Size, lift: number, mix: number): GeoProjection => {
  const w = 1 + (widen(view.lat) - 1) * mix;
  const raw = (lambda: number, phi: number): [number, number] => {
    const clamped = Math.max(-MORPH_MAX_LAT, Math.min(MORPH_MAX_LAT, (phi * 180) / Math.PI)) * (Math.PI / 180);
    const [ex, ey] = geoEqualEarthRaw(lambda, phi);
    return [lambda * (1 - mix) + ((ex / EQUAL_EARTH_K) * w) * mix, Math.log(Math.tan(Math.PI / 4 + clamped / 2)) * (1 - mix) + (ey / EQUAL_EARTH_K) * w * mix];
  };
  return geoProjection(raw).rotate([-view.lon, 0]).center([0, view.lat]).scale(view.scale).translate([size.width / 2, size.height / 2 - lift]);
};
