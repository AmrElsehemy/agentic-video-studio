import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VideoManifest, VideoScene} from '../schema';
import {bodyFont, displayFont} from './typography';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

type Props = {
  scene: VideoScene;
  manifest: VideoManifest;
  sceneIndex: number;
  sceneCount: number;
  durationInFrames: number;
};

const Art: React.FC<{src: string; frame: number; size?: number; hidden?: boolean; rotate?: number}> = ({src, frame, size = 610, hidden = false, rotate = 0}) => {
  const enter = spring({frame, fps: 30, config: {damping: 13, stiffness: 150, mass: .8}});
  const float = Math.sin(frame / 10) * 11;
  return <Img src={src} style={{width: size, height: size, objectFit: 'contain', opacity: enter, transform: `translateY(${float + (1 - enter) * 90}px) rotate(${rotate}deg) scale(${0.72 + enter * 0.28})`, filter: `${hidden ? 'brightness(0)' : ''} drop-shadow(0 34px 38px rgba(0,0,0,.44))`}} />;
};

const FactCard: React.FC<{text: string; index: number; frame: number; accent: string; compact?: boolean}> = ({text, index, frame, accent, compact = false}) => {
  const enter = spring({frame: frame - index * 7, fps: 30, config: {damping: 15, stiffness: 170}});
  return <div style={{padding: compact ? '14px 19px' : '20px 25px', borderRadius: compact ? 16 : 24, border: `2px solid ${accent}65`, background: `${accent}12`, fontFamily: displayFont, fontSize: compact ? 27 : 34, letterSpacing: 1.3, opacity: enter, transform: `translateY(${(1 - enter) * 26}px) scale(${.9 + enter * .1})`}}>{text}</div>;
};

