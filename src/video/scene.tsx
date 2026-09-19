import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VideoManifest, VideoScene} from '../schema';
import {SubjectMark} from './subject-mark';

const fontFamily = 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif';

type Props = {
  scene: VideoScene;
  manifest: VideoManifest;
  sceneIndex: number;
  sceneCount: number;
  durationInFrames: number;
};

export const Scene: React.FC<Props> = ({scene, manifest, sceneIndex, sceneCount, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = spring({frame, fps, config: {damping: 16, stiffness: 120, mass: 0.8}});
  const exit = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic),
  });
  const accent = scene.accent ?? manifest.palette.primary;
  const progress = (sceneIndex + frame / durationInFrames) / sceneCount;

  return (
    <AbsoluteFill style={{fontFamily, color: manifest.palette.ink, background: `radial-gradient(circle at 75% 20%, ${accent}55, transparent 33%), linear-gradient(155deg, ${manifest.palette.background}, ${manifest.palette.surface})`, overflow: 'hidden', opacity: exit}}>
      <div style={{position: 'absolute', inset: -180, opacity: 0.2, transform: `rotate(${frame * 0.08}deg)`, background: `repeating-conic-gradient(from 0deg, transparent 0deg 12deg, ${accent} 13deg 14deg)`}} />

      <header style={{position: 'absolute', top: 82, left: 72, right: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', letterSpacing: 3, fontWeight: 800, fontSize: 31}}>
        <span>{manifest.show.name.toUpperCase()}</span>
        <span style={{color: accent}}>{manifest.subject.index}</span>
      </header>
      <div style={{position: 'absolute', top: 155, left: 72, right: 72, height: 9, borderRadius: 99, background: '#ffffff18', overflow: 'hidden'}}>
        <div style={{height: '100%', width: `${progress * 100}%`, background: accent, boxShadow: `0 0 28px ${accent}`}} />
      </div>

      <main style={{position: 'absolute', inset: '225px 70px 330px', display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: entrance, transform: `translateY(${(1 - entrance) * 70}px)`}}>
        <SceneVisual visual={scene.visual} scene={scene} manifest={manifest} accent={accent} frame={frame} />
        <div style={{marginTop: 56}}>
          {scene.eyebrow ? <div style={{fontSize: 34, color: accent, fontWeight: 800, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 14}}>{scene.eyebrow}</div> : null}
          <div style={{fontSize: scene.visual === 'reveal' ? 142 : 96, fontWeight: 900, lineHeight: 0.88, textTransform: 'uppercase', letterSpacing: -3, maxWidth: 930}}>{scene.headline}</div>
        </div>
      </main>

      <footer style={{position: 'absolute', bottom: 75, left: 62, right: 62}}>
        <div style={{padding: '28px 34px', borderRadius: 30, background: '#050907dd', border: '2px solid #ffffff22', boxShadow: '0 22px 80px #0008', fontSize: 44, fontWeight: 700, lineHeight: 1.08, textAlign: 'center'}}>{scene.caption}</div>
        <div style={{fontSize: 26, marginTop: 24, textAlign: 'center', opacity: 0.58, letterSpacing: 2}}>{manifest.show.handle}</div>
      </footer>
    </AbsoluteFill>
  );
};

const SceneVisual: React.FC<{visual: VideoScene['visual']; scene: VideoScene; manifest: VideoManifest; accent: string; frame: number}> = ({visual, scene, manifest, accent, frame}) => {
  if (visual === 'reveal' || visual === 'cta') return <SubjectMark accent={accent} secondary={manifest.palette.secondary} frame={frame} compact={visual === 'cta'} />;
  if (visual === 'number') return <div style={{fontSize: 330, lineHeight: 0.75, color: accent, fontWeight: 900, letterSpacing: -18, textShadow: `0 20px 100px ${accent}66`}}>{manifest.subject.index}</div>;
  return (
    <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, transform: `translateX(${Math.sin(frame / 18) * 5}px)`}}>
      {(scene.facts ?? [manifest.subject.name, manifest.subject.category]).map((fact, i) => (
        <div key={fact} style={{minHeight: 142, borderRadius: 28, padding: 28, display: 'flex', alignItems: 'flex-end', fontSize: 39, lineHeight: 1, fontWeight: 800, textTransform: 'uppercase', background: i === 0 ? accent : '#ffffff10', color: i === 0 ? manifest.palette.background : manifest.palette.ink, border: `2px solid ${i === 0 ? accent : '#ffffff25'}`, transform: `rotate(${i % 2 ? 1.2 : -1.2}deg)`}}>{fact}</div>
      ))}
    </div>
  );
};
