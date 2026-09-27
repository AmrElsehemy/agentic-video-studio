import React from 'react';
import {Img, interpolate, spring} from 'remotion';
import type {VideoManifest, VideoScene} from '../schema';
import {displayFont} from './typography';

// Shot library: one visual grammar per `scene.shot`. The compiler assigns
// shots from the archetype beats, so any story shape gets varied visuals.

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

export type ShotProps = {
  scene: VideoScene;
  manifest: VideoManifest;
  frame: number;
  durationInFrames: number;
  accent: string;
};

/** Shots that draw the scene headline themselves, large. */
export const HEADLINE_SHOTS = new Set<VideoScene['shot']>(['mystery', 'impact']);

export const Art: React.FC<{src: string; frame: number; size?: number; hidden?: boolean; rotate?: number}> = ({src, frame, size = 610, hidden = false, rotate = 0}) => {
  const enter = spring({frame, fps: 30, config: {damping: 13, stiffness: 150, mass: .8}});
  const float = Math.sin(frame / 10) * 11;
  return <Img src={src} style={{width: size, height: size, objectFit: 'contain', opacity: enter, transform: `translateY(${float + (1 - enter) * 90}px) rotate(${rotate}deg) scale(${0.72 + enter * 0.28})`, filter: `${hidden ? 'brightness(0)' : ''} drop-shadow(0 34px 38px rgba(0,0,0,.44))`}} />;
};

export const FactCard: React.FC<{text: string; index: number; frame: number; accent: string; compact?: boolean}> = ({text, index, frame, accent, compact = false}) => {
  const enter = spring({frame: frame - index * 7, fps: 30, config: {damping: 15, stiffness: 170}});
  return <div style={{padding: compact ? '14px 19px' : '20px 25px', borderRadius: compact ? 16 : 24, border: `2px solid ${accent}65`, background: `linear-gradient(${accent}1c, ${accent}1c), #000000a6`, fontFamily: displayFont, fontSize: compact ? 27 : 34, letterSpacing: 1.3, opacity: enter, transform: `translateY(${(1 - enter) * 26}px) scale(${.9 + enter * .1})`}}>{text}</div>;
};

const BigHeadline: React.FC<{text: string; frame: number}> = ({text, frame}) => {
  const enter = spring({frame, fps: 30, config: {damping: 14, stiffness: 180}});
  const size = Math.round(Math.min(124, Math.max(86, 124 * Math.sqrt(24 / Math.max(24, text.length)))));
  return <div style={{position: 'absolute', left: 40, right: 40, top: 20, fontFamily: displayFont, fontSize: size, lineHeight: .84, letterSpacing: 1, opacity: enter, transform: `translateY(${(1 - enter) * -40}px)`}}>{text}</div>;
};

const artworkOf = (scene: VideoScene, manifest: VideoManifest) => scene.artworkUrl ?? manifest.subject.artworkUrl;

/**
 * Two artworks to set against each other: the subject and the scene's own
 * artwork when they differ, otherwise the subject and its first evolution.
 */
export const artworkPair = (scene: VideoScene, manifest: VideoManifest): [string, string] | undefined => {
  const subject = manifest.subject.artworkUrl;
  const own = artworkOf(scene, manifest);
  if (own !== subject) return [subject, own];
  const evolved = manifest.evolutions[0]?.artworkUrl;
  return evolved && evolved !== subject ? [subject, evolved] : undefined;
};

/** Hook shot: the subject stays a silhouette, then is revealed. */
const MysteryShot: React.FC<ShotProps> = ({scene, manifest, frame, durationInFrames, accent}) => {
  const revealAt = Math.round(durationInFrames * .45);
  const hidden = scene.subjectFocus === 'hidden' || scene.subjectFocus === 'absent';
  const reveal = interpolate(frame, [revealAt - 4, revealAt + 6], [0, 1], clamp);
  const questionPulse = 1 + Math.sin(frame / 5) * .05;
  return <>
    <BigHeadline text={scene.headline} frame={frame} />
    <div style={{position: 'absolute', left: 0, right: 0, top: 360, display: 'flex', justifyContent: 'center'}}>
      <Art src={artworkOf(scene, manifest)} frame={frame} size={720} hidden={hidden && frame < revealAt} />
    </div>
    {hidden ? <div style={{position: 'absolute', left: 0, right: 0, top: 560, textAlign: 'center', fontFamily: displayFont, fontSize: 260, color: accent, opacity: 1 - reveal, transform: `scale(${questionPulse})`, textShadow: `0 0 60px ${accent}`}}>?</div> : null}
    {hidden ? <div style={{position: 'absolute', left: -200, right: -200, top: 200, height: 1100, background: `radial-gradient(circle at 50% 50%, ${accent}aa 0%, ${accent}33 30%, transparent 62%)`, opacity: interpolate(frame, [revealAt - 2, revealAt + 3, revealAt + 16], [0, 1, 0], clamp)}} /> : null}
  </>;
};

