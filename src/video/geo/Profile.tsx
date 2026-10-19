import React, {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, interpolate, staticFile} from 'remotion';
import {displayFont} from '../typography';

// An elevation profile (a `profile` annotation; scripts/profiles.mjs): the height of the land under a path from NOAA's
// ETOPO 2022 model, filling in as a route is drawn on the map. The panel says how much the height is stretched, because a
// profile of hundreds of kilometres is always drawn far steeper than the land is.

export type ProfileData = {id: string; caption: string; stops: [number, number][]; samples: number; totalKm: number; highestM: number; highestAtKm: number; lowestM: number; lowestAtKm: number; distanceKm: number[]; elevationM: number[]; points: [number, number][]};

const profiles = new Map<string, Promise<ProfileData>>();
const loadProfile = (id: string) => {
  const found = profiles.get(id);
  if (found) return found;
  const loading = fetch(staticFile(`geo/profiles/${id}.json`)).then((response) => {
    if (!response.ok) throw new Error(`Profile ${id} failed to load (${response.status}). Add it with: npm run profiles -- add ${id} --path=...`);
    return response.json() as Promise<ProfileData>;
  });
  profiles.set(id, loading);
  return loading;
};

/** The profile `id`, loaded before the frame is drawn; undefined while loading (and when there is no `id`). */
export const useProfile = (id: string | undefined): ProfileData | undefined => {
  const [profile, setProfile] = useState<ProfileData | undefined>();
  const [handle] = useState(() => (id ? delayRender('Loading elevation profile') : undefined));
  useEffect(() => {
    if (!id) return;
    loadProfile(id).then((loaded) => {
      setProfile(loaded);
      if (handle !== undefined) continueRender(handle);
    }).catch((error) => cancelRender(error));
  }, [id, handle]);
  return profile;
};

export const PROFILE_PANEL = 560;
export const PROFILE_SLIDE_FRAMES = 14;
const SAFE = 48;
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const text = {fontFamily: displayFont, letterSpacing: 2, fontVariantNumeric: 'tabular-nums' as const};
const metres = (value: number) => `${new Intl.NumberFormat('en-US').format(Math.round(value))} M`;
const km = (value: number) => `${new Intl.NumberFormat('en-US').format(Math.round(value))} KM`;

/** The height axis: a tidy top (a whole tick step), a bottom just below the lowest point when the path dips under the sea, and ticks at whole steps. */
export const heightAxis = (low: number, high: number) => {
  const span = high - Math.min(0, low);
  const step = span > 6000 ? 2000 : span > 3000 ? 1000 : 500;
  const min = low < 0 ? -Math.ceil(-low / 250) * 250 : 0;
  const max = Math.max(step, Math.ceil(high / step) * step);
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step || 0; value <= max; value += step) ticks.push(value);
  return {min, max, step, ticks};
};

/** How far taller the picture is than the land: vertical pixels per metre over horizontal pixels per metre. */
export const exaggeration = (axisSpanM: number, chartHeight: number, totalKm: number, chartWidth: number) => (chartHeight / axisSpanM) / (chartWidth / (totalKm * 1000));

/** How far along the path the panel has got at `frame` (0 to 1): held at the start while the panel arrives, then eased to the end. */
export const profileProgress = (frame: number, startFrame: number, endFrame: number) => {
  const p = Math.max(0, Math.min(1, (frame - (startFrame + PROFILE_SLIDE_FRAMES)) / Math.max(1, endFrame - startFrame - PROFILE_SLIDE_FRAMES)));
  return p * p * (3 - 2 * p);
};

