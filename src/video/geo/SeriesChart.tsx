import React from 'react';
import {interpolate} from 'remotion';
import {displayFont} from '../typography';
import {FlagBadge} from './Flags';
import {niceCeiling, niceRange, raceAt, valueAt, type Series} from '../../../scripts/lib/series.mjs';

// Yearly figures drawn over a map scene (shot `series`): a line chart that draws itself year by year, or a ranked
// race where countries overtake one another. Both read the pinned World Bank table, so every number on screen is
// sourced; pure functions of the frame, so renders stay deterministic.

export type SeriesPlace = {id: string; code: string; name: string; color: string; flag?: string};
/** The colour ramp of a shaded map, low to high; the chart's key and the map's fills share it. */
export const SHADE_RAMP = ['#1b1534', '#5b2a86', '#c13a74', '#f59e42', '#fbe59a'];
export const shadeColor = (t: number) => {
  const position = Math.max(0, Math.min(1, t)) * (SHADE_RAMP.length - 1);
  const index = Math.min(SHADE_RAMP.length - 2, Math.floor(position));
  const [a, b] = [SHADE_RAMP[index], SHADE_RAMP[index + 1]].map((hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)));
  const mix = position - index;
  return `rgb(${a.map((value, channel) => Math.round(value + (b[channel] - value) * mix)).join(',')})`;
};
export type ShadeKey = {low: string; high: string};

export type SeriesStyle = {accent: string; ink: string; backdrop: string; muted: string};

/** Height of the panel at the bottom of the frame; the map lifts by half of it. */
export const SERIES_PANEL = 640;
export const SERIES_SLIDE_FRAMES = 14;
const SAFE = 48;
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const ease = (x: number) => { const p = Math.max(0, Math.min(1, x)); return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2; };
const text = {fontFamily: displayFont, letterSpacing: 2, fontVariantNumeric: 'tabular-nums' as const};

/** A figure as the chart prints it: big counts compact (1.4B), money with a $, small numbers to their usual decimals. */
export const formatFigure = (indicator: string, value: number, decimals: number) => {
  if (indicator === 'population') return new Intl.NumberFormat('en-US', {notation: 'compact', maximumSignificantDigits: 3}).format(value);
  if (indicator === 'gdp-per-person') return `$${new Intl.NumberFormat('en-US', {notation: 'compact', maximumSignificantDigits: 3}).format(value)}`;
  return value.toFixed(decimals);
};

/** The year the chart is showing: held at `from` while the panel arrives, running to `to` by `end`, then held. */
export const yearAt = (frame: number, start: number, end: number, from: number, to: number) => from + (to - from) * ease((frame - start) / Math.max(1, end - start));

type Props = {
  indicator: string;
  title: string;
  unit: string;
  decimals: number;
  series: Series;
  places: SeriesPlace[];
  from: number;
  to: number;
  /** Line only: how the value axis is set, and a year to mark. */
  axis?: 'zero' | 'fit';
  mark?: {year: number; text: string};
  frame: number;
  startFrame: number;
  endFrame: number;
  width: number;
  height: number;
  style: SeriesStyle;
  credit: string;
  /** A shaded map's key: the ends of its scale. */
  shadeKey?: ShadeKey;
};

