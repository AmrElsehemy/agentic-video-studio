import React, {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, interpolate, staticFile} from 'remotion';
import {displayFont} from '../typography';
import {MAP_SIZE} from './camera';
import {photoPlacement} from './photoPlacement';
import {fractionIn, stampOf} from './satellite';

// A NASA satellite still filling the map panel (a `satellite` annotation; scripts/satellite.mjs): one or more dates of a
// stored set, either cross-fading one after another or wiped as before/after. The still is georeferenced, so a mark is a
// place name at its true position. Its date and NASA credit are part of the picture.

type Still = {layerKey: string; title: string; credit: string};
type SetMeta = {bbox: [number, number, number, number]; width: number; height: number; caption?: string; dates: Record<string, Still>};
export type SatelliteSpec = {set: string; dates: string[]; mode: 'fade' | 'swipe'; marks: {lon: number; lat: number; text: string}[]; at: number; until?: number};

let setsLoading: Promise<Record<string, SetMeta>> | undefined;
const loadSets = () => setsLoading ??= fetch(staticFile('satellite/index.json')).then((response) => {
  if (!response.ok) throw new Error(`satellite/index.json failed to load (${response.status}). Run: npm run satellite -- add <set> ...`);
  return response.json() as Promise<{sets: Record<string, SetMeta>}>;
}).then((loaded) => loaded.sets);

const preloaded = new Set<string>();
const preload = (href: string) => new Promise<void>((resolve, reject) => {
  if (preloaded.has(href)) return resolve();
  const image = new Image();
  image.onload = () => {preloaded.add(href); resolve();};
  image.onerror = () => reject(new Error(`Satellite still ${href} failed to load`));
  image.src = href;
});

const href = (set: string, date: string) => staticFile(`satellite/${set}/${date}.jpg`);

const useSet = (spec: SatelliteSpec): SetMeta | undefined => {
  const [meta, setMeta] = useState<SetMeta | undefined>();
  const [handle] = useState(() => delayRender('Loading satellite imagery'));
  useEffect(() => {
    loadSets().then(async (sets) => {
      const found = sets[spec.set];
      if (!found) throw new Error(`Unknown satellite set "${spec.set}". Add it with: npm run satellite -- add ${spec.set} ...`);
      await Promise.all(spec.dates.map((date) => preload(href(spec.set, date))));
      setMeta(found);
      continueRender(handle);
    }).catch((error) => cancelRender(error));
  }, [spec.set, spec.dates.join(','), handle]);
  return meta;
};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const FADE_FRAMES = 14;
const ease = (t: number) => t * t * (3 - 2 * t);

const pill = (extra: React.CSSProperties): React.CSSProperties => ({position: 'absolute', padding: '8px 22px', borderRadius: 24, backgroundColor: 'rgba(2,6,12,.72)', fontFamily: displayFont, color: '#ffffff', ...extra});