/** Punchy headline shot: big type, artwork bursting in from the corner. */
const ImpactShot: React.FC<ShotProps> = ({scene, manifest, frame, durationInFrames, accent}) => {
  const facts = scene.facts ?? [];
  const hidden = scene.subjectFocus === 'hidden';
  const revealAt = Math.round(durationInFrames * .34);
  const punch = interpolate(frame, [0, 5, 12], [1.12, .97, 1], clamp);
  return <>
    <BigHeadline text={scene.headline} frame={frame} />
    <div style={{position: 'absolute', right: -40, bottom: 20, transform: `scale(${punch})`}}><Art src={artworkOf(scene, manifest)} frame={frame - (hidden ? revealAt : 0)} hidden={hidden && frame < revealAt} size={760} rotate={-4} /></div>
    <div style={{position: 'absolute', left: 45, bottom: 95, width: 390, display: 'grid', gap: 12}}>{facts.map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} compact />)}</div>
  </>;
};

/** Close-up: oversized artwork cropped at the edge, facts stacked beside it. */
const MacroShot: React.FC<ShotProps> = ({scene, manifest, frame, accent}) => {
  const facts = scene.facts ?? [];
  const drift = interpolate(frame, [0, 150], [0, -30], clamp);
  return <>
    <div style={{position: 'absolute', left: -150 + drift, top: 40}}><Art src={artworkOf(scene, manifest)} frame={frame} size={940} rotate={3} /></div>
    <div style={{position: 'absolute', right: 40, top: 260, width: 400, display: 'grid', gap: 17}}>{facts.map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} />)}</div>
  </>;
};

/** Movement: artwork with a light sweep and facts along the bottom. */
const TrackingShot: React.FC<ShotProps> = ({scene, manifest, frame, durationInFrames, accent}) => {
  const facts = scene.facts ?? [];
  const sweep = interpolate(frame, [0, durationInFrames], [-260, 1000], clamp);
  const pan = interpolate(frame, [0, durationInFrames], [40, 110], clamp);
  return <>
    <div style={{position: 'absolute', left: pan, top: 85}}><Art src={artworkOf(scene, manifest)} frame={frame} size={640} /></div>
    <div style={{position: 'absolute', left: sweep, top: 690, width: 300, height: 12, borderRadius: 99, background: accent, boxShadow: `0 0 34px ${accent}`}} />
    <div style={{position: 'absolute', left: 55, right: 55, bottom: 105, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18}}>{facts.map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} />)}</div>
  </>;
};

/** Before/after: one artwork gives way to the other. Without a pair, the facts line up under the artwork. */
const ComparisonShot: React.FC<ShotProps> = (props) => {
  const {scene, manifest, frame, durationInFrames, accent} = props;
  const facts = scene.facts ?? [];
  const pair = artworkPair(scene, manifest);
  if (!pair) {
    return <>
      <div style={{position: 'absolute', left: 0, right: 0, top: 60, display: 'flex', justifyContent: 'center'}}><Art src={artworkOf(scene, manifest)} frame={frame} size={600} /></div>
      <div style={{position: 'absolute', left: 45, right: 45, top: 700, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18}}>{facts.map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} />)}</div>
    </>;
  }
  const [before, after] = pair;
  const switcher = interpolate(frame, [durationInFrames * .2, durationInFrames * .78], [0, 1], clamp);
  return <>
    <div style={{position: 'absolute', left: 35, top: 145, opacity: 1 - switcher, transform: `translateX(${-switcher * 130}px)`}}><Art src={before} frame={frame} size={500} /></div>
    <div style={{position: 'absolute', right: 20, top: 95, opacity: switcher, transform: `translateX(${(1 - switcher) * 150}px)`}}><Art src={after} frame={Math.max(0, frame - Math.round(durationInFrames * .3))} size={650} /></div>
    <div style={{position: 'absolute', left: 390, top: 430, fontFamily: displayFont, fontSize: 120, color: accent}}>→</div>
    <div style={{position: 'absolute', left: 55, right: 55, bottom: 105, display: 'flex', justifyContent: 'center', gap: 18}}>{facts.map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} />)}</div>
  </>;
};