export const ProfilePanel: React.FC<{
  profile: ProfileData;
  progress: number;
  frame: number;
  startFrame: number;
  width: number;
  height: number;
  title?: string;
  accent: string;
  ink: string;
  backdrop: string;
}> = ({profile, progress, frame, startFrame, width, height, title, accent, ink, backdrop}) => {
  const slide = interpolate(frame, [startFrame, startFrame + PROFILE_SLIDE_FRAMES], [1, 0], clamp);
  const top = height - SAFE - PROFILE_PANEL + slide * (PROFILE_PANEL + SAFE);
  const axis = heightAxis(profile.lowestM, profile.highestM);
  const [left, right] = [SAFE + 80, width - SAFE - 14];
  const [chartTop, chartBottom] = [top + 190, top + PROFILE_PANEL - 78];
  const x = (distance: number) => left + (distance / profile.totalKm) * (right - left);
  const y = (elevation: number) => chartBottom - ((elevation - axis.min) / (axis.max - axis.min)) * (chartBottom - chartTop);
  const last = progress * (profile.samples - 1);
  const whole = Math.floor(last);
  const mix = last - whole;
  const head = whole >= profile.samples - 1 ? profile.elevationM[profile.samples - 1] : profile.elevationM[whole] + (profile.elevationM[whole + 1] - profile.elevationM[whole]) * mix;
  const headKm = whole >= profile.samples - 1 ? profile.totalKm : profile.distanceKm[whole] + (profile.distanceKm[whole + 1] - profile.distanceKm[whole]) * mix;
  const drawn = profile.elevationM.slice(0, whole + 1).map((elevation, index) => [x(profile.distanceKm[index]), y(elevation)] as const);
  if (whole < profile.samples - 1) drawn.push([x(headKm), y(head)]);
  const line = drawn.map(([px, py], index) => `${index ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const area = `${line} L${drawn[drawn.length - 1][0].toFixed(1)} ${chartBottom} L${left} ${chartBottom} Z`;
  const ticks = axis.ticks;
  const stretch = Math.round(exaggeration(axis.max - axis.min, chartBottom - chartTop, profile.totalKm, right - left));
  const showPeak = progress > 0.985;
  return <g opacity={interpolate(frame, [startFrame, startFrame + 6], [0, 1], clamp)}>
    <rect x={SAFE - 22} y={top} width={width - 2 * (SAFE - 22)} height={PROFILE_PANEL} rx={26} fill={backdrop} opacity={0.96} />
    <text x={SAFE} y={top + 58} style={{...text, fontSize: 36, fill: ink}}>{(title ?? profile.caption ?? 'ELEVATION').toUpperCase()}</text>
    <text x={SAFE} y={top + 96} style={{...text, fontSize: 24, fill: ink, opacity: 0.6}}>{`HEIGHT ABOVE THE SEA · ${km(profile.totalKm)} LONG`}</text>
    <text x={width - SAFE} y={top + 98} textAnchor="end" style={{...text, fontSize: 84, fill: accent}}>{metres(head)}</text>
    <text x={width - SAFE} y={top + 146} textAnchor="end" style={{...text, fontSize: 28, fill: ink, opacity: 0.7}}>{`${km(headKm)} FROM THE START`}</text>
    {ticks.map((value) => <g key={value}>
      <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke={ink} strokeOpacity={value === 0 ? 0.55 : 0.18} strokeWidth={value === 0 ? 2.5 : 1.5} />
      <text x={left - 12} y={y(value)} textAnchor="end" dominantBaseline="central" style={{...text, fontSize: 22, fill: ink, opacity: 0.7}}>{new Intl.NumberFormat('en-US').format(value)}</text>
    </g>)}
    <path d={area} fill={accent} fillOpacity={0.3} />
    <path d={line} fill="none" stroke={accent} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={drawn[drawn.length - 1][0]} cy={drawn[drawn.length - 1][1]} r={11} fill={ink} stroke={accent} strokeWidth={4} />
    {showPeak ? <g>
      <circle cx={x(profile.highestAtKm)} cy={y(profile.highestM)} r={9} fill={accent} stroke={ink} strokeWidth={3} />
      <text x={Math.min(right - 4, Math.max(left + 4, x(profile.highestAtKm)))} y={y(profile.highestM) - 24} textAnchor={x(profile.highestAtKm) > (left + right) / 2 ? 'end' : 'start'} style={{...text, fontSize: 28, fill: ink, stroke: backdrop, strokeWidth: 6, paintOrder: 'stroke'}}>{`HIGHEST ${metres(profile.highestM)}`}</text>
    </g> : null}
    <text x={left} y={chartBottom + 36} style={{...text, fontSize: 22, fill: ink, opacity: 0.65}}>0 KM</text>
    <text x={right} y={chartBottom + 36} textAnchor="end" style={{...text, fontSize: 22, fill: ink, opacity: 0.65}}>{km(profile.totalKm)}</text>
    <text x={SAFE} y={top + PROFILE_PANEL - 14} style={{...text, fontSize: 21, fill: ink, opacity: 0.55}}>{`NOAA ETOPO 2022 · HEIGHT STRETCHED ×${stretch} · NOT TO SCALE`}</text>
  </g>;
};