const TransformationVisual: React.FC<{scene: VideoScene; manifest: VideoManifest; sceneIndex: number; frame: number; durationInFrames: number; accent: string}> = ({scene, manifest, sceneIndex, frame, durationInFrames, accent}) => {
  const subject = manifest.subject.artworkUrl;
  const evolved = manifest.evolutions[0]?.artworkUrl;
  const artwork = scene.artworkUrl ?? subject;
  const facts = scene.facts ?? [];

  if (sceneIndex === 0) {
    const revealAt = Math.round(durationInFrames * .34);
    return <>
      <div style={{position: 'absolute', left: 40, right: 40, top: 20, fontFamily: displayFont, fontSize: 124, lineHeight: .82, textAlign: 'left', letterSpacing: 1}}>{scene.headline}</div>
      <div style={{position: 'absolute', right: -40, bottom: 20}}><Art src={artwork} frame={frame - revealAt} hidden={scene.subjectFocus === 'hidden' && frame < revealAt} size={760} rotate={-4} /></div>
      <div style={{position: 'absolute', left: 45, bottom: 95, width: 390, display: 'grid', gap: 12}}>{facts.map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} compact />)}</div>
    </>;
  }

  if (sceneIndex === 1) {
    return <>
      <div style={{position: 'absolute', left: -65, top: 90}}><Art src={artwork} frame={frame} size={760} rotate={3} /></div>
      <div style={{position: 'absolute', right: 40, top: 180, width: 400, display: 'grid', gap: 17}}>{facts.map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} />)}</div>
      <div style={{position: 'absolute', right: 40, bottom: 100, width: 420, fontFamily: displayFont, fontSize: 82, lineHeight: .88, textAlign: 'right'}}>{scene.caption}</div>
    </>;
  }

  if (sceneIndex === 2) {
    const sweep = interpolate(frame, [0, durationInFrames], [-260, 1000], clamp);
    return <>
      <div style={{position: 'absolute', left: 70, top: 85}}><Art src={artwork} frame={frame} size={610} /></div>
      <div style={{position: 'absolute', left: sweep, top: 670, width: 300, height: 12, borderRadius: 99, background: accent, boxShadow: `0 0 34px ${accent}`}} />
      <div style={{position: 'absolute', left: 55, right: 55, bottom: 105, display: 'flex', justifyContent: 'center', gap: 18}}>{facts.map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} />)}</div>
    </>;
  }

  if (sceneIndex === 3 && evolved) {
    const switcher = interpolate(frame, [durationInFrames * .2, durationInFrames * .78], [0, 1], clamp);
    return <>
      <div style={{position: 'absolute', left: 35, top: 145, opacity: 1 - switcher, transform: `translateX(${-switcher * 130}px)`}}><Art src={subject} frame={frame} size={500} /></div>
      <div style={{position: 'absolute', right: 20, top: 95, opacity: switcher, transform: `translateX(${(1 - switcher) * 150}px)`}}><Art src={evolved} frame={Math.max(0, frame - Math.round(durationInFrames * .3))} size={650} /></div>
      <div style={{position: 'absolute', left: 390, top: 430, fontFamily: displayFont, fontSize: 120, color: accent}}>→</div>
      <div style={{position: 'absolute', left: 55, right: 55, bottom: 105, display: 'flex', justifyContent: 'center', gap: 18}}>{facts.map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} />)}</div>
    </>;
  }

  if (sceneIndex === 4) {
    return <>
      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}><div style={{fontFamily: displayFont, fontSize: 230, color: `${accent}16`, letterSpacing: 8, transform: 'rotate(-7deg)'}}>{facts[0] ?? 'EVOLVED'}</div></div>
      <div style={{position: 'absolute', right: -15, top: 55}}><Art src={artwork} frame={frame} size={790} rotate={-3} /></div>
      <div style={{position: 'absolute', left: 45, bottom: 90, width: 430, display: 'grid', gap: 14}}>{facts.slice(1).map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} />)}</div>
    </>;
  }

  if (sceneIndex === 5 && evolved) {
    const pulse = 1 + Math.sin(frame / 4) * .025;
    return <>
      <div style={{position: 'absolute', left: -50, top: 165, transform: `scale(${pulse})`}}><Art src={subject} frame={frame} size={520} /></div>
      <div style={{position: 'absolute', right: -65, top: 100, transform: `scale(${2 - pulse})`}}><Art src={evolved} frame={frame - 5} size={650} /></div>
      <div style={{position: 'absolute', left: 455, top: 410, width: 145, height: 145, borderRadius: '50%', background: accent, color: manifest.palette.background, display: 'grid', placeItems: 'center', fontFamily: displayFont, fontSize: 55, boxShadow: `0 0 55px ${accent}88`}}>VS</div>
    </>;
  }

  return <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}><Art src={artwork} frame={frame} size={650} /></div>;
};

const GenericVisual: React.FC<{scene: VideoScene; manifest: VideoManifest; sceneIndex: number; frame: number; durationInFrames: number; accent: string}> = ({scene, manifest, sceneIndex, frame, durationInFrames, accent}) => {
  const artwork = scene.artworkUrl ?? manifest.subject.artworkUrl;
  const facts = scene.facts ?? [];
  const alignRight = sceneIndex % 2 === 0;
  const revealAt = Math.round(durationInFrames * .35);
  return <>
    <div style={{position: 'absolute', [alignRight ? 'right' : 'left']: -30, top: sceneIndex === 0 ? 40 : 105}}><Art src={artwork} frame={frame - (sceneIndex === 0 ? revealAt : 0)} hidden={scene.subjectFocus === 'hidden' && frame < revealAt} size={sceneIndex === 0 ? 740 : 620} rotate={alignRight ? -3 : 3} /></div>
    <div style={{position: 'absolute', [alignRight ? 'left' : 'right']: 45, bottom: 95, width: 400, display: 'grid', gap: 14}}>{facts.map((fact, i) => <FactCard key={fact} text={fact} index={i} frame={frame} accent={accent} />)}</div>
  </>;
};

