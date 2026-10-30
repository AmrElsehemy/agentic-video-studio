import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import type {GeoProjection} from 'd3-geo';
import {FINE_COAST} from '../../../scripts/lib/fine-coast.mjs';
import {inverseMercatorY, mercatorY, type View} from './camera';

// Fine coastlines (scripts/fine-coast.mjs, GSHHG, LGPL): sharper land outlines for close views, in 5-degree tiles
// loaded only where the camera goes. Wider than 14 degrees the map keeps Natural Earth's outline.

type Level = 'h' | 'f';
type Box = [number, number, number, number];
/** A tile's rings, each a flat [lon0, lat0, lon1, lat1, ...]. */
type Rings = number[][];

const tileCache = new Map<string, Rings>();
const tileLoading = new Map<string, Promise<Rings>>();
const LEVELS: Level[] = ['f', 'h'];
const RAD = 180 / Math.PI;

/** The longitude/latitude box a Web Mercator view shows in a frame of this size, widened by `pad` of its size. */
export const viewBox = (view: View, size: {width: number; height: number}, pad = 0.12): Box => {
  const halfLon = (size.width / 2 / view.scale) * RAD * (1 + pad);
  const y = mercatorY(view.lat);
  const halfY = (size.height / 2 / view.scale) * (1 + pad);
  return [view.lon - halfLon, inverseMercatorY(y - halfY), view.lon + halfLon, inverseMercatorY(y + halfY)];
};

/** Degrees of longitude a view spans. */
export const spanOf = (view: View, size: {width: number; height: number}) => (size.width / view.scale) * RAD;
/** How far past the frame the land is drawn: a panel or card can slide the map, so more of it shows at one edge. */
export const MARGIN = 0.4;

/** Which resolution a view this many degrees wide uses, if any. */
export const levelFor = (span: number): Level | undefined => LEVELS.find((level) => span <= FINE_COAST.levels[level].maxSpan);

/** The tiles of a level that a box touches. */
export const tilesIn = ([west, south, east, north]: Box): string[] => {
  const size = FINE_COAST.tile;
  const keys: string[] = [];
  for (let x = Math.floor(west / size); x <= Math.floor(east / size); x++) {
    for (let y = Math.floor(south / size); y <= Math.floor(north / size); y++) keys.push(`${x * size}_${y * size}`);
  }
  return keys;
};

/** Every `level/tile` a camera path needs, from views sampled along it. */
export const tilesNeeded = (viewAt: (t: number) => View, size: {width: number; height: number}, samples = 24): string[] => {
  const needed = new Set<string>();
  for (let index = 0; index <= samples; index++) {
    const view = viewAt(index / samples);
    const level = levelFor(spanOf(view, size));
    if (level) for (const key of tilesIn(viewBox(view, size, MARGIN))) needed.add(`${level}/${key}`);
  }
  return [...needed].sort();
};

type Index = {levels: Record<string, {tiles: string[]}>};
let indexLoading: Promise<Index> | undefined;
/** The tile list, so that a tile that was never written (open sea) is told from tiles that are missing. */
const loadIndex = () => indexLoading ??= fetch(staticFile('geo/fine/index.json')).then((response) => {
  if (!response.ok) throw new Error(`Fine coastline tiles are missing (geo/fine/index.json: ${response.status}). Run: npm run coast:fine`);
  return response.json() as Promise<Index>;
});

const loadTile = async (id: string): Promise<Rings> => {
  const index = await loadIndex();
  const [level, key] = id.split('/');
  if (!index.levels[level]?.tiles.includes(key)) { tileCache.set(id, []); return []; }
  let loading = tileLoading.get(id);
  if (!loading) {
    loading = fetch(staticFile(`geo/fine/${id}.json`)).then((response) => {
      if (!response.ok) throw new Error(`Fine coast tile ${id} failed to load (${response.status}). Run: npm run coast:fine`);
      return response.json() as Promise<Rings>;
    }).then((rings) => { tileCache.set(id, rings); return rings; });
    tileLoading.set(id, loading);
  }
  return loading;
};

/**
 * Loads the fine-coast tiles a shot's camera needs, holding the render until they have (nothing is loaded for a shot
 * that never gets within 14 degrees). `needed` is undefined until the camera path is known. Returns a changing token
 * once tiles are in so the shot redraws.
 */
export const useFineCoast = (needed: string[] | undefined): boolean => {
  const [handle] = useState(() => delayRender('Loading fine coast'));
  const [ready, setReady] = useState(false);
  const wanted = needed?.join(',');
  useEffect(() => {
    if (needed === undefined) return;
    let cancelled = false;
    const missing = needed.filter((id) => !tileCache.has(id));
    Promise.all(missing.map(loadTile)).then(() => {
      if (cancelled) return;
      setReady(true);
      continueRender(handle);
    }).catch((error) => cancelRender(error));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, handle]);
  return ready;
};

/**
 * The SVG path of the land in view, drawn through `projection`: the level's tiles that the box touches, each ring
 * projected point by point. Points under about half a pixel from the last one are dropped, so a wide view of a
 * detailed coast stays light.
 */
export const finePath = (projection: GeoProjection, box: Box, level: Level): string => {
  const parts: string[] = [];
  for (const key of tilesIn(box)) {
    const rings = tileCache.get(`${level}/${key}`);
    if (!rings) continue;
    for (const ring of rings) {
      let px = NaN;
      let py = NaN;
      let count = 0;
      let out = '';
      for (let index = 0; index < ring.length; index += 2) {
        const point = projection([ring[index], ring[index + 1]]);
        if (!point) continue;
        const [x, y] = point;
        if (count > 0 && Math.abs(x - px) + Math.abs(y - py) < 0.5) continue;
        out += `${count === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        px = x; py = y; count++;
      }
      if (count >= 3) parts.push(`${out}Z`);
    }
  }
  return parts.join('');
};
