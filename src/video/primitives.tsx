import React from 'react';
import {interpolate, spring} from 'remotion';
import type {Primitive} from '../../scripts/primitive-schema.mjs';
import type {VideoManifest} from '../schema';
import {Art, artworkPair, type ShotProps} from './shots';
import {DiagramCanvas} from './diagram/DiagramCanvas';
import {GeoMapVisual} from './geo/GeoMap';
import {bodyFont, displayFont} from './typography';

// Semantic visual primitives: each visualises an idea (a count, a threshold,
// a type change) from the data the Visual Director gives it. They draw inside
// the scene's visual area; the scene header shows the headline.

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export const TYPE_COLORS: Record<string, string> = {
  Normal: '#a8a77a', Fire: '#ee8130', Water: '#6390f0', Grass: '#7ac74c', Electric: '#f7d02c', Ice: '#96d9d6',
  Fighting: '#c22e28', Poison: '#a33ea1', Ground: '#e2bf65', Flying: '#a98ff3', Psychic: '#f95587', Bug: '#a6b91a',
  Rock: '#b6a136', Ghost: '#735797', Dragon: '#6f35fc', Dark: '#705746', Steel: '#b7b7ce', Fairy: '#d685ad',
};

/** Format a number the way it would be read: 999, 1,000, 2.8. */
export const formatNumber = (value: number) => (Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(1));

type PrimitiveProps<K extends Primitive['kind']> = ShotProps & {data: Extract<Primitive, {kind: K}>};

const Label: React.FC<{children: React.ReactNode; color?: string; size?: number; style?: React.CSSProperties}> = ({children, color, size = 34, style}) => <div style={{fontFamily: bodyFont, fontWeight: 900, fontSize: size, letterSpacing: 6, color, opacity: .82, ...style}}>{children}</div>;

