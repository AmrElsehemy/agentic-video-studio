import React from 'react';
import {interpolate, spring} from 'remotion';
import {displayFont} from '../typography';
import {formatBar} from './DataBars';
import {POP} from './motion';

// A proportional-symbol map layer (data view "bubbles"): a circle on each place, its AREA in proportion to
// its value (so a place with four times the value has a circle twice as wide), the subject lit and the
// others muted, the biggest drawn first so small ones stay visible on top. Pure functions of the frame.

export type BubbleItem = {id: string; name: string; x: number; y: number; value: number; subject: boolean};

/** The biggest circle's radius (px) and the smallest any value gets, so a tiny value is still a visible dot. */
export const MAX_RADIUS = 118;
export const MIN_RADIUS = 9;

/** Radius for `value` against the largest value: area in proportion to value. */
export const bubbleRadius = (value: number, max: number) => (max > 0 ? Math.max(MIN_RADIUS, MAX_RADIUS * Math.sqrt(Math.max(0, value) / max)) : MIN_RADIUS);

/** Frames between one bubble starting and the next. */
const STAGGER = 4;
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

export const Bubbles: React.FC<{
  items: BubbleItem[];
  frame: number;
  startFrame: number;
  fps: number;
  accent: string;
  ink: string;
  backdrop: string;
  muted: string;
}> = ({items, frame, startFrame, fps, accent, ink, backdrop, muted}) => {
  const max = Math.max(...items.map((item) => item.value));
  const ordered = [...items].sort((a, b) => b.value - a.value);
  const text = {fontFamily: displayFont, letterSpacing: 2, fontVariantNumeric: 'tabular-nums' as const, textAnchor: 'middle' as const, dominantBaseline: 'middle' as const};
  return <g>
    {ordered.map((item, index) => {
      const begin = startFrame + index * STAGGER;
      const grow = Math.max(0, Math.min(1.06, spring({frame: frame - begin, fps, config: POP})));
      const radius = bubbleRadius(item.value, max) * grow;
      if (radius < 1) return null;
      const colour = item.subject ? accent : muted;
      const reveal = interpolate(frame, [begin, begin + 14], [0, 1], clamp);
      const inside = bubbleRadius(item.value, max) >= 54;
      const shown = formatBar(item.value * reveal, item.value);
      return <g key={item.id} opacity={Math.min(1, reveal * 1.4)}>
        <circle cx={item.x} cy={item.y} r={radius} fill={colour} fillOpacity={item.subject ? 0.85 : 0.5} stroke={item.subject ? ink : colour} strokeOpacity={0.9} strokeWidth={item.subject ? 4 : 3} />
        {inside
          ? <text x={item.x} y={item.y} style={{...text, fontSize: 38, fill: ink, stroke: backdrop, strokeWidth: 8, paintOrder: 'stroke'}}>{shown}</text>
          : <g>
            <rect x={item.x - (item.name.length * 11 + 30)} y={item.y - radius - 62} width={item.name.length * 22 + 60} height={52} rx={26} fill={backdrop} opacity={0.88} />
            <text x={item.x} y={item.y - radius - 36} style={{...text, fontSize: 28, fill: item.subject ? accent : ink}}>{item.name.toUpperCase().slice(0, 14)} {shown}</text>
          </g>}
      </g>;
    })}
  </g>;
};
