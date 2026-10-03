// Shaded relief (#91): the pinned source and the reprojection, shared by the
// build script (scripts/geo-relief.mjs) and its tests.
import crypto from 'node:crypto';

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

export const RELIEF = {
  url: 'https://naciscdn.org/naturalearth/10m/raster/SR_HR.zip',
  sha256: 'b2619fff2fc73c17152983c066adfaa25c4b626916b822bad2fae8bcd9be41a5',
  version: '2.0.0',
  /** SR_HR is 21600 × 10800: one pixel per arc-minute, from 180°W and 90°N. */
  pixelsPerDegree: 60,
  /** Flat ground and sea in SR_HR; shifted to neutral grey (128) so blending leaves them unchanged. */
  flat: 206,
  /** Contrast around neutral: slopes show without crushing shadows. */
  gain: 1.6,
  images: [
    // Everywhere, coarsely (4 arc-minutes): world and continent framings.
    {id: 'world', bbox: [-180, -60, 180, 80], downsample: 4},
    // Full detail where episodes zoom in.
    {id: 'southern-africa', bbox: [14, -36, 36, -20], downsample: 1},
    {id: 'caucasus', bbox: [34, 36, 54, 48], downsample: 1},
  ],
};

const RAD = Math.PI / 180;
export const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const inverseMercatorY = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;

/**
 * Reproject plate-carrée rows (`source`: width × height grey bytes spanning
 * north → south) to Web Mercator rows, keeping the width (Mercator x is linear
 * in longitude). The output is as tall as the Mercator span needs for square
 * pixels, and flat ground becomes neutral grey.
 */
export const reliefRows = (source, {width, height, south, north, flat, gain}) => {
  const degreesPerPixel = (north - south) / height;
  const pixelRadians = degreesPerPixel * RAD;
  const outHeight = Math.round((mercatorY(north) - mercatorY(south)) / pixelRadians);
  const pixels = Buffer.alloc(width * outHeight);
  const yNorth = mercatorY(north);
  for (let row = 0; row < outHeight; row++) {
    const lat = inverseMercatorY(yNorth - (row + .5) * pixelRadians);
    // Source row for this latitude (pixel centres), interpolated between neighbours.
    const at = Math.max(0, Math.min(height - 1, (north - lat) / degreesPerPixel - .5));
    const [above, below] = [Math.floor(at), Math.min(height - 1, Math.floor(at) + 1)];
    const mix = at - above;
    for (let column = 0; column < width; column++) {
      const value = source[above * width + column] * (1 - mix) + source[below * width + column] * mix;
      pixels[row * width + column] = Math.max(0, Math.min(255, Math.round(128 + (value - flat) * gain)));
    }
  }
  return {pixels, outHeight};
};