/** A number climbing to its target, with tokens raining in; lands with a flash. */
const CounterPrimitive: React.FC<PrimitiveProps<'counter'>> = ({data, scene, manifest, frame, durationInFrames, accent}) => {
  const landAt = Math.round(durationInFrames * .7);
  const progress = ease(interpolate(frame, [4, landAt], [0, 1], clamp));
  const value = Math.round(data.from + (data.to - data.from) * progress);
  const land = spring({frame: frame - landAt, fps: 30, config: {damping: 9, stiffness: 220}});
  const tokens = Array.from({length: 14}, (_, i) => i);
  return <>
    {tokens.map((i) => {
      const start = i * 4;
      const fall = interpolate(frame, [start, start + 26], [-160, 250 + (i % 3) * 90], clamp);
      return <div key={i} style={{position: 'absolute', left: 40 + ((i * 137) % 900), top: fall, width: 64, height: 64, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #ffffffcc 0%, ${accent} 42%, ${accent}66 100%)`, border: `4px solid ${accent}`, boxShadow: `0 10px 26px #0008, 0 0 22px ${accent}66`, opacity: interpolate(frame, [start, start + 4, start + 26, start + 34], [0, 1, 1, .35], clamp), transform: `rotateY(${(frame - start) * 8}deg)`}} />;
    })}
    <div style={{position: 'absolute', left: 0, right: 0, top: 300, textAlign: 'center'}}>
      <div style={{fontFamily: displayFont, fontSize: value >= 10000 ? 210 : 270, lineHeight: .9, color: accent, textShadow: `0 18px 48px #000, 0 0 ${60 * land}px ${accent}`, transform: `scale(${.9 + .1 * land})`}}>{formatNumber(value)}</div>
      <Label style={{marginTop: 18}}>{data.label}</Label>
    </div>
    <div style={{position: 'absolute', left: 0, right: 0, top: 690, display: 'flex', justifyContent: 'center'}}><Art src={scene.artworkUrl ?? manifest.subject.artworkUrl} frame={frame - 6} size={520} /></div>
  </>;
};

/** A gauge draining (or filling) across a threshold; the artwork changes when it crosses. */
const MeterPrimitive: React.FC<PrimitiveProps<'meter'>> = ({data, scene, manifest, frame, durationInFrames, accent}) => {
  const endAt = Math.round(durationInFrames * .72);
  const value = data.from + (data.to - data.from) * ease(interpolate(frame, [6, endAt], [0, 1], clamp));
  const threshold = data.threshold;
  const falling = data.to < data.from;
  const crossed = threshold !== undefined && (falling ? value <= threshold : value >= threshold);
  // Frame at which the gauge reaches the threshold, kept inside the animation.
  const crossedAt = threshold === undefined ? endAt : Math.round(interpolate(Math.abs(threshold - data.from) / Math.max(1, Math.abs(data.to - data.from)), [0, 1], [6, endAt], clamp));
  const flash = crossed ? interpolate(frame, [crossedAt, crossedAt + 4, crossedAt + 18], [0, 1, 0], clamp) : 0;
  const pair = artworkPair(scene, manifest);
  const fill = value > 50 ? '#56e39f' : value > 25 ? '#f6c945' : '#ff5b5b';
  return <>
    <div style={{position: 'absolute', left: 0, right: 0, top: 40, display: 'flex', justifyContent: 'center'}}>
      <div style={{position: 'relative'}}>
        <div style={{opacity: pair && crossed ? 0 : 1}}><Art src={pair ? pair[0] : scene.artworkUrl ?? manifest.subject.artworkUrl} frame={frame} size={560} /></div>
        {pair ? <div style={{position: 'absolute', inset: 0, opacity: crossed ? 1 : 0, transform: `scale(${crossed ? 1 + flash * .08 : .9})`}}><Art src={pair[1]} frame={frame - crossedAt} size={560} /></div> : null}
      </div>
    </div>
    <div style={{position: 'absolute', left: -200, right: -200, top: -100, height: 1000, background: `radial-gradient(circle at 50% 40%, ${accent}aa 0%, transparent 55%)`, opacity: flash}} />
    <div style={{position: 'absolute', left: 60, right: 60, top: 700}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18}}>
        <Label>{data.label}</Label>
        <div style={{fontFamily: displayFont, fontSize: 110, lineHeight: .9, color: crossed ? accent : '#fff'}}>{Math.round(value)}%</div>
      </div>
      <div style={{position: 'relative', height: 74, borderRadius: 99, background: '#ffffff18', border: '4px solid #ffffff40', overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${value}%`, background: fill, boxShadow: `0 0 34px ${fill}`}} />
      </div>
      {threshold !== undefined ? <>
        <div style={{position: 'absolute', left: `${threshold}%`, top: 118, height: 110, width: 0, borderLeft: `6px dashed ${accent}`}} />
        <div style={{position: 'absolute', left: `calc(${threshold}% - 200px)`, top: 240, width: 400, textAlign: 'center', fontFamily: displayFont, fontSize: 46, color: accent, transform: `scale(${1 + flash * .25})`}}>{data.thresholdLabel ?? `${threshold}%`}</div>
      </> : null}
    </div>
  </>;
};

/** Values side by side, growing in (or swapping from a previous value). */
const BarsPrimitive: React.FC<PrimitiveProps<'bars'>> = ({data, frame, durationInFrames, accent, manifest}) => {
  const max = Math.max(...data.bars.flatMap((bar) => [bar.value, bar.from ?? 0]), 1);
  const colors = [accent, manifest.palette.secondary, manifest.palette.primary, '#ffffff'];
  return <div style={{position: 'absolute', left: 50, right: 50, top: 150, display: 'grid', gap: 44}}>
    {data.bars.map((bar, i) => {
      const t = ease(interpolate(frame, [8 + i * 6, durationInFrames * .6 + i * 6], [0, 1], clamp));
      const exact = (bar.from ?? 0) + (bar.value - (bar.from ?? 0)) * t;
      // Whole-number data counts in whole numbers.
      const value = Number.isInteger(bar.value) && Number.isInteger(bar.from ?? 0) ? Math.round(exact) : Math.round(exact * 10) / 10;
      const color = colors[i % colors.length];
      const up = bar.from !== undefined && bar.value > bar.from;
      const down = bar.from !== undefined && bar.value < bar.from;
      return <div key={bar.label}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12}}>
          <div style={{fontFamily: displayFont, fontSize: 52, letterSpacing: 1}}>{bar.label}</div>
          <div style={{fontFamily: displayFont, fontSize: 64, color: down ? '#ff7a7a' : up ? '#7dffb2' : color}}>{formatNumber(value)}{data.unit ? <span style={{fontSize: 36, marginLeft: 8}}>{data.unit}</span> : null}{up ? ' ▲' : down ? ' ▼' : ''}</div>
        </div>
        <div style={{height: 54, borderRadius: 99, background: '#ffffff14', overflow: 'hidden'}}>
          <div style={{height: '100%', width: `${value / max * 100}%`, borderRadius: 99, background: `linear-gradient(90deg, ${color}99, ${color})`, boxShadow: `0 0 28px ${color}88`}} />
        </div>
      </div>;
    })}
  </div>;
};

const TypePill: React.FC<{type: string; frame: number; delay: number; struck?: number}> = ({type, frame, delay, struck = 0}) => {
  const enter = spring({frame: frame - delay, fps: 30, config: {damping: 12, stiffness: 190}});
  return <div style={{position: 'relative', padding: '20px 46px', borderRadius: 999, background: TYPE_COLORS[type] ?? '#888', color: '#fff', fontFamily: displayFont, fontSize: 64, letterSpacing: 2, textShadow: '0 3px 10px #0007', boxShadow: `0 14px 34px #0008, 0 0 30px ${TYPE_COLORS[type] ?? '#888'}77`, opacity: enter * (1 - struck * .55), transform: `scale(${.6 + enter * .4})`}}>
    {type.toUpperCase()}
    {struck ? <div style={{position: 'absolute', left: -10, right: -10, top: '50%', height: 8, background: '#fff', borderRadius: 9, transform: `scaleX(${struck}) rotate(-8deg)`}} /> : null}
  </div>;
};

/** A type change: the old types, then the new ones, with the artwork changing if there is a pair. */
const TypeShiftPrimitive: React.FC<PrimitiveProps<'type-shift'>> = ({data, scene, manifest, frame, durationInFrames, accent}) => {
  const switchAt = Math.round(durationInFrames * .38);
  const removed = data.from.filter((type) => !data.to.includes(type));
  const strike = interpolate(frame, [switchAt - 6, switchAt + 2], [0, 1], clamp);
  const pair = artworkPair(scene, manifest);
  const swap = interpolate(frame, [switchAt - 2, switchAt + 8], [0, 1], clamp);
  return <>
    <div style={{position: 'absolute', left: 0, right: 0, top: 10, display: 'flex', justifyContent: 'center'}}>
      <div style={{position: 'relative'}}>
        <div style={{opacity: pair ? 1 - swap : 1}}><Art src={pair ? pair[0] : scene.artworkUrl ?? manifest.subject.artworkUrl} frame={frame} size={540} /></div>
        {pair ? <div style={{position: 'absolute', inset: 0, opacity: swap}}><Art src={pair[1]} frame={frame - switchAt} size={540} /></div> : null}
      </div>
    </div>
    <div style={{position: 'absolute', left: 0, right: 0, top: 600, display: 'flex', justifyContent: 'center', gap: 26}}>
      {data.from.map((type, i) => <TypePill key={`from-${type}`} type={type} frame={frame} delay={4 + i * 5} struck={removed.includes(type) ? strike : 0} />)}
    </div>
    <div style={{position: 'absolute', left: 0, right: 0, top: 720, textAlign: 'center', fontFamily: displayFont, fontSize: 110, color: accent, opacity: swap}}>↓</div>
    <div style={{position: 'absolute', left: 0, right: 0, top: 860, display: 'flex', justifyContent: 'center', gap: 26}}>
      {data.to.map((type, i) => <TypePill key={`to-${type}`} type={type} frame={frame} delay={switchAt + 4 + i * 6} />)}
    </div>
  </>;
};

const artworkNamed = (name: string, manifest: VideoManifest) => {
  const wanted = name.trim().toLowerCase();
  if (manifest.subject.name.toLowerCase() === wanted) return manifest.subject.artworkUrl;
  return manifest.related.find((item) => item.name.toLowerCase() === wanted)?.artworkUrl;
};

/** Ordered steps revealed one by one; a step named after the subject or a related subject shows its artwork. */
const TimelinePrimitive: React.FC<PrimitiveProps<'timeline'>> = ({data, manifest, frame, durationInFrames, accent}) => {
  const count = data.steps.length;
  const every = Math.max(8, Math.round(durationInFrames * .6 / count));
  const active = data.active ?? count - 1;
  const line = interpolate(frame, [0, every * (count - 1) + 6], [0, 1], clamp);
  const rowHeight = Math.min(300, 1180 / count);
  return <div style={{position: 'absolute', left: 60, right: 60, top: 40}}>
    <div style={{position: 'absolute', left: 88, top: rowHeight / 2, width: 8, height: (count - 1) * rowHeight * line, background: accent, borderRadius: 9, boxShadow: `0 0 24px ${accent}`}} />
    {data.steps.map((step, i) => {
      const enter = spring({frame: frame - i * every, fps: 30, config: {damping: 13, stiffness: 170}});
      const art = artworkNamed(step.label, manifest);
      const isActive = i === active;
      return <div key={`${step.label}-${i}`} style={{position: 'absolute', left: 0, right: 0, top: i * rowHeight, height: rowHeight, display: 'flex', alignItems: 'center', gap: 34, opacity: enter, transform: `translateX(${(1 - enter) * 80}px)`}}>
        <div style={{flex: '0 0 184px', height: 184, borderRadius: '50%', display: 'grid', placeItems: 'center', background: isActive ? `${accent}33` : '#ffffff10', border: `5px solid ${isActive ? accent : '#ffffff40'}`, boxShadow: isActive ? `0 0 40px ${accent}88` : 'none', overflow: 'hidden'}}>
          {art ? <Art src={art} frame={frame - i * every} size={170} /> : <div style={{fontFamily: displayFont, fontSize: 80, color: isActive ? accent : '#fff'}}>{i + 1}</div>}
        </div>
        <div>
          <div style={{fontFamily: displayFont, fontSize: isActive ? 76 : 62, lineHeight: .9, color: isActive ? accent : '#fff'}}>{step.label}</div>
          {step.detail ? <Label size={30} style={{marginTop: 10}}>{step.detail}</Label> : null}
        </div>
      </div>;
    })}
  </div>;
};

/** Requirements ruled out, then in: each item stamps ✕ or ✓. */
const ChecklistPrimitive: React.FC<PrimitiveProps<'checklist'>> = ({data, frame, durationInFrames, accent}) => {
  const every = Math.max(8, Math.round(durationInFrames * .55 / data.items.length));
  return <div style={{position: 'absolute', left: 70, right: 70, top: 130, display: 'grid', gap: 34}}>
    {data.items.map((item, i) => {
      const enter = spring({frame: frame - 4 - i * every, fps: 30, config: {damping: 12, stiffness: 190}});
      const stamp = spring({frame: frame - 10 - i * every, fps: 30, config: {damping: 9, stiffness: 240}});
      const color = item.met ? '#7dffb2' : '#ff7a7a';
      return <div key={item.label} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '30px 40px', borderRadius: 30, background: item.met ? `${accent}26` : '#ffffff0d', border: `4px solid ${item.met ? accent : '#ffffff30'}`, opacity: enter, transform: `translateY(${(1 - enter) * 40}px)`}}>
        <div style={{fontFamily: displayFont, fontSize: 66, letterSpacing: 1, color: item.met ? '#fff' : '#ffffffaa', textDecoration: item.met ? 'none' : 'line-through', textDecorationThickness: 5}}>{item.label}</div>
        <div style={{fontFamily: displayFont, fontSize: 96, color, transform: `scale(${stamp}) rotate(${(1 - stamp) * -30}deg)`}}>{item.met ? '✓' : '✕'}</div>
      </div>;
    })}
  </div>;
};

export const PrimitiveVisual: React.FC<ShotProps & {primitive: Primitive}> = ({primitive, ...props}) => {
  switch (primitive.kind) {
    case 'counter': return <CounterPrimitive {...props} data={primitive} />;
    case 'meter': return <MeterPrimitive {...props} data={primitive} />;
    case 'bars': return <BarsPrimitive {...props} data={primitive} />;
    case 'type-shift': return <TypeShiftPrimitive {...props} data={primitive} />;
    case 'timeline': return <TimelinePrimitive {...props} data={primitive} />;
    case 'checklist': return <ChecklistPrimitive {...props} data={primitive} />;
    case 'geo-map': return <GeoMapVisual {...props} data={primitive} />;
    case 'diagram': return <DiagramCanvas {...props} data={primitive} />;
  }
};