const Frame: React.FC<{props: Props; year: number; children: React.ReactNode}> = ({props, year, children}) => {
  const {frame, startFrame, width, height, style, title, unit, credit} = props;
  const slide = interpolate(frame, [startFrame, startFrame + SERIES_SLIDE_FRAMES], [1, 0], clamp);
  const top = height - SAFE - SERIES_PANEL + slide * (SERIES_PANEL + SAFE);
  return <g opacity={interpolate(frame, [startFrame, startFrame + 6], [0, 1], clamp)}>
    <rect x={SAFE - 22} y={top} width={width - 2 * (SAFE - 22)} height={SERIES_PANEL} rx={26} fill={style.backdrop} opacity={0.96} />
    <text x={SAFE} y={top + 56} style={{...text, fontSize: 36, fill: style.ink}}>{title.toUpperCase()}</text>
    <text x={SAFE} y={top + 92} style={{...text, fontSize: 24, fill: style.ink, opacity: 0.6}}>{unit.toUpperCase()}</text>
    <text x={width - SAFE} y={top + 84} textAnchor="end" style={{...text, fontSize: 96, fill: style.accent}}>{Math.round(year)}</text>
    {props.shadeKey ? <g transform={`translate(${width - SAFE - 330} ${top + 102})`}>
      <defs><linearGradient id="shade-ramp" x1="0" x2="1" y1="0" y2="0">{SHADE_RAMP.map((color, index) => <stop key={color} offset={index / (SHADE_RAMP.length - 1)} stopColor={color} />)}</linearGradient></defs>
      <rect width={330} height={16} rx={8} fill="url(#shade-ramp)" />
      <text y={42} style={{...text, fontSize: 22, fill: style.ink, opacity: 0.75}}>{props.shadeKey.low}</text>
      <text x={330} y={42} textAnchor="end" style={{...text, fontSize: 22, fill: style.ink, opacity: 0.75}}>{props.shadeKey.high}</text>
    </g> : null}
    <g transform={`translate(0 ${top})`}>{children}</g>
    <text x={SAFE} y={top + SERIES_PANEL - 16} style={{...text, fontSize: 22, fill: style.ink, opacity: 0.55}}>{credit.toUpperCase()}</text>
  </g>;
};

/** One to four countries as lines, drawn up to the current year; each line ends in a dot, its value and its name. */
export const LineChart: React.FC<Props> = (props) => {
  const {indicator, series, places, from, to, frame, startFrame, endFrame, width, style, decimals} = props;
  const year = yearAt(frame, startFrame + SERIES_SLIDE_FRAMES, endFrame, from, to);
  const first = Math.min(from, to);
  const last = Math.max(from, to);
  const all = places.flatMap((place) => { const out: number[] = []; for (let y = first; y <= last; y++) { const v = valueAt(series, place.code, y); if (v !== null) out.push(v); } return out; });
  const fit = props.axis === 'fit';
  const range = fit ? niceRange(Math.min(...all), Math.max(...all)) : undefined;
  const max = range ? range.high : niceCeiling(Math.max(...all, 1));
  const low = range ? range.low : indicator === 'life-expectancy' ? Math.floor(Math.min(...all) / 10) * 10 : 0;
  const plot = {left: SAFE + 100, right: width - SAFE - 250, top: props.shadeKey ? 190 : 150, bottom: SERIES_PANEL - 86};
  const x = (y: number) => plot.left + ((y - first) / Math.max(1, last - first)) * (plot.right - plot.left);
  const y = (v: number) => plot.bottom - ((v - low) / (max - low)) * (plot.bottom - plot.top);
  const ticks = range ? Array.from({length: Math.round((range.high - range.low) / range.step) + 1}, (_, i) => range.low + i * range.step) : [0, 0.5, 1].map((share) => low + (max - low) * share);
  const years = [first, Math.round((first + last) / 2), last];
  return <Frame props={props} year={year}>
    {ticks.map((tick) => <g key={tick}>
      <line x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} stroke={style.ink} strokeWidth={1.5} opacity={0.18} />
      <text x={plot.left - 12} y={y(tick) + 8} textAnchor="end" style={{...text, fontSize: 24, fill: style.ink, opacity: 0.6}}>{formatFigure(indicator, tick, indicator === 'life-expectancy' && !fit ? 0 : decimals)}</text>
    </g>)}
    {props.mark && year >= props.mark.year ? <g opacity={interpolate(year, [props.mark.year, props.mark.year + 0.5], [0, 1], clamp)}>
      <line x1={x(props.mark.year)} x2={x(props.mark.year)} y1={plot.top - 6} y2={plot.bottom} stroke={style.accent} strokeWidth={3} strokeDasharray="10 8" />
      <text x={x(props.mark.year)} y={plot.top - 14} textAnchor="middle" style={{...text, fontSize: 28, fill: style.accent}}>{props.mark.text.toUpperCase()}</text>
    </g> : null}
    {years.map((label) => <text key={label} x={x(label)} y={plot.bottom + 46} textAnchor="middle" style={{...text, fontSize: 24, fill: style.ink, opacity: 0.6}}>{label}</text>)}
    {(() => {
      const lines = places.flatMap((place) => {
        let d = '';
        let pen = false;
        let head: [number, number, number] | undefined;
        for (let step = first; step <= Math.min(Math.floor(year), last); step++) {
          const v = valueAt(series, place.code, step);
          if (v === null) { pen = false; continue; }
          d += `${pen ? 'L' : 'M'}${x(step).toFixed(1)} ${y(v).toFixed(1)}`;
          pen = true;
          head = [x(step), y(v), v];
        }
        // The line runs on to the fractional year so it never steps.
        const here = valueAt(series, place.code, Math.min(year, last));
        if (here !== null && year > first) { d += `${pen ? 'L' : 'M'}${x(year).toFixed(1)} ${y(here).toFixed(1)}`; head = [x(year), y(here), here]; }
        return head ? [{place, d, head}] : [];
      });
      // End labels stack: sorted top to bottom and pushed apart so a close pair never overprints.
      const LABEL = 92;
      const order = [...lines].sort((p, q) => p.head[1] - q.head[1]);
      const slots = new Map<string, number>();
      order.forEach((line, index) => slots.set(line.place.id, Math.max(line.head[1], index ? (slots.get(order[index - 1].place.id) ?? 0) + LABEL : plot.top)));
      const overflow = Math.max(0, ...order.map((line) => (slots.get(line.place.id) ?? 0) - (plot.bottom - 10)));
      return lines.map(({place, d, head}) => {
        const slot = (slots.get(place.id) ?? head[1]) - overflow;
        return <g key={place.id}>
          <path d={d} fill="none" stroke={place.color} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
          {Math.abs(slot - head[1]) > 14 ? <path d={`M${head[0] + 14} ${head[1]}L${head[0] + 30} ${slot - 14}`} stroke={place.color} strokeWidth={3} opacity={0.7} fill="none" /> : null}
          <circle cx={head[0]} cy={head[1]} r={13} fill={place.color} />
          <text x={head[0] + 34} y={slot - 8} style={{...text, fontSize: 40, fill: place.color}}>{formatFigure(indicator, head[2], decimals)}</text>
          <g transform={`translate(${head[0] + 34} ${slot})`}>{place.flag ? <FlagBadge id={place.id} href={place.flag} x={24} y={20} width={48} /> : null}
            <text x={place.flag ? 58 : 0} y={30} style={{...text, fontSize: 26, fill: style.ink}}>{place.name.toUpperCase().slice(0, 12)}</text></g>
        </g>;
      });
    })()}
  </Frame>;
};