export const SatelliteScene: React.FC<{spec: SatelliteSpec; frame: number; durationInFrames: number}> = ({spec, frame, durationInFrames}) => {
  const meta = useSet(spec);
  if (!meta) return null;
  const [start, end] = [spec.at * durationInFrames, (spec.until ?? 1) * durationInFrames];
  const progress = interpolate(frame, [start, Math.max(end, start + 1)], [0, 1], clamp);
  const placed = photoPlacement(meta, 0.5, progress);
  const stampOfIndex = (index: number) => {
    const still = meta.dates[spec.dates[index]];
    return stampOf(spec.dates[index], Boolean(still && /annual|night-lights/.test(still.layerKey)));
  };
  const stillOf = (index: number) => meta.dates[spec.dates[index]];
  const layer = (index: number, opacity: number, clip?: string) => (
    <img key={spec.dates[index]} src={href(spec.set, spec.dates[index])} style={{position: 'absolute', left: placed.left, top: placed.top, width: placed.width, height: placed.height, maxWidth: 'none', opacity, clipPath: clip}} />
  );

  // What is on screen: the date being shown (the one with most opacity) drives the stamp and the credit.
  let layers: React.ReactNode;
  let active = 0;
  let divider: number | undefined;
  if (spec.mode === 'swipe') {
    // The earlier still fills the frame; the later one wipes in from the right, the divider travelling right to left.
    divider = 1 - ease(interpolate(progress, [0.12, 0.82], [0, 1], clamp));
    active = divider < 0.5 ? 1 : 0;
    layers = <>{layer(1, 1)}{layer(0, 1, `inset(0 ${(1 - divider) * 100}% 0 0)`)}</>;
  } else {
    const slot = spec.dates.length;
    const position = progress * slot;
    active = Math.min(slot - 1, Math.floor(position));
    const fadeFrames = FADE_FRAMES / Math.max(1, end - start);
    layers = spec.dates.map((date, index) => {
      if (index === 0) return layer(index, 1);
      const boundary = index / slot;
      return layer(index, interpolate(progress, [boundary - fadeFrames / 2, boundary + fadeFrames / 2], [0, 1], clamp));
    });
  }
  const stamp = stampOfIndex(active);
  const current = stillOf(active);
  const markIn = interpolate(frame, [start + 0.25 * (end - start), start + 0.25 * (end - start) + 12], [0, 1], clamp);

  return <div style={{position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: '#05080c'}}>
    {layers}
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 380, background: 'linear-gradient(to top, rgba(2,6,12,.78), rgba(2,6,12,0))'}} />
    <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 220, background: 'linear-gradient(to bottom, rgba(2,6,12,.55), rgba(2,6,12,0))'}} />
    {divider !== undefined ? <>
      <div style={{position: 'absolute', top: 0, bottom: 0, left: divider * MAP_SIZE.width - 2, width: 4, backgroundColor: '#ffffff', boxShadow: '0 0 18px rgba(0,0,0,.6)'}} />
      <div style={{position: 'absolute', top: '50%', left: divider * MAP_SIZE.width - 26, width: 52, height: 52, marginTop: -26, borderRadius: 26, backgroundColor: '#ffffff', boxShadow: '0 2px 14px rgba(0,0,0,.6)'}} />
    </> : null}
    {spec.marks.map((mark) => {
      const f = fractionIn(meta.bbox, mark.lon, mark.lat);
      const [x, y] = [placed.left + f.x * placed.width, placed.top + f.y * placed.height];
      if (x < 0 || x > MAP_SIZE.width || y < 0 || y > MAP_SIZE.height) return null;
      return <div key={mark.text} style={{position: 'absolute', left: x, top: y, opacity: markIn}}>
        <div style={{position: 'absolute', left: -9, top: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff', border: '3px solid #0b1117'}} />
        <div style={{position: 'absolute', left: 18, top: -22, whiteSpace: 'nowrap', fontFamily: displayFont, fontSize: 34, letterSpacing: 2, color: '#ffffff', textShadow: '0 2px 12px rgba(0,0,0,.85)'}}>{mark.text.toUpperCase()}</div>
      </div>;
    })}
    {stamp ? <div style={{position: 'absolute', left: 40, top: 36, fontFamily: displayFont, fontSize: 96, letterSpacing: 4, color: '#ffffff', textShadow: '0 3px 18px rgba(0,0,0,.75)'}}>{stamp}</div> : null}
    {meta.caption ? <div style={{position: 'absolute', left: 36, right: 36, bottom: 92, textAlign: 'center', fontFamily: displayFont, fontSize: 44, letterSpacing: 3, color: '#ffffff', textShadow: '0 2px 14px rgba(0,0,0,.7)'}}>{meta.caption.toUpperCase()}</div> : null}
    {current ? <div style={pill({left: 36, bottom: 30, fontSize: 24, letterSpacing: 2})}>{current.credit}</div> : null}
  </div>;
};