export const CompiledEpisodeScene: React.FC<Props> = ({scene, manifest, sceneIndex, sceneCount, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const accent = scene.accent ?? manifest.palette.primary;
  const enter = spring({frame, fps, config: {damping: 17, stiffness: 155}});
  const exit = interpolate(frame, [Math.max(0, durationInFrames - 8), durationInFrames], [1, 0], clamp);
  const progress = (sceneIndex + frame / Math.max(1, durationInFrames)) / sceneCount;
  const pattern = manifest.direction.storyPattern;
  const glow = pattern === 'mechanic' ? '#f4c84d' : pattern === 'transformation' ? manifest.palette.secondary : pattern === 'mystery' ? '#a875ff' : accent;
  const showNumber = Boolean(manifest.direction.numberRelevant);

  return <AbsoluteFill style={{overflow: 'hidden', color: manifest.palette.ink, background: `radial-gradient(circle at ${sceneIndex % 2 ? '25%' : '75%'} 38%, ${glow}30 0%, transparent 38%), linear-gradient(160deg, ${manifest.palette.surface}, ${manifest.palette.background} 64%)`, opacity: exit, fontFamily: bodyFont}}>
    <div style={{position: 'absolute', inset: -260, opacity: .055, transform: `rotate(${frame * .07 + sceneIndex * 23}deg)`, background: `repeating-conic-gradient(from 0deg, transparent 0deg 20deg, ${glow} 20.4deg 21deg)`}} />
    <div style={{position: 'absolute', top: 58, left: 58, right: 58, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 30}}>
      <div style={{fontFamily: displayFont, fontSize: 29, letterSpacing: 5}}>POKE<span style={{color: accent}}>PULSES</span></div>
      {showNumber ? <div style={{fontFamily: displayFont, fontSize: 24, color: accent, letterSpacing: 2}}>{manifest.subject.index}</div> : <div style={{fontFamily: displayFont, fontSize: 21, color: '#ffffff66', letterSpacing: 3}}>{String(sceneIndex + 1).padStart(2, '0')} / {String(sceneCount).padStart(2, '0')}</div>}
    </div>
    <div style={{position: 'absolute', top: 122, left: 58, right: 58, height: 5, background: '#ffffff16', borderRadius: 99, overflow: 'hidden', zIndex: 30}}><div style={{height: '100%', width: `${progress * 100}%`, background: accent, boxShadow: `0 0 22px ${accent}`}} /></div>

    <div style={{position: 'absolute', top: 158, left: 54, right: 54, zIndex: 25, opacity: enter}}>
      <div style={{fontFamily: displayFont, fontSize: 24, letterSpacing: 5, color: accent, marginBottom: 12}}>{scene.eyebrow}</div>
      {sceneIndex !== 0 ? <div style={{fontFamily: displayFont, fontSize: 76, lineHeight: .86, letterSpacing: .5, maxWidth: 880}}>{scene.headline}</div> : null}
    </div>

    <div style={{position: 'absolute', inset: '315px 35px 285px', zIndex: 10, opacity: enter}}>
      {pattern === 'transformation' ? <TransformationVisual scene={scene} manifest={manifest} sceneIndex={sceneIndex} frame={frame} durationInFrames={durationInFrames} accent={accent} /> : <GenericVisual scene={scene} manifest={manifest} sceneIndex={sceneIndex} frame={frame} durationInFrames={durationInFrames} accent={accent} />}
    </div>

    <div style={{position: 'absolute', left: 58, right: 58, bottom: 66, zIndex: 30}}>
      <div style={{fontFamily: displayFont, fontSize: 54, lineHeight: .92, textTransform: 'uppercase', maxWidth: 900}}>{scene.caption}</div>
      <div style={{marginTop: 22, fontSize: 18, fontWeight: 800, color: '#ffffff72', letterSpacing: 2}}>{manifest.show.handle}</div>
    </div>
  </AbsoluteFill>;
};
