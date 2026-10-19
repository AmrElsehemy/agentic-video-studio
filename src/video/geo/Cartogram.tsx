import React from 'react';
import {interpolate, spring} from 'remotion';
import {displayFont} from '../typography';
import {formatFigure} from './SeriesChart';
import {POP} from './motion';
import {FlagBadge} from './Flags';
import {discRadius} from './dorling';

// A Dorling cartogram (series view "cartogram"): the countries as circles whose area follows the World Bank population
// of the year shown, so the map is resized by people instead of by land. Circles grow and shrink in place as the years
// run. Positions are laid out once, from the largest size each circle reaches, so nothing ever overlaps and nothing
// jumps. Pure functions of the frame.

export type CartogramItem = {code: string; name: string; x: number; y: number; r: number; value: number; subject: boolean; flag?: string};

const text = {fontFamily: displayFont, letterSpacing: 2, fontVariantNumeric: 'tabular-nums' as const, textAnchor: 'middle' as const, dominantBaseline: 'middle' as const};
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
/** Frames between one circle starting and the next. */
const STAGGER = 3;

/** A font size that keeps `chars` letters inside a circle of this radius (about 0.55 of the size per letter, 85% of the width). */
const labelSize = (chars: number, radius: number, max: number) => Math.min(max, (2 * radius * 0.85) / (Math.max(1, chars) * 0.56));

/**
 * `items` carry the laid-out centre and the radius they reach at their biggest (`r`); the radius now follows `value`
 * against `reference` (the value that radius belongs to), so the area stays in proportion to the figure.
 */
export const Cartogram: React.FC<{
  /** Faint country outlines in the same projection as the circles' places. */
  outlines: {id: string; d: string}[];
  outlineTransform: string;
  items: CartogramItem[];
  year: number;
  frame: number;
  startFrame: number;
  fps: number;
  indicator: string;
  decimals: number;
  maxValue: number;
  maxRadius: number;
  accent: string;
  ink: string;
  backdrop: string;
  muted: string;
  width: number;
  height: number;
  top: number;
}> = ({outlines, outlineTransform, items, year, frame, startFrame, fps, indicator, decimals, maxValue, maxRadius, accent, ink, backdrop, muted, width, height, top}) => {
  const ordered = [...items].sort((a, b) => b.r - a.r);
  return <g>
    {/* The panel is cleared, and the countries are drawn faintly in the circles' own projection, so each circle is read against the place it came from. */}
    <rect x={0} y={0} width={width} height={height} fill={backdrop} opacity={interpolate(frame, [startFrame, startFrame + 10], [0, 1], clamp)} />
    <g opacity={interpolate(frame, [startFrame, startFrame + 16], [0, 0.22], clamp)} transform={outlineTransform}>{outlines.map((outline) => <path key={outline.id} d={outline.d} fill={ink} fillOpacity={0.35} stroke={ink} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />)}</g>
    {ordered.map((item, index) => {
      const begin = startFrame + index * STAGGER;
      const grow = Math.max(0, Math.min(1.05, spring({frame: frame - begin, fps, config: POP})));
      const radius = discRadius(item.value, maxValue, maxRadius) * grow;
      if (radius < 1) return null;
      const colour = item.subject ? accent : muted;
      const reveal = interpolate(frame, [begin, begin + 12], [0, 1], clamp);
      const id = `cartogram-${item.code}`;
      return <g key={item.code} opacity={Math.min(1, reveal * 1.4)}>
        <circle cx={item.x} cy={item.y} r={radius} fill={colour} fillOpacity={item.subject ? 0.85 : 0.55} stroke={item.subject ? ink : colour} strokeOpacity={0.9} strokeWidth={item.subject ? 4 : 2.5} />
        {item.flag && radius >= 22 ? <>
          <clipPath id={id}><circle cx={item.x} cy={item.y} r={Math.max(0, radius - 2.5)} /></clipPath>
          <image href={item.flag} x={item.x - radius * 1.35} y={item.y - radius} width={radius * 2.7} height={radius * 2} preserveAspectRatio="xMidYMid slice" opacity={0.45} clipPath={`url(#${id})`} />
        </> : null}
        {radius >= 26 ? <>
          <text x={item.x} y={item.y - (radius >= 60 ? 14 : 0)} textAnchor="middle" dominantBaseline="central" style={{...text, fontSize: labelSize(radius >= 60 ? item.name.length : item.code.length, radius, radius >= 60 ? 30 : 24), fill: ink, stroke: backdrop, strokeWidth: 7, paintOrder: 'stroke'}}>{radius >= 60 ? item.name.toUpperCase().slice(0, 14) : item.code}</text>
          {radius >= 60 ? <text x={item.x} y={item.y + 24} textAnchor="middle" dominantBaseline="central" style={{...text, fontSize: 30, fill: ink, stroke: backdrop, strokeWidth: 7, paintOrder: 'stroke'}}>{formatFigure(indicator, item.value, decimals)}</text> : null}
        </> : item.flag && radius >= 14 ? <FlagBadge id={`${item.code}-small`} href={item.flag} x={item.x} y={item.y} width={Math.max(24, radius * 1.5)} /> : null}
      </g>;
    })}
    <g opacity={interpolate(frame, [startFrame, startFrame + 10], [0, 1], clamp)}>
      <text x={width - 44} y={top + 40} textAnchor="end" style={{...text, textAnchor: 'end', fontSize: 120, fill: accent, stroke: backdrop, strokeWidth: 10, paintOrder: 'stroke'}}>{Math.round(year)}</text>
      <rect x={width / 2 - 250} y={top + 112} width={500} height={50} rx={25} fill={backdrop} opacity={0.88} />
      <text x={width / 2} y={top + 137} textAnchor="middle" dominantBaseline="central" style={{...text, fontSize: 26, fill: ink}}>CIRCLE AREA = POPULATION</text>
    </g>
  </g>;
};