const RACE_ROWS = 6;
const ROW = 74;

/** The highest countries each year, bars that grow and rows that slide past one another as the years run. */
export const RaceChart: React.FC<Props & {candidates: string[]; names: Map<string, string>; flags: Map<string, string | undefined>; subject?: string}> = (props) => {
  const {indicator, series, from, to, frame, startFrame, endFrame, width, style, decimals, candidates, names, flags, subject} = props;
  const year = yearAt(frame, startFrame + SERIES_SLIDE_FRAMES, endFrame, from, to);
  const rows = raceAt(series, candidates, year).filter((row) => row.rank < RACE_ROWS);
  const leader = Math.max(...rows.map((row) => row.value), 1);
  const barStart = SAFE + 380;
  const barMax = width - SAFE - barStart - 190;
  return <Frame props={props} year={year}>
    {rows.map((row) => {
      const yy = 130 + row.rank * ROW;
      const fade = interpolate(row.rank, [RACE_ROWS - 0.9, RACE_ROWS - 0.1], [1, 0], clamp);
      const name = names.get(row.code) ?? row.code;
      const flag = flags.get(row.code);
      const isSubject = row.code === subject;
      const length = Math.max(10, (row.value / leader) * barMax);
      return <g key={row.code} opacity={fade}>
        {flag ? <FlagBadge id={row.code} href={flag} x={SAFE + 34} y={yy + 34} width={60} /> : null}
        <text x={SAFE + (flag ? 82 : 0)} y={yy + 46} style={{...text, fontSize: 34, fill: isSubject ? style.accent : style.ink}}>{name.toUpperCase().slice(0, flag ? 14 : 16)}</text>
        <rect x={barStart} y={yy + 8} width={length} height={52} rx={26} fill={isSubject ? style.accent : style.muted} opacity={isSubject ? 1 : 0.85} />
        <text x={barStart + length + 14} y={yy + 46} style={{...text, fontSize: 36, fill: isSubject ? style.accent : style.ink}}>{formatFigure(indicator, row.value, decimals)}</text>
      </g>;
    })}
  </Frame>;
};
