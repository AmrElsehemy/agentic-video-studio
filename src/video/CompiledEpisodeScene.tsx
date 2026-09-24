import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VideoManifest, VideoScene} from '../schema';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

type Props = {
  scene: VideoScene;
  manifest: VideoManifest;
  sceneIndex: number;
  sceneCount: number;
  durationInFrames: number;
};

const HeroArt: React.FC<{src: string; frame: number; size?: number; hidden?: boolean}> = ({src, frame, size = 610, hidden = false}) => {
  const enter = spring({frame, fps: 30, config: {damping: 14, stiffness: 135}});
  const float = Math.sin(frame / 11) * 12;
  return <Img src={src} style={{width: size, height: size, objectFit: 'contain', opacity: enter, transform: `translateY(${float + (1 - enter) * 80}px) scale(${0.78 + enter * 0.22})`, filter: `${hidden ? 'brightness(0)' : ''} drop-shadow(0 34px 38px rgba(0,0,0,.42))`}} />;
};

const FactPill: React.FC<{text: string; index: number; frame: number; accent: string}> = ({text, index, frame, accent}) => {
  const enter = spring({frame: frame - index * 7, fps: 30, config: {damping: 16, stiffness: 160}});
  return <div style={{padding: '18px 25px', borderRadius: 999, border: `2px solid ${accent}99`, background: `${accent}18`, fontSize: 31, fontWeight: 900, letterSpacing: 1.2, opacity: enter, transform: `scale(${0.82 + enter * 0.18})`}}>{text}</div>;
};

