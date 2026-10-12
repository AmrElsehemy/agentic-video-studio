import React from 'react';
import {interpolate} from 'remotion';
import {displayFont} from '../typography';

// One number that matters, rolled up on screen (shot `figure`): the value counts up from zero and settles with a small pulse,
// its unit beside it and a short caption under it. The value is a figure the research states; the count-up is only motion.
// A pure function of the frame, so renders stay deterministic.

export type FigureStyle = {accent: string; ink: string; backdrop: string};

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const easeOut = (x: number) => 1 - (1 - Math.max(0, Math.min(1, x))) ** 4;
const COUNT_FRAMES = 36;
const PANEL = {width: 800, height: 330};

/** The number as printed: grouped digits, the given decimals. */
export const formatCount = (value: number, decimals: number) => new Intl.NumberFormat('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(value);

/** The value shown `elapsed` frames after the reveal starts. */
export const countAt = (value: number, elapsed: number) => value * easeOut(elapsed / COUNT_FRAMES);

export const FigureReveal: React.FC<{value: number; unit?: string; text: string; decimals: number; frame: number; startFrame: number; width: number; height: number; style: FigureStyle}> = ({value, unit, text, decimals, frame, startFrame, width, height, style}) => {
  const elapsed = frame - startFrame;
  if (elapsed < 0) return null;
  const appear = interpolate(elapsed, [0, 8], [0, 1], clamp);
  const pulse = 1 + 0.045 * Math.sin(Math.min(1, Math.max(0, (elapsed - COUNT_FRAMES) / 14)) * Math.PI);
  const entry = 0.88 + 0.12 * easeOut(elapsed / 12);
  const final = formatCount(value, decimals);
  const size = Math.min(176, (PANEL.width - 80) / (final.length * 0.52 + (unit ? unit.length * 0.2 : 0)));
  const [cx, cy] = [width / 2, height * 0.7];
  return <g opacity={appear} transform={`translate(${cx} ${cy}) scale(${entry * pulse}) translate(${-cx} ${-cy})`}>
    <rect x={cx - PANEL.width / 2} y={cy - PANEL.height / 2} width={PANEL.width} height={PANEL.height} rx={34} fill={style.backdrop} opacity={0.93} />
    <rect x={cx - PANEL.width / 2} y={cy - PANEL.height / 2} width={PANEL.width} height={PANEL.height} rx={34} fill="none" stroke={style.accent} strokeWidth={4} opacity={0.8} />
    <text x={cx} y={cy + size * 0.2} textAnchor="middle" style={{fontFamily: displayFont, fontSize: size, letterSpacing: 2, fontVariantNumeric: 'tabular-nums', fill: style.accent}}>
      {formatCount(countAt(value, elapsed), decimals)}{unit ? <tspan dx={14} style={{fontSize: size * 0.34, fill: style.ink, letterSpacing: 3}}>{unit.toUpperCase()}</tspan> : null}
    </text>
    <text x={cx} y={cy + PANEL.height / 2 - 52} textAnchor="middle" style={{fontFamily: displayFont, fontSize: 38, letterSpacing: 4, fill: style.ink}}>{text.toUpperCase()}</text>
  </g>;
};
