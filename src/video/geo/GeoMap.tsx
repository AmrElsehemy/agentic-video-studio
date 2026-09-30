import React, {useMemo} from 'react';
import {geoCentroid, geoMercator, geoPath, type GeoProjection} from 'd3-geo';
import {evolvePath} from '@remotion/paths';
import {interpolate} from 'remotion';
import type {GeoAnchor, GeoMapPrimitive} from '../../../scripts/primitive-schema.mjs';
import type {ShotProps} from '../shots';
import {displayFont} from '../typography';
import {cameraAt, fitView, worldView, type BBox, type CameraKey, type Size} from './camera';
import {useGeoData, type GeoData} from './data';

// A map drawn entirely from the pinned data and the primitive: the camera flies
// between framings, places light up, labels, markers and arrows appear. Nothing
// here knows which episode or country it is drawing.

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
/** The visual area the scene gives primitives (CompiledEpisodeScene: inset 300px 35px 245px on 1080×1920). */
const SIZE: Size = {width: 1010, height: 1375};
/** Labels stay this far inside the edges so they never collide with the headline or caption. */
const SAFE = 48;
/** Frames an appearing layer takes to fade/draw in. */
const APPEAR = 12;
const TRACE_SHARE = .35;
/** Space an arrow leaves around an anchor without a label (at its start; 60% of it before its target). */
const ARROW_GAP = 60;
const LABEL_SIZE = 46;

const sameAnchor = (a: GeoAnchor, b: GeoAnchor) => (typeof a === 'string' || typeof b === 'string' ? a === b : a.lon === b.lon && a.lat === b.lat);

const targetBox = (target: Exclude<GeoMapPrimitive['camera'][number]['target'], 'world'>, data: GeoData): BBox => {
  if (typeof target === 'object') return target.bbox;
  const entity = data.entities.get(target);
  if (entity) return entity.bbox;
  const feature = data.features.get(target);
  if (!feature) throw new Error(`Unknown geo entity ${target}`);
  const [[west, south], [east, north]] = geoPath().bounds(feature);
  return [west, south, east, north];
};

/** Where an anchor sits in [lon, lat]: a country's label point, a sea's centroid, or a point. */
const anchorLonLat = (anchor: GeoAnchor, data: GeoData): [number, number] => {
  if (typeof anchor === 'object') return [anchor.lon, anchor.lat];
  const entity = data.entities.get(anchor);
  if (entity?.label) return entity.label;
  const feature = data.features.get(anchor);
  if (!feature) throw new Error(`Unknown geo entity ${anchor}`);
  return geoCentroid(feature);
};

const keepInside = ([x, y]: [number, number]): [number, number] => [Math.max(SAFE, Math.min(SIZE.width - SAFE, x)), Math.max(SAFE, Math.min(SIZE.height - SAFE, y))];

const Label: React.FC<{x: number; y: number; text: string; opacity: number; color: string; halo: string; size?: number}> = ({x, y, text, opacity, color, halo, size = LABEL_SIZE}) => (
  <text x={x} y={y + (1 - opacity) * 14} textAnchor="middle" dominantBaseline="middle" opacity={opacity}
    style={{fontFamily: displayFont, fontSize: size, letterSpacing: 3, fill: color, stroke: halo, strokeWidth: 10, paintOrder: 'stroke', strokeLinejoin: 'round'}}>{text}</text>
);