/** Establishing shot: giant first fact behind large artwork, remaining facts listed. */
const WideShot: React.FC<ShotProps> = ({scene, manifest, frame, accent}) => {
  const facts = scene.facts ?? [];
  // The first fact becomes the backdrop only when others remain for the cards,
  // so a single fact is shown once, readably.
  const lead = facts.length >= 2 ? facts[0] : undefined;
  const cards = lead ? facts.slice(1) : facts;
  return <>
    {lead ? <div style={{position: 'absolute', left: -60, right: -60, top: 640, display: 'flex', justifyContent: 'center'}}><div style={{fontFamily: displayFont, fontSize: lead.length > 10 ? 170 : 260, lineHeight: .85, color: `${accent}2e`, letterSpacing: 8, transform: 'rotate(-7deg)', textAlign: 'center', whiteSpace: 'nowrap'}}>{lead}</div></div> : null}
    <div style={{position: 'absolute', right: -15, top: 55}}><Art src={artworkOf(scene, manifest)} frame={frame} size={790} rotate={-3} /></div>
    <div style={{position: 'absolute', left: 45, bottom: 90, width: 430, display: 'grid', gap: 14}}>{cards.map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} />)}</div>
  </>;
};

/** Verdict: two sides and a VS badge; with a single artwork, the options are stacked. */
const InteractionShot: React.FC<ShotProps> = ({scene, manifest, frame, accent}) => {
  const facts = (scene.facts ?? []).filter((fact) => fact.toUpperCase() !== 'VS');
  const pair = artworkPair(scene, manifest);
  const pulse = 1 + Math.sin(frame / 4) * .025;
  if (!pair) {
    return <>
      <div style={{position: 'absolute', left: 0, right: 0, top: 30, display: 'flex', justifyContent: 'center', transform: `scale(${pulse})`}}><Art src={artworkOf(scene, manifest)} frame={frame} size={600} /></div>
      <div style={{position: 'absolute', left: 90, right: 90, top: 680, display: 'grid', gap: 18}}>{facts.map((fact, i) => <FactCard key={fact} text={`${String.fromCharCode(65 + i)}  ${fact}`} index={i} frame={frame} accent={accent} />)}</div>
    </>;
  }
  const [left, right] = pair;
  return <>
    <div style={{position: 'absolute', left: -50, top: 165, transform: `scale(${pulse})`}}><Art src={left} frame={frame} size={520} /></div>
    <div style={{position: 'absolute', right: -65, top: 100, transform: `scale(${2 - pulse})`}}><Art src={right} frame={frame - 5} size={650} /></div>
    <div style={{position: 'absolute', left: 455, top: 410, width: 145, height: 145, borderRadius: '50%', background: accent, color: manifest.palette.background, display: 'grid', placeItems: 'center', fontFamily: displayFont, fontSize: 55, boxShadow: `0 0 55px ${accent}88`}}>VS</div>
    {facts.length >= 2 ? <>
      <div style={{position: 'absolute', left: 45, bottom: 100, width: 420}}><FactCard text={facts[0]} index={0} frame={frame} accent={accent} /></div>
      <div style={{position: 'absolute', right: 45, bottom: 100, width: 420, textAlign: 'right'}}><FactCard text={facts[facts.length - 1]} index={1} frame={frame} accent={accent} /></div>
    </> : null}
  </>;
};

const shots: Record<VideoScene['shot'], React.FC<ShotProps>> = {
  mystery: MysteryShot,
  impact: ImpactShot,
  macro: MacroShot,
  tracking: TrackingShot,
  comparison: ComparisonShot,
  wide: WideShot,
  interaction: InteractionShot,
};

export const ShotVisual: React.FC<ShotProps> = (props) => {
  const Shot = shots[props.scene.shot];
  return <Shot {...props} />;
};
