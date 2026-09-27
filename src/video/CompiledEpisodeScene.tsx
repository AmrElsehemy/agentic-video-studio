import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VideoManifest, VideoScene} from '../schema';
import {HEADLINE_SHOTS, ShotVisual} from './shots';
import {bodyFont, displayFont} from './typography';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

type Props = {
  scene: VideoScene;
  manifest: VideoManifest;
  sceneIndex: number;
  sceneCount: number;
  durationInFrames: number;
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
      {HEADLINE_SHOTS.has(scene.shot) ? null : <div style={{fontFamily: displayFont, fontSize: 76, lineHeight: .86, letterSpacing: .5, maxWidth: 880}}>{scene.headline}</div>}
    </div>

    <div style={{position: 'absolute', inset: '315px 35px 285px', zIndex: 10, opacity: enter}}>
      <ShotVisual scene={scene} manifest={manifest} frame={frame} durationInFrames={durationInFrames} accent={accent} />
    </div>

    <div style={{position: 'absolute', left: 58, right: 58, bottom: 66, zIndex: 30}}>
      <div style={{fontFamily: displayFont, fontSize: 54, lineHeight: .92, textTransform: 'uppercase', maxWidth: 900}}>{scene.caption}</div>
      <div style={{marginTop: 22, fontSize: 18, fontWeight: 800, color: '#ffffff72', letterSpacing: 2}}>{manifest.show.handle}</div>
    </div>
  </AbsoluteFill>;
};
