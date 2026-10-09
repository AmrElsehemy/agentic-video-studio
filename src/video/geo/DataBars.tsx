import React from 'react';
import {interpolate, spring} from 'remotion';
import {displayFont} from '../typography';
import {POP} from './motion';

// A ranked bar chart for a data layer (view "bars" or "both"): the places a dataset covers, longest
// bar first, the episode's subject in the accent colour, bars growing and numbers counting up row by
// row. Pure functions of the frame, so renders stay deterministic.

export type BarRow = {id: string; name: string; value: number; subject: boolean};

const ROW = 80;
const MAX_ROWS = 5;
const HEAD = 84;
const FOOT = 44;
const SAFE = 48;
/** Frames between one row starting and the next. */
const STAGGER = 4;
/** Frames the panel takes to slide in. */
export const PANEL_FRAMES = 14;

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const easeOut = (progress: number) => 1 - (1 - Math.max(0, Math.min(1, progress))) ** 3;

/** The rows to show: the longest bars, with the subject kept even when it is small. */
export const barRows = (rows: BarRow[]): BarRow[] => {
  const sorted = [...rows].sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : 1));
  const top = sorted.slice(0, MAX_ROWS);
  const subject = sorted.find((row) => row.subject);
  return subject && !top.includes(subject) ? [...top.slice(0, MAX_ROWS - 1), subject] : top;
};

/** How tall the panel is for `count` rows. */
export const panelHeight = (count: number) => HEAD + Math.min(count, MAX_ROWS) * ROW + FOOT;

/** A value as the chart prints it while it counts up: big ones compact (1.4B, 144M, 18.5M), whole ones with commas, small ones to a decimal. */
export const formatBar = (value: number, final: number) => {
  if (final >= 100000) return new Intl.NumberFormat('en-US', {notation: 'compact', maximumFractionDigits: 1}).format(value);
  return Number.isInteger(final) || final >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(1);
};

export const DataBars: React.FC<{
  label: string;
  rows: BarRow[];
  frame: number;
  startFrame: number;
  fps: number;
  width: number;
  height: number;
  accent: string;
  ink: string;
  backdrop: string;
  muted: string;
}> = ({label, rows: all, frame, startFrame, fps, width, height, accent, ink, backdrop, muted}) => {
  const rows = barRows(all);
  const panel = panelHeight(rows.length);
  const slide = interpolate(frame, [startFrame, startFrame + PANEL_FRAMES], [1, 0], clamp);
  const top = height - SAFE - panel + slide * (panel + SAFE);
  const left = SAFE;
  const nameWidth = 300;
  const barStart = left + nameWidth;
  const barMax = width - SAFE - barStart - 150;
  const max = Math.max(...rows.map((row) => row.value));
  const text = {fontFamily: displayFont, letterSpacing: 2, fontVariantNumeric: 'tabular-nums' as const};
  return <g opacity={interpolate(frame, [startFrame, startFrame + 6], [0, 1], clamp)}>
    <rect x={left - 22} y={top} width={width - 2 * (SAFE - 22)} height={panel} rx={26} fill={backdrop} opacity={0.86} />
    <text x={left} y={top + 54} style={{...text, fontSize: 38, fill: ink}}>{label.toUpperCase()}</text>
    {rows.map((row, index) => {
      const rowStart = startFrame + PANEL_FRAMES + index * STAGGER;
      const grow = spring({frame: frame - rowStart, fps, config: POP});
      const progress = easeOut((frame - rowStart) / 22);
      const y = top + HEAD + index * ROW;
      const length = Math.max(8, (row.value / max) * barMax) * Math.max(0, Math.min(1.04, grow));
      const color = row.subject ? accent : muted;
      return <g key={row.id} opacity={frame >= rowStart ? 1 : 0}>
        <text x={left} y={y + 44} style={{...text, fontSize: 38, fill: row.subject ? accent : ink}}>{row.name.toUpperCase().slice(0, 13)}</text>
        <rect x={barStart} y={y + 10} width={length} height={50} rx={25} fill={color} opacity={row.subject ? 1 : 0.8} />
        <text x={barStart + length + 16} y={y + 46} style={{...text, fontSize: 38, fill: row.subject ? accent : ink}}>{formatBar(row.value * progress, row.value)}</text>
      </g>;
    })}
    <text x={left} y={top + panel - 14} style={{...text, fontSize: 22, fill: ink, opacity: 0.55}}>SOURCE: NATURAL EARTH, APPROXIMATE</text>
  </g>;
};
