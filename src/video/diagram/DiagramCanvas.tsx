import {evolvePath, getLength, getPointAtLength} from '@remotion/paths';
import React from 'react';
import type {DiagramPrimitive} from '../../../scripts/primitive-schema.mjs';
import {MAP_SIZE} from '../geo/camera';
import {viewTransform} from '../canvas/camera';
import {laidOut} from '../../schema';
import type {ShotProps} from '../shots';
import {bodyFont, displayFont} from '../typography';
import {canvasState, type Entrance, type Layout} from './state';

// DiagramCanvas (#124): the episode's diagram, drawn as SVG on a canvas the
// camera moves over. Every element's look is a function of the canvas state at
// this frame (./state.ts), so the render is deterministic. Colours come from the
// episode's palette; the scene's accent marks highlights.

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const stage = (progress: number, from: number, to: number) => clamp01((progress - from) / (to - from));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** Overshoots by about 8% and settles, like the map's label pops. */
const backOut = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

const CORNER = 18;
/** An orthogonal polyline with rounded corners. */
export const edgePath = (points: [number, number][]) => {
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [prev, at, next] = [points[i - 1], points[i], points[i + 1]];
    const r = Math.min(CORNER, Math.hypot(at[0] - prev[0], at[1] - prev[1]) / 2, Math.hypot(next[0] - at[0], next[1] - at[1]) / 2);
    const into = [at[0] - Math.sign(at[0] - prev[0]) * r, at[1] - Math.sign(at[1] - prev[1]) * r];
    const out = [at[0] + Math.sign(next[0] - at[0]) * r, at[1] + Math.sign(next[1] - at[1]) * r];
    d += ` L ${into[0]} ${into[1]} Q ${at[0]} ${at[1]} ${out[0]} ${out[1]}`;
  }
  const end = points[points.length - 1];
  return `${d} L ${end[0]} ${end[1]}`;
};

/** Opacity, transform and stroke-draw share for an element arriving with `entrance`. */
const arrival = ({progress, anim}: Entrance) => {
  if (anim === 'pop') return {opacity: clamp01(progress * 3), scale: .6 + .4 * backOut(progress), outline: 1, fill: 1, text: 1, rise: 0};
  if (anim === 'fade') return {opacity: easeOut(progress), scale: 1, outline: 1, fill: 1, text: 1, rise: 0};
  // draw: the outline traces round, then the box fills and the text rises in.
  return {opacity: 1, scale: 1, outline: easeOut(stage(progress, 0, .6)), fill: stage(progress, .35, .75), text: easeOut(stage(progress, .45, 1)), rise: 10 * (1 - easeOut(stage(progress, .45, 1)))};
};

type Palette = {background: string; surface: string; ink: string; accent: string};

const NodeBox: React.FC<{node: {id: string; label: string; kind: string; detail?: string}; box: Layout['nodes'][string]; entrance: Entrance & {highlight: number}; palette: Palette}> = ({node, box, entrance, palette}) => {
  const look = arrival(entrance);
  const hl = entrance.highlight;
  const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
  const rows = node.detail ? {tag: 40, label: 92, detail: 132} : {tag: 40, label: 92};
  return <g opacity={look.opacity} transform={`translate(${cx} ${cy}) scale(${look.scale * (1 + .03 * hl)}) translate(${-cx} ${-cy})`}>
    {/* The highlight's glow sits behind the box. */}
    {hl > 0 ? <rect x={box.x - 6} y={box.y - 6} width={box.w + 12} height={box.h + 12} rx={30} fill={palette.accent} opacity={.35 * hl} style={{filter: 'blur(18px)'}} /> : null}
    <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={24} fill={palette.surface} opacity={look.fill} />
    {hl > 0 ? <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={24} fill={palette.accent} opacity={.14 * hl * look.fill} /> : null}
    <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={24} fill="none" stroke={palette.ink} strokeOpacity={.42} strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - look.outline} />
    {hl > 0 ? <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={24} fill="none" stroke={palette.accent} strokeWidth={5} opacity={hl} /> : null}
    <g opacity={look.text} transform={`translate(0 ${look.rise})`} textAnchor="middle">
      <text x={cx} y={box.y + rows.tag} fill={palette.accent} style={{fontFamily: bodyFont, fontSize: 19, fontWeight: 900, letterSpacing: 4}}>{node.kind.toUpperCase()}</text>
      <text x={cx} y={box.y + rows.label} fill={palette.ink} style={{fontFamily: displayFont, fontSize: 44, letterSpacing: .5}}>{node.label}</text>
      {node.detail ? <text x={cx} y={box.y + rows.detail!} fill={palette.ink} fillOpacity={.72} style={{fontFamily: bodyFont, fontSize: 25}}>{node.detail}</text> : null}
    </g>
  </g>;
};

