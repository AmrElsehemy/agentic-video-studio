import {MAP_SIZE, mercatorY, type Size, type View} from './camera';

// Shaded relief (#91): where each relief image (public/geo/relief/, stored in
// Web Mercator rows with its box) sits on the map for a camera view. The maths
// matches the renderer's projection, geoMercator().rotate([-lon, 0]).center([0, lat]):
// x is linear in longitude, y in Mercator latitude, both at the view's scale.

export type ReliefImage = {file: string; bbox: [number, number, number, number]; width: number; height: number};
export type ReliefManifest = {images: Record<string, ReliefImage>};
export type ReliefPlacement = {key: string; file: string; left: number; top: number; width: number; height: number};

const RAD = Math.PI / 180;
/** An image drawn wider than this (pixels) is so enlarged it would be a blur; a detailed one covers that zoom instead. */
export const MAX_RELIEF_PIXELS = 32768;
/** How strongly the relief shows over the map (soft-light blend). */
export const RELIEF_STRENGTH = .9;

/** The relief images to draw for `view`, coarsest first so finer ones sit on top. */
export const reliefPlacements = (manifest: ReliefManifest, view: View, size: Size = MAP_SIZE): ReliefPlacement[] => {
  const images = Object.entries(manifest.images).sort(([, a], [, b]) => (b.bbox[2] - b.bbox[0]) - (a.bbox[2] - a.bbox[0]));
  const placements: ReliefPlacement[] = [];
  for (const [id, image] of images) {
    const [west, south, east, north] = image.bbox;
    const width = (east - west) * RAD * view.scale;
    if (width > MAX_RELIEF_PIXELS) continue;
    const top = size.height / 2 - (mercatorY(north) - mercatorY(view.lat)) * view.scale;
    const height = (mercatorY(north) - mercatorY(south)) * view.scale;
    if (top > size.height || top + height < 0) continue;
    // The same image a turn of the globe either side, for views near the antimeridian.
    for (const turn of [-1, 0, 1]) {
      const left = size.width / 2 + (west + 360 * turn - view.lon) * RAD * view.scale;
      if (left > size.width || left + width < 0) continue;
      placements.push({key: `${id}:${turn}`, file: image.file, left, top, width, height});
    }
  }
  return placements;
};
