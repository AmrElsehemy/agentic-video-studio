// A small reader for ESRI shapefiles that hold polygons (type 5): enough for GSHHG's coastlines.
// Returns each polygon record as {bbox, rings}, a ring being an array of [lon, lat]. The shapefile
// rule is that outer rings run clockwise and holes anticlockwise; GSHHG's L1 files hold land outlines
// (islands included), so every ring is returned as it is and the caller decides what a ring means.
import fs from 'node:fs';

/** @param {Buffer} buffer a whole .shp file @returns {{bbox: number[], rings: number[][][]}[]} */
export const readPolygons = (buffer) => {
  if (buffer.readInt32BE(0) !== 9994) throw new Error('Not a shapefile (bad file code).');
  const type = buffer.readInt32LE(32);
  if (type !== 5) throw new Error(`Expected polygons (shape type 5), got ${type}.`);
  const records = [];
  let offset = 100;
  while (offset + 8 <= buffer.length) {
    const words = buffer.readInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + words * 2;
    offset = end;
    if (buffer.readInt32LE(start) === 0) continue; // a null shape
    const bbox = [buffer.readDoubleLE(start + 4), buffer.readDoubleLE(start + 12), buffer.readDoubleLE(start + 20), buffer.readDoubleLE(start + 28)];
    const parts = buffer.readInt32LE(start + 36);
    const points = buffer.readInt32LE(start + 40);
    const partsAt = start + 44;
    const pointsAt = partsAt + parts * 4;
    const rings = [];
    for (let part = 0; part < parts; part++) {
      const from = buffer.readInt32LE(partsAt + part * 4);
      const to = part + 1 < parts ? buffer.readInt32LE(partsAt + (part + 1) * 4) : points;
      const ring = new Array(to - from);
      for (let index = from; index < to; index++) ring[index - from] = [buffer.readDoubleLE(pointsAt + index * 16), buffer.readDoubleLE(pointsAt + index * 16 + 8)];
      rings.push(ring);
    }
    records.push({bbox, rings});
  }
  return records;
};

export const readShapefile = (file) => readPolygons(fs.readFileSync(file));