export const GeoMapVisual: React.FC<ShotProps & {data: GeoMapPrimitive}> = ({data: primitive, manifest, frame, durationInFrames, accent}) => {
  const data = useGeoData();
  const keys = useMemo<CameraKey[] | undefined>(() => {
    if (!data) return undefined;
    // "world" centres on the first specific place the camera visits.
    const destination = primitive.camera.find((key) => key.target !== 'world');
    const heading = destination ? fitView(targetBox(destination.target, data), SIZE).lon : 20;
    return primitive.camera.map((key) => ({view: key.target === 'world' ? worldView(heading, SIZE, Math.min(key.padding, .1)) : fitView(targetBox(key.target, data), SIZE, key.padding), at: key.at, ease: key.ease}));
  }, [data, primitive]);
  if (!data || !keys) return null;

  const t = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;
  const view = cameraAt(keys, t);
  const projection: GeoProjection = geoMercator().rotate([-view.lon, 0]).center([0, view.lat]).scale(view.scale).translate([SIZE.width / 2, SIZE.height / 2]);
  const path = geoPath(projection);
  const appear = (at: number, frames = APPEAR) => interpolate(frame, [at * durationInFrames, at * durationInFrames + frames], [0, 1], clamp);
  const point = (lonLat: [number, number]) => projection(lonLat) as [number, number];
  const {palette} = manifest;
  const labels = primitive.annotations.filter((annotation): annotation is Extract<GeoMapPrimitive['annotations'][number], {type: 'label'}> => annotation.type === 'label');

  return <svg width={SIZE.width} height={SIZE.height} viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} style={{position: 'absolute', inset: 0, borderRadius: 36, overflow: 'hidden'}}>
    <defs>
      <pattern id="geo-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="14" height="14" fill={accent} opacity=".25" />
        <line x1="0" y1="0" x2="0" y2="14" stroke={accent} strokeWidth="5" />
      </pattern>
    </defs>
    {/* Water is the background; land is every country, drawn from the pinned data. */}
    <rect width={SIZE.width} height={SIZE.height} fill={palette.background} />
    <rect width={SIZE.width} height={SIZE.height} fill={palette.secondary} opacity=".12" />
    <g>
      {data.countries.map((feature) => <path key={String(feature.id)} d={path(feature) ?? ''} fill={palette.surface} stroke={palette.ink} strokeOpacity=".28" strokeWidth={1.2} />)}
    </g>

    {primitive.highlights.map((highlight, index) => {
      const feature = data.features.get(highlight.entity);
      if (!feature) throw new Error(`Unknown geo entity ${highlight.entity}`);
      const d = path(feature) ?? '';
      const color = highlight.color ?? accent;
      const disputed = highlight.entity.startsWith('disputed:');
      if (highlight.style === 'trace') {
        const progress = interpolate(frame, [highlight.at * durationInFrames, (highlight.at + TRACE_SHARE) * durationInFrames], [0, 1], clamp);
        const {strokeDasharray, strokeDashoffset} = evolvePath(progress, d);
        return <g key={index}>
          <path d={d} fill={color} opacity={.22 * progress} />
          <path d={d} fill="none" stroke={color} strokeWidth={7} strokeLinejoin="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} style={{filter: `drop-shadow(0 0 10px ${color})`}} />
        </g>;
      }
      const shown = appear(highlight.at);
      return <path key={index} d={d} fill={highlight.style === 'fill' ? (disputed ? 'url(#geo-hatch)' : color) : 'none'} fillOpacity={.85 * shown}
        stroke={color} strokeOpacity={shown} strokeWidth={highlight.style === 'outline' ? 6 : 3} strokeLinejoin="round" style={{filter: `drop-shadow(0 0 ${14 * shown}px ${color})`}} />;
    })}

    {primitive.annotations.map((annotation, index) => {
      const shown = appear(annotation.at);
      if (annotation.type === 'arrow') {
        // Measured from where the anchors are drawn (labels are kept inside the frame).
        const from = keepInside(point(anchorLonLat(annotation.from, data)));
        const to = keepInside(point(anchorLonLat(annotation.to, data)));
        // A gentle upward arc (away from the caption) that leaves room at both ends:
        // the start clears any label on its anchor, the end stops short of the target.
        const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
        const length = Math.hypot(dx, dy) || 1;
        const [ux, uy] = [dx / length, dy / length];
        // Start and end just outside any label sitting on the anchor, or a fixed gap.
        const clearance = (anchor: GeoAnchor) => {
          const label = labels.find((item) => sameAnchor(item.anchor, anchor));
          if (!label) return ARROW_GAP;
          // Display-font capitals with 3px tracking run about 0.36em per character, halved.
          const [halfWidth, halfHeight] = [label.text.length * LABEL_SIZE * .36 + 20, LABEL_SIZE * .5 + 16];
          return Math.min(Math.abs(ux) > 1e-6 ? halfWidth / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? halfHeight / Math.abs(uy) : Infinity);
        };
        const startGap = Math.min(clearance(annotation.from), length * .62);
        const endGap = Math.min(clearance(annotation.to) * .6, length * .2);
        const start: [number, number] = [from[0] + ux * startGap, from[1] + uy * startGap];
        const end: [number, number] = [to[0] - ux * endGap, to[1] - uy * endGap];
        // Of the two perpendiculars, bend towards the one pointing up the screen.
        const [px, py] = ux <= 0 ? [uy, -ux] : [-uy, ux];
        const up: [number, number] = py <= 0 ? [px, py] : [-px, -py];
        const lift = Math.hypot(end[0] - start[0], end[1] - start[1]) * .28;
        const control: [number, number] = [(start[0] + end[0]) / 2 + up[0] * lift, (start[1] + end[1]) / 2 + up[1] * lift];
        const d = `M ${start[0]} ${start[1]} Q ${control[0]} ${control[1]} ${end[0]} ${end[1]}`;
        const progress = interpolate(frame, [annotation.at * durationInFrames, annotation.at * durationInFrames + 20], [0, 1], clamp);
        const {strokeDasharray, strokeDashoffset} = evolvePath(progress, d);
        const angle = Math.atan2(end[1] - control[1], end[0] - control[0]) * 180 / Math.PI;
        const [lx, ly] = keepInside([control[0], control[1] - 34]);
        return <g key={index}>
          <path d={d} fill="none" stroke={palette.ink} strokeWidth={8} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
          <polygon points="0,-16 30,0 0,16" fill={palette.ink} opacity={progress > .95 ? 1 : 0} transform={`translate(${end[0]} ${end[1]}) rotate(${angle})`} />
          {annotation.text ? <Label x={lx} y={ly} text={annotation.text} opacity={progress} color={palette.ink} halo={palette.background} size={36} /> : null}
        </g>;
      }
      const [x, y] = keepInside(point(anchorLonLat(annotation.anchor, data)));
      if (annotation.type === 'marker') {
        const pulse = 1 + .35 * Math.abs(Math.sin((frame - annotation.at * durationInFrames) / 8));
        return <g key={index} opacity={shown}>
          <circle cx={x} cy={y} r={22 * pulse} fill={accent} opacity={.25} />
          <circle cx={x} cy={y} r={11} fill={accent} stroke={palette.ink} strokeWidth={4} />
          {annotation.text ? <Label x={x} y={Math.max(SAFE, y - 58)} text={annotation.text} opacity={shown} color={palette.ink} halo={palette.background} size={38} /> : null}
        </g>;
      }
      return <Label key={index} x={x} y={y} text={annotation.text} opacity={shown} color={palette.ink} halo={palette.background} />;
    })}
  </svg>;
};
