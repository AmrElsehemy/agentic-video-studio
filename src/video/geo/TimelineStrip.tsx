import React from 'react';
import {interpolate, spring} from 'remotion';
import {displayFont} from '../typography';
import {POP} from './motion';

// A timeline strip for a map scene: 2-4 dated steps along the bottom, the ones already passed filled, the
// scene's own step lit, with a marker that travels from the step before to this one as the scene starts.
// Pure functions of the frame, so renders stay deterministic.

export const TIMELINE_HEIGHT = 170;
const SAFE = 48;
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const easeOut = (progress: number) => 1 - (1 - Math.max(0, Math.min(1, progress))) ** 3;

export type TimelineStep = {label: string; detail?: string};

/** Where the step `index` of `count` sits along the strip. */
export const stepX = (index: number, count: number, left: number, right: number) => (count === 1 ? (left + right) / 2 : left + ((right - left) * index) / (count - 1));

/** How far along the strip the marker is (in steps) `elapsed` frames into the scene: from the previous step to the active one. */
export const markerStep = (active: number, elapsed: number) => {
  const from = Math.max(0, active - 1);
  return from + (active - from) * easeOut(elapsed / 24);
};

export const TimelineStrip: React.FC<{
  steps: TimelineStep[];
  active: number;
  frame: number;
  startFrame: number;
  fps: number;
  width: number;
  height: number;
  accent: string;
  ink: string;
  backdrop: string;
  muted: string;
}> = ({steps, active, frame, startFrame, fps, width, height, accent, ink, backdrop, muted}) => {
  const slide = interpolate(frame, [startFrame, startFrame + 12], [1, 0], clamp);
  const top = height - SAFE - TIMELINE_HEIGHT + slide * (TIMELINE_HEIGHT + SAFE);
  const left = SAFE + 70;
  const right = width - SAFE - 70;
  const lineY = top + 92;
  const marker = markerStep(active, frame - startFrame);
  const markerX = stepX(0, steps.length, left, right) + ((stepX(steps.length - 1, steps.length, left, right) - stepX(0, steps.length, left, right)) * marker) / Math.max(1, steps.length - 1);
  const text = {fontFamily: displayFont, letterSpacing: 2, fontVariantNumeric: 'tabular-nums' as const};
  const pop = spring({frame: frame - startFrame, fps, config: POP});
  return <g opacity={interpolate(frame, [startFrame, startFrame + 6], [0, 1], clamp)}>
    <rect x={SAFE - 22} y={top} width={width - 2 * (SAFE - 22)} height={TIMELINE_HEIGHT} rx={26} fill={backdrop} opacity={0.88} />
    <line x1={left} x2={right} y1={lineY} y2={lineY} stroke={muted} strokeWidth={6} strokeLinecap="round" opacity={0.55} />
    <line x1={left} x2={markerX} y1={lineY} y2={lineY} stroke={accent} strokeWidth={8} strokeLinecap="round" />
    {steps.map((step, index) => {
      const x = stepX(index, steps.length, left, right);
      const passed = index < active;
      const current = index === active;
      return <g key={index}>
        <text x={x} y={top + 56} textAnchor="middle" style={{...text, fontSize: current ? 40 : 34, fill: current ? accent : ink, opacity: passed || current ? 1 : 0.55}}>{step.label.toUpperCase()}</text>
        <circle cx={x} cy={lineY} r={current ? 17 * Math.min(1.1, pop) : 12} fill={passed || current ? accent : backdrop} stroke={passed || current ? ink : muted} strokeWidth={passed || current ? 3 : 4} />
        {step.detail ? <text x={x} y={top + 142} textAnchor="middle" style={{...text, fontSize: 26, fill: ink, opacity: current ? 1 : 0.6}}>{step.detail.toUpperCase()}</text> : null}
      </g>;
    })}
    <circle cx={markerX} cy={lineY} r={9} fill={ink} />
  </g>;
};
