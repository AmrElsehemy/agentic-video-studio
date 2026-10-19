// Satellite imagery from NASA GIBS (Global Imagery Browse Services), as stills a map scene can show by date.
// NASA imagery is free to use; NASA asks to be acknowledged, so every image carries its credit on screen.
// Tiles come from the Web Mercator WMTS, are stitched and cropped to the exact box, and stored under
// public/satellite/<set>/<date>.jpg, so a render never needs the network and a still never changes.

export const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export const TILE = 256;

/** The layers on offer: id, the tile grid GIBS publishes it on, its format, whether it is dated, and its credit. */
export const LAYERS = {
  'modis-terra': {id: 'MODIS_Terra_CorrectedReflectance_TrueColor', matrix: 'GoogleMapsCompatible_Level9', maxZoom: 9, ext: 'jpeg', dated: 'daily', credit: 'NASA EOSDIS GIBS · MODIS TERRA', title: 'MODIS Terra true colour (250 m)', first: '2000-02-24'},
  'viirs-snpp': {id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', matrix: 'GoogleMapsCompatible_Level9', maxZoom: 9, ext: 'jpeg', dated: 'daily', credit: 'NASA EOSDIS GIBS · VIIRS', title: 'VIIRS Suomi NPP true colour (250 m)', first: '2015-11-24'},
  'landsat-annual': {id: 'Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual', matrix: 'GoogleMapsCompatible_Level12', maxZoom: 12, ext: 'jpeg', dated: 'annual', credit: 'NASA EOSDIS GIBS · LANDSAT', title: 'Landsat WELD annual true colour (30 m)', first: '1983-12-01'},
  'night-lights': {id: 'VIIRS_Black_Marble', matrix: 'GoogleMapsCompatible_Level8', maxZoom: 8, ext: 'png', dated: 'annual', credit: 'NASA EOSDIS GIBS · BLACK MARBLE', title: 'VIIRS Black Marble night lights (500 m)', first: '2012-01-01'},
  'blue-marble': {id: 'BlueMarble_ShadedRelief_Bathymetry', matrix: 'GoogleMapsCompatible_Level8', maxZoom: 8, ext: 'jpeg', dated: 'none', credit: 'NASA EOSDIS GIBS · BLUE MARBLE', title: 'Blue Marble shaded relief and bathymetry (500 m)', first: undefined},
};

const mercatorY = (lat) => Math.asinh(Math.tan((lat * Math.PI) / 180));
/** Pixel position of a lon/lat on the whole-world Web Mercator image at `zoom`. */
export const worldPixel = (lon, lat, zoom) => {
  const size = TILE * 2 ** zoom;
  return {x: ((lon + 180) / 360) * size, y: ((1 - mercatorY(lat) / Math.PI) / 2) * size};
};

/** The highest zoom whose stitched, cropped image stays within `maxWidth` x `maxHeight` pixels, capped at the layer's own limit. */
export const chooseZoom = (bbox, layer, {maxWidth = 2400, maxHeight = 3200} = {}) => {
  const [west, south, east, north] = bbox;
  for (let zoom = layer.maxZoom; zoom >= 0; zoom--) {
    const a = worldPixel(west, north, zoom);
    const b = worldPixel(east, south, zoom);
    if (b.x - a.x <= maxWidth && b.y - a.y <= maxHeight) return zoom;
  }
  return 0;
};

/** The tiles that cover `bbox` at `zoom`, and where the box sits inside their mosaic: {columns, rows, crop: {x, y, width, height}}. */
export const tilePlan = (bbox, zoom) => {
  const [west, south, east, north] = bbox;
  const a = worldPixel(west, north, zoom);
  const b = worldPixel(east, south, zoom);
  const [x0, y0] = [Math.floor(a.x / TILE), Math.floor(a.y / TILE)];
  const [x1, y1] = [Math.floor((b.x - 1e-6) / TILE), Math.floor((b.y - 1e-6) / TILE)];
  return {
    columns: Array.from({length: x1 - x0 + 1}, (_, index) => x0 + index),
    rows: Array.from({length: y1 - y0 + 1}, (_, index) => y0 + index),
    crop: {x: Math.round(a.x - x0 * TILE), y: Math.round(a.y - y0 * TILE), width: Math.round(b.x - a.x), height: Math.round(b.y - a.y)},
  };
};

/** The tile address for a layer, date, zoom and tile. Undated layers have no date part. */
export const tileUrl = (layer, date, zoom, column, row) => `${GIBS}/${layer.id}/default/${layer.dated === 'none' ? '' : `${date}/`}${layer.matrix}/${zoom}/${row}/${column}.${layer.ext}`;

/** Position of a lon/lat inside a stored image of `bbox`, as fractions (0 to 1) across and down. The image is Web Mercator, so y follows the Mercator scale. */
export const fractionIn = (bbox, lon, lat) => {
  const [west, south, east, north] = bbox;
  return {x: (lon - west) / (east - west), y: (mercatorY(north) - mercatorY(lat)) / (mercatorY(north) - mercatorY(south))};
};

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