const Facts: React.FC<{scene: VideoScene; frame: number; accent: string}> = ({scene, frame, accent}) => (
  <div style={{display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', maxWidth: 900}}>
    {(scene.facts ?? []).map((fact, index) => <FactPill key={`${fact}-${index}`} text={fact} index={index} frame={frame} accent={accent} />)}
  </div>
);

export const CompiledEpisodeScene: React.FC<Props> = ({scene, manifest, sceneIndex, sceneCount, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const accent = scene.accent ?? manifest.palette.primary;
  const artwork = scene.artworkUrl ?? manifest.subject.artworkUrl;
  const enter = spring({frame, fps, config: {damping: 16, stiffness: 145}});
  const exit = interpolate(frame, [Math.max(0, durationInFrames - 8), durationInFrames], [1, 0], clamp);
  const progress = (sceneIndex + frame / Math.max(1, durationInFrames)) / sceneCount;
  const pattern = manifest.direction.storyPattern;

  const patternGlow: Record<string, string> = {
    profile: manifest.palette.primary,
    mechanic: '#f4c84d',
    transformation: '#58b8ff',
    mystery: '#a875ff',
    comparison: '#72e0b5',
    reveal: '#a875ff',
    debate: '#ff7b72',
  };
  const glow = patternGlow[pattern] ?? accent;

  let visual: React.ReactNode;
  if (scene.visual === 'hook') {
    const revealAt = Math.round(durationInFrames * 0.42);
    visual = <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22}}>
      <div style={{fontSize: 150, fontWeight: 950, lineHeight: .85, color: accent, letterSpacing: -5}}>{manifest.subject.index}</div>
      <HeroArt src={artwork} frame={frame - revealAt} hidden={scene.subjectFocus === 'hidden' && frame < revealAt} size={650} />
      <Facts scene={scene} frame={frame} accent={accent} />
    </div>;
  } else if (scene.visual === 'gauntlet') {
    visual = <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30}}>
      <HeroArt src={artwork} frame={frame} size={570} />
      <Facts scene={scene} frame={frame} accent={accent} />
    </div>;
  } else if (scene.visual === 'advantage') {
    visual = <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36}}>
      <HeroArt src={artwork} frame={frame} size={500} />
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, width: 860}}>
        {(scene.facts ?? []).map((fact, index) => {
          const e = spring({frame: frame - index * 8, fps, config: {damping: 15, stiffness: 150}});
          return <div key={fact} style={{padding: 28, borderRadius: 30, background: `${accent}17`, border: `2px solid ${accent}55`, textAlign: 'center', fontSize: 38, fontWeight: 950, opacity: e, transform: `translateY(${(1 - e) * 35}px)`}}>{fact}</div>;
        })}
      </div>
    </div>;
  } else if (scene.visual === 'race') {
    const facts = scene.facts ?? [];
    visual = <div style={{width: 880, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30}}>
      <HeroArt src={artwork} frame={frame} size={430} />
      <div style={{width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        {facts.map((fact, index) => {
          const active = frame >= (index / Math.max(1, facts.length)) * durationInFrames;
          return <React.Fragment key={fact}>
            <div style={{minWidth: 120, padding: '20px 18px', borderRadius: 24, textAlign: 'center', background: active ? accent : '#ffffff13', color: active ? manifest.palette.background : manifest.palette.ink, fontWeight: 950, fontSize: 30}}>{fact}</div>
            {index < facts.length - 1 ? <div style={{height: 4, flex: 1, margin: '0 10px', background: active ? accent : '#ffffff20'}} /> : null}
          </React.Fragment>;
        })}
      </div>
    </div>;
  } else if (scene.visual === 'tradeoff') {
    visual = <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28}}>
      <HeroArt src={artwork} frame={frame} size={500} />
      <Facts scene={scene} frame={frame} accent={accent} />
      <div style={{fontSize: 92, fontWeight: 950, color: accent, transform: `scale(${0.9 + enter * 0.1})`}}>{scene.headline}</div>
    </div>;
  } else {
    visual = <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 38}}>
      <HeroArt src={artwork} frame={frame} size={600} />
      <div style={{fontSize: 78, fontWeight: 950, textAlign: 'center', lineHeight: .98}}>{scene.headline}</div>
      <Facts scene={scene} frame={frame} accent={accent} />
    </div>;
  }

  return <AbsoluteFill style={{overflow: 'hidden', color: manifest.palette.ink, background: `radial-gradient(circle at 50% 36%, ${glow}35 0%, transparent 42%), linear-gradient(180deg, ${manifest.palette.surface}, ${manifest.palette.background} 62%)`, opacity: exit}}>
    <div style={{position: 'absolute', inset: -260, opacity: .07, transform: `rotate(${frame * 0.08 + sceneIndex * 19}deg)`, background: `repeating-conic-gradient(from 0deg, transparent 0deg 18deg, ${glow} 18.4deg 19deg)`}} />
    <div style={{position: 'absolute', top: 58, left: 64, right: 64, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 900, letterSpacing: 3}}>
      <div style={{fontSize: 28}}>POKE<span style={{color: accent}}>PULSES</span></div>
      <div style={{fontSize: 22, color: accent, border: `2px solid ${accent}`, borderRadius: 999, padding: '9px 16px'}}>{pattern.toUpperCase()}</div>
    </div>
    <div style={{position: 'absolute', top: 126, left: 64, right: 64, height: 6, background: '#ffffff18', borderRadius: 99, overflow: 'hidden'}}><div style={{height: '100%', width: `${progress * 100}%`, background: accent}} /></div>
    <div style={{position: 'absolute', top: 170, left: 54, right: 54, textAlign: 'center', opacity: enter}}>
      <div style={{fontSize: 25, fontWeight: 900, letterSpacing: 4, color: accent}}>{scene.eyebrow}</div>
      <div style={{fontSize: 68, fontWeight: 950, lineHeight: .98, marginTop: 14}}>{scene.headline}</div>
    </div>
    <div style={{position: 'absolute', inset: '360px 60px 275px', display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: enter}}>{visual}</div>
    <div style={{position: 'absolute', left: 62, right: 62, bottom: 70, textAlign: 'center'}}>
      <div style={{fontSize: 46, fontWeight: 950, lineHeight: 1, textTransform: 'uppercase'}}>{scene.caption}</div>
      <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 26, fontSize: 19, fontWeight: 800, color: '#ffffff88', letterSpacing: 2}}><span>{manifest.show.handle}</span><span>{String(sceneIndex + 1).padStart(2, '0')} / {String(sceneCount).padStart(2, '0')}</span></div>
    </div>
  </AbsoluteFill>;
};
