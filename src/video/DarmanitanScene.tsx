import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VideoManifest, VideoScene} from '../schema';

const zenArtwork = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10017.png';

const Art: React.FC<{src: string; size?: number; opacity?: number; scale?: number; y?: number}> = ({src, size = 620, opacity = 1, scale = 1, y = 0}) => (
  <Img src={src} style={{width: size, height: size, objectFit: 'contain', opacity, transform: `translateY(${y}px) scale(${scale})`, filter: 'drop-shadow(0 28px 42px rgba(0,0,0,.38))'}} />
);

const Label: React.FC<{children: React.ReactNode; size?: number; opacity?: number}> = ({children, size = 42, opacity = 1}) => (
  <div style={{fontSize: size, fontWeight: 900, letterSpacing: 1.5, opacity, textAlign: 'center'}}>{children}</div>
);

const HpBar: React.FC<{progress: number}> = ({progress}) => (
  <div style={{width: 780, height: 58, borderRadius: 32, background: 'rgba(255,255,255,.14)', overflow: 'hidden', border: '3px solid rgba(255,255,255,.18)'}}>
    <div style={{height: '100%', width: `${Math.max(0, Math.min(100, progress))}%`, background: progress <= 50 ? '#54a9ff' : '#ff5b36', borderRadius: 30}} />
  </div>
);

export const DarmanitanScene: React.FC<{
  scene: VideoScene;
  manifest: VideoManifest;
  sceneIndex: number;
  sceneCount: number;
  durationInFrames: number;
}> = ({scene, manifest, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 16, stiffness: 120}});
  const pulse = 1 + Math.sin(frame / 5) * 0.025;
  const base: React.CSSProperties = {
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: manifest.palette.ink,
    background: `radial-gradient(circle at 50% 30%, ${scene.accent ?? manifest.palette.primary}33 0%, transparent 42%), ${manifest.palette.background}`,
    padding: '120px 72px 110px',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const header = (
    <div style={{width: '100%', textAlign: 'center'}}>
      <div style={{fontSize: 28, fontWeight: 900, letterSpacing: 4, opacity: .7}}>{scene.eyebrow}</div>
      <div style={{fontSize: 72, lineHeight: .98, fontWeight: 950, marginTop: 18}}>{scene.headline}</div>
    </div>
  );

  let body: React.ReactNode;

  if (scene.id === 'hook') {
    const hp = interpolate(frame, [0, durationInFrames * .72], [100, 50], {extrapolateRight: 'clamp'});
    const zen = interpolate(frame, [durationInFrames * .62, durationInFrames * .88], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    body = <>
      <div style={{position: 'relative', height: 760, width: 840, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{position: 'absolute'}}><Art src={manifest.subject.artworkUrl} opacity={1 - zen} scale={pulse * enter} /></div>
        <div style={{position: 'absolute'}}><Art src={zenArtwork} opacity={zen} scale={(1 + zen * .08) * enter} /></div>
      </div>
      <HpBar progress={hp} />
      <Label>{Math.round(hp)}% HP</Label>
    </>;
  } else if (scene.id === 'identity') {
    body = <>
      <Art src={manifest.subject.artworkUrl} scale={enter} />
      <div style={{display: 'flex', gap: 24}}><Label size={54}>#555</Label><Label size={54}>FIRE</Label></div>
    </>;
  } else if (scene.id === 'hp-drop') {
    const hp = interpolate(frame, [0, durationInFrames * .9], [100, 50], {extrapolateRight: 'clamp'});
    body = <>
      <Art src={manifest.subject.artworkUrl} size={500} scale={pulse} />
      <div style={{fontSize: 150, fontWeight: 950}}>{Math.round(hp)}%</div>
      <HpBar progress={hp} />
      <Label size={34}>ZEN MODE TRIGGERS AT HALF OR LESS</Label>
    </>;
  } else if (scene.id === 'transform') {
    const switchPoint = durationInFrames * .42;
    const zen = interpolate(frame, [switchPoint, switchPoint + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    body = <>
      <div style={{height: 760, width: 840, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{position: 'absolute'}}><Art src={manifest.subject.artworkUrl} opacity={1 - zen} scale={1 + zen * .12} /></div>
        <div style={{position: 'absolute'}}><Art src={zenArtwork} opacity={zen} scale={.92 + zen * .12} /></div>
      </div>
      <div style={{display: 'flex', gap: 18, alignItems: 'center'}}><Label size={48}>FIRE</Label><Label size={40}>→</Label><Label size={48}>FIRE + PSYCHIC</Label></div>
    </>;
  } else if (scene.id === 'stats') {
    const rows = [
      ['ATTACK', '140', '30'],
      ['SP. ATTACK', '30', '140'],
      ['DEFENSE', '55', '105'],
      ['SP. DEFENSE', '55', '105'],
    ];
    body = <>
      <Art src={zenArtwork} size={430} scale={enter} />
      <div style={{width: 850, display: 'grid', gap: 18}}>
        {rows.map(([label, from, to], i) => <div key={label} style={{display: 'grid', gridTemplateColumns: '1.6fr .8fr .3fr .8fr', alignItems: 'center', fontSize: 38, fontWeight: 900, opacity: interpolate(frame, [i * 8, i * 8 + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}><span>{label}</span><span>{from}</span><span>→</span><span style={{fontSize: 50}}>{to}</span></div>)}
      </div>
    </>;
  } else {
    body = <>
      <Art src={zenArtwork} scale={enter * pulse} />
      <Label size={52}>50% HP</Label>
      <Label size={36}>WORTH THE RISK?</Label>
    </>;
  }

  return <AbsoluteFill style={base}>
    {header}
    <div style={{flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34}}>{body}</div>
    <div style={{fontSize: 36, fontWeight: 900, letterSpacing: 1.2, textAlign: 'center', minHeight: 92, display: 'flex', alignItems: 'center'}}>{scene.caption}</div>
  </AbsoluteFill>;
};