const Edge: React.FC<{edge: {id: string; label?: string; style?: 'solid' | 'dashed'}; geometry: Layout['edges'][string]; state: {progress: number; highlight: number}; time: number; palette: Palette}> = ({edge, geometry, state, time, palette}) => {
  const d = edgePath(geometry.points);
  const draw = easeOut(state.progress);
  const evolved = evolvePath(draw, d);
  const end = geometry.points[geometry.points.length - 1];
  const head = stage(draw, .88, 1);
  const hl = state.highlight;
  const color = hl > .5 ? palette.accent : palette.ink;
  // A highlighted edge carries a pulse from source to target, as data flowing along it.
  const length = getLength(d);
  const pulse = hl > 0 ? getPointAtLength(d, ((time * 420) % length + length) % length) : null;
  return <g>
    {hl > 0 ? <path d={d} fill="none" stroke={palette.accent} strokeWidth={14} strokeLinecap="round" opacity={.25 * hl} style={{filter: 'blur(8px)'}} /> : null}
    <path d={d} fill="none" stroke={color} strokeOpacity={hl > .5 ? 1 : .7} strokeWidth={4 + 2 * hl} strokeLinecap="round" strokeLinejoin="round"
      {...(edge.style === 'dashed' ? {strokeDasharray: '14 12', opacity: draw} : {strokeDasharray: evolved.strokeDasharray, strokeDashoffset: evolved.strokeDashoffset})} />
    <path d={`M ${end[0] - 13} ${end[1] - 20} L ${end[0]} ${end[1] - 2} L ${end[0] + 13} ${end[1] - 20} Z`} fill={color} fillOpacity={hl > .5 ? 1 : .8} opacity={head} />
    {pulse ? <circle cx={pulse.x} cy={pulse.y} r={9} fill={palette.accent} opacity={hl} /> : null}
    {edge.label && geometry.labelAt ? <g opacity={stage(draw, .7, 1)}>
      <text x={geometry.labelAt[0]} y={geometry.labelAt[1] + 8} fill={palette.ink} fillOpacity={.8} style={{fontFamily: bodyFont, fontSize: 23, fontStyle: 'italic'}}>{edge.label}</text>
    </g> : null}
  </g>;
};

const GroupBox: React.FC<{label: string; box: Layout['groups'][string]; entrance: Entrance; palette: Palette}> = ({label, box, entrance, palette}) => {
  const shown = easeOut(entrance.progress);
  return <g opacity={shown}>
    <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={30} fill={palette.ink} fillOpacity={.04} stroke={palette.ink} strokeOpacity={.35} strokeWidth={2.5} strokeDasharray="12 10" />
    <text x={box.x + 24} y={box.y + 34} fill={palette.ink} fillOpacity={.7} style={{fontFamily: bodyFont, fontSize: 20, fontWeight: 900, letterSpacing: 4}}>{label.toUpperCase()}</text>
  </g>;
};

/** A faint dot grid that moves with the camera, so pans and zooms read as movement over a surface. */
const Grid: React.FC<{layout: Layout; ink: string}> = ({layout, ink}) => <>
  <defs><pattern id="diagram-grid" width={40} height={40} patternUnits="userSpaceOnUse"><circle cx={20} cy={20} r={2} fill={ink} fillOpacity={.13} /></pattern></defs>
  <rect x={-1500} y={-1500} width={layout.width + 3000} height={layout.height + 3000} fill="url(#diagram-grid)" />
</>;

export const DiagramCanvas: React.FC<ShotProps & {data: DiagramPrimitive}> = ({scene, manifest, frame, accent}) => {
  if (!manifest.diagram) return null;
  const index = manifest.scenes.findIndex((item) => item.id === scene.id);
  const state = canvasState(manifest, index, frame, manifest.format.fps);
  const {spec, layout} = laidOut(manifest);
  const palette: Palette = {background: manifest.palette.background, surface: manifest.palette.surface, ink: manifest.palette.ink, accent};
  return <div style={{position: 'absolute', inset: 0, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(transparent 0, #000 48px, #000 calc(100% - 48px), transparent 100%)'}}>
    <svg width={layout.width} height={layout.height} overflow="visible" style={{position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: viewTransform(state.camera, MAP_SIZE)}}>
      <Grid layout={layout} ink={palette.ink} />
      {spec.groups.filter((group) => state.groups[group.id] && layout.groups[group.id]).map((group) => <GroupBox key={group.id} label={group.label} box={layout.groups[group.id]} entrance={state.groups[group.id]} palette={palette} />)}
      {spec.edges.filter((edge) => state.edges[edge.id]).sort((a, b) => state.edges[a.id].start - state.edges[b.id].start)
        .map((edge) => <Edge key={edge.id} edge={edge} geometry={layout.edges[edge.id]} state={state.edges[edge.id]} time={state.time} palette={palette} />)}
      {/* Later arrivals draw on top, so a new node is never hidden under an older one. */}
      {spec.nodes.filter((node) => state.nodes[node.id]).sort((a, b) => state.nodes[a.id].start - state.nodes[b.id].start)
        .map((node) => <NodeBox key={node.id} node={node} box={layout.nodes[node.id]} entrance={state.nodes[node.id]} palette={palette} />)}
    </svg>
  </div>;
};
