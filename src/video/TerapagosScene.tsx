import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VideoManifest, VideoScene} from '../schema';

const terastalArtwork = 'https://www.serebii.net/pokemon/art/1024-t.png';
const stellarArtwork = 'https://www.serebii.net/pokemon/art/1024-s.png';

const Art: React.FC<{src: string; size?: number; opacity?: number; scale?: number; y?: number}> = ({src, size = 620, opacity = 1, scale = 1, y = 0}) => (
  <Img src={src} style={{width: size, height: size, objectFit: 'contain', opacity, transform: `translateY(${y}px) scale(${scale})`, filter: 'drop-shadow(0 30px 48px rgba(0,0,0,.48))'}} />
);

const Label: React.FC<{children: React.ReactNode; size?: number; opacity?: number}> = ({children, size = 42, opacity = 1}) => (
  <div style={{fontSize: size, fontWeight: 900, letterSpacing: 1.8, opacity, textAlign: 'center'}}>{children}</div>
);

const PrismRing: React.FC<{radius: number; rotation: number; opacity?: number}> = ({radius, rotation, opacity = 1}) => (
  <div style={{position: 'absolute', width: radius * 2, height: radius * 2, borderRadius: '50%', border: '5px solid rgba(93,228,255,.46)', boxShadow: '0 0 50px rgba(214,124,255,.35), inset 0 0 36px rgba(93,228,255,.18)', transform: `rotate(${rotation}deg)`, opacity}} />
);

export const TerapagosScene: React.FC<{
  scene: VideoScene;
  manifest: VideoManifest;
  sceneIndex: number;
  sceneCount: number;
  durationInFrames: number;
}> = ({scene, manifest, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 17, stiffness: 115}});
  const pulse = 1 + Math.sin(frame / 6) * 0.018;
  const accent = scene.accent ?? manifest.palette.primary;

  const base: React.CSSProperties = {
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: manifest.palette.ink,
    background: `radial-gradient(circle at 50% 34%, ${accent}35 0%, transparent 38%), radial-gradient(circle at 20% 82%, ${manifest.palette.secondary}20 0%, transparent 30%), ${manifest.palette.background}`,
    padding: '118px 72px 105px',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  };

  const header = (
    <div style={{width: '100%', textAlign: 'center', zIndex: 3}}>
      <div style={{fontSize: 28, fontWeight: 900, letterSpacing: 4, opacity: .72}}>{scene.eyebrow}</div>
      <div style={{fontSize: 70, lineHeight: .98, fontWeight: 950, marginTop: 18}}>{scene.headline}</div>
    </div>
  );

  let body: React.ReactNode;

  if (scene.id === 'hook') {
    const reveal1 = interpolate(frame, [durationInFrames * .28, durationInFrames * .48], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    const reveal2 = interpolate(frame, [durationInFrames * .62, durationInFrames * .82], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    body = <>
      <div style={{position: 'relative', width: 900, height: 800, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <PrismRing radius={330} rotation={frame * .65} opacity={.35 + reveal2 * .35} />
        <div style={{position: 'absolute'}}><Art src={manifest.subject.artworkUrl} opacity={1 - reveal1} scale={.75 * enter} /></div>
        <div style={{position: 'absolute'}}><Art src={terastalArtwork} opacity={reveal1 * (1 - reveal2)} scale={(.76 + reveal1 * .16) * enter} /></div>
        <div style={{position: 'absolute'}}><Art src={stellarArtwork} opacity={reveal2} size={760} scale={(.72 + reveal2 * .2) * enter} /></div>
      </div>
      <div style={{display: 'flex', gap: 24}}><Label size={38}>NORMAL</Label><Label size={38}>→</Label><Label size={38}>TERASTAL</Label><Label size={38}>→</Label><Label size={38}>STELLAR</Label></div>
    </>;
  } else if (scene.id === 'identity') {
    body = <>
      <div style={{position: 'relative', width: 780, height: 720, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <PrismRing radius={285} rotation={frame * .45} opacity={.42} />
        <Art src={manifest.subject.artworkUrl} scale={enter * pulse} />
      </div>
      <div style={{display: 'flex', gap: 24}}><Label size={54}>#1024</Label><Label size={54}>TERA</Label></div>
    </>;
  } else if (scene.id === 'terastal') {
    const reveal = interpolate(frame, [durationInFrames * .34, durationInFrames * .56], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    body = <>
      <div style={{position: 'relative', width: 900, height: 780, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <PrismRing radius={315} rotation={frame} opacity={.3 + reveal * .5} />
        <div style={{position: 'absolute'}}><Art src={manifest.subject.artworkUrl} opacity={1 - reveal} scale={.86 + reveal * .08} /></div>
        <div style={{position: 'absolute'}}><Art src={terastalArtwork} opacity={reveal} scale={.78 + reveal * .2} /></div>
      </div>
      <Label size={48}>TERA SHIFT</Label>
    </>;
  } else if (scene.id === 'stellar') {
    const reveal = interpolate(frame, [durationInFrames * .30, durationInFrames * .5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    const burst = interpolate(frame, [durationInFrames * .3, durationInFrames * .6], [.3, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    body = <>
      <div style={{position: 'relative', width: 920, height: 850, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        {[250, 330, 410].map((r, i) => <PrismRing key={r} radius={r} rotation={(i % 2 ? -1 : 1) * frame * (1.1 + i * .25)} opacity={burst * (.34 - i * .05)} />)}
        <div style={{position: 'absolute'}}><Art src={terastalArtwork} opacity={1 - reveal} scale={.86 + reveal * .15} /></div>
        <div style={{position: 'absolute'}}><Art src={stellarArtwork} opacity={reveal} size={800} scale={.7 + reveal * .28} /></div>
      </div>
      <Label size={50}>STELLAR FORM</Label>
    </>;
  } else if (scene.id === 'zero') {
    const clear = interpolate(frame, [durationInFrames * .35, durationInFrames * .72], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    const chips = [['RAIN', '☔'], ['SUN', '☀'], ['TERRAIN', '◇']];
    body = <>
      <Art src={stellarArtwork} size={560} scale={enter * pulse} />
      <div style={{display: 'flex', width: 900, justifyContent: 'space-between'}}>
        {chips.map(([label, icon], i) => <div key={label} style={{width: 250, padding: '22px 12px', borderRadius: 26, border: '2px solid rgba(255,255,255,.18)', textAlign: 'center', transform: `translateY(${clear * (i - 1) * 34}px) scale(${1 - clear * .12})`, opacity: 1 - clear * .72}}><div style={{fontSize: 54}}>{icon}</div><div style={{fontSize: 31, fontWeight: 900}}>{label}</div><div style={{fontSize: 44, fontWeight: 950, marginTop: 8}}>→ 0</div></div>)}
      </div>
      <Label size={44}>TERAFORM ZERO</Label>
    </>;
  } else {
    body = <>
      <div style={{display: 'flex', alignItems: 'flex-end', gap: 2, height: 760}}>
        <Art src={manifest.subject.artworkUrl} size={340} scale={enter} y={40} />
        <Art src={terastalArtwork} size={390} scale={enter} y={10} />
        <Art src={stellarArtwork} size={470} scale={enter * pulse} />
      </div>
      <Label size={42}>NORMAL • TERASTAL • STELLAR</Label>
    </>;
  }

  return <AbsoluteFill style={base}>
    {header}
    <div style={{flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, zIndex: 2}}>{body}</div>
    <div style={{fontSize: 36, fontWeight: 900, letterSpacing: 1.2, textAlign: 'center', minHeight: 92, display: 'flex', alignItems: 'center', zIndex: 3}}>{scene.caption}</div>
  </AbsoluteFill>;
};
