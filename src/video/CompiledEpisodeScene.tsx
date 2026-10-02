import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VideoManifest, VideoScene} from '../schema';
import {continuesMap} from './geo/camera';
import {PrimitiveVisual} from './primitives';
import {HEADLINE_SHOTS, ShotVisual} from './shots';
import {bodyFont, displayFont} from './typography';
import {Wordmark} from './wordmark';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

type Props = {
  scene: VideoScene;
  manifest: VideoManifest;
  sceneIndex: number;
  durationInFrames: number;
};

export const CompiledEpisodeScene: React.FC<Props> = ({scene, manifest, sceneIndex, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const accent = scene.accent ?? manifest.palette.primary;
  const enter = spring({frame, fps, config: {damping: 17, stiffness: 155}});
  const exit = interpolate(frame, [Math.max(0, durationInFrames - 8), durationInFrames], [1, 0], clamp);
  const pattern = manifest.direction.storyPattern;
  const glow = pattern === 'mechanic' ? '#f4c84d' : pattern === 'transformation' ? manifest.palette.secondary : pattern === 'mystery' ? '#a875ff' : accent;
  // Map continuity (#85): consecutive map scenes are one flight. Across such a scene change the
  // map and backdrop stay on screen; only the text (and the map's labels) fade and change.
  const seams = {in: continuesMap(manifest.scenes, sceneIndex), out: continuesMap(manifest.scenes, sceneIndex + 1)};
  let runStart = sceneIndex;
  while (continuesMap(manifest.scenes, runStart)) runStart--;
  const runFrame = frame + manifest.scenes.slice(runStart, sceneIndex).reduce((sum, item) => sum + Math.round(item.durationSeconds * fps), 0);
  const sceneFade = seams.out ? 1 : exit;
  const textFade = seams.out ? exit : 1;
  // The subject's identifier (e.g. a Pokédex number) shows only when the story is actually about it.
  const identifier = manifest.direction.numberRelevant ? manifest.subject.identifier : undefined;

  return <AbsoluteFill style={{overflow: 'hidden', color: manifest.palette.ink, background: `radial-gradient(circle at ${runStart % 2 ? '25%' : '75%'} 38%, ${glow}30 0%, transparent 38%), linear-gradient(160deg, ${manifest.palette.surface}, ${manifest.palette.background} 64%)`, opacity: sceneFade, fontFamily: bodyFont}}>
    <div style={{position: 'absolute', inset: -260, opacity: .055, transform: `rotate(${runFrame * .07 + runStart * 23}deg)`, background: `repeating-conic-gradient(from 0deg, transparent 0deg 20deg, ${glow} 20.4deg 21deg)`}} />

    {/* Lightweight brand bug only. No page counters or progress UI: this is a Short, not a slide deck. */}
    <div style={{position: 'absolute', top: 58, left: 58, right: 58, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 30}}>
      <Wordmark show={manifest.show} accent={accent} style={{fontSize: 29, letterSpacing: 5}} />
      {identifier ? <div style={{fontFamily: displayFont, fontSize: 24, color: accent, letterSpacing: 2}}>{identifier}</div> : null}
    </div>

    <div style={{position: 'absolute', top: 145, left: 54, right: 54, zIndex: 25, opacity: enter * textFade}}>
      {scene.eyebrow ? <div style={{fontFamily: displayFont, fontSize: 24, letterSpacing: 5, color: accent, marginBottom: 12}}>{scene.eyebrow}</div> : null}
      {HEADLINE_SHOTS.has(scene.shot) && !scene.primitive ? null : <div style={{fontFamily: displayFont, fontSize: 76, lineHeight: .86, letterSpacing: .5, maxWidth: 880}}>{scene.headline}</div>}
    </div>

    <div style={{position: 'absolute', inset: '300px 35px 245px', zIndex: 10, opacity: seams.in ? 1 : enter}}>
      {/* A semantic primitive, when the Visual Director chose one; otherwise the beat's shot. */}
      {scene.primitive
        ? <PrimitiveVisual primitive={scene.primitive} scene={scene} manifest={manifest} frame={frame} durationInFrames={durationInFrames} accent={accent} seams={seams} />
        : <ShotVisual scene={scene} manifest={manifest} frame={frame} durationInFrames={durationInFrames} accent={accent} />}
    </div>

    {/* Caption is content. The repeated @handle footer was decorative chrome and is intentionally gone. */}
    <div style={{position: 'absolute', left: 58, right: 58, bottom: 72, zIndex: 30, opacity: textFade}}>
      <div style={{fontFamily: displayFont, fontSize: 54, lineHeight: .92, textTransform: 'uppercase', maxWidth: 900}}>{scene.caption}</div>
    </div>
  </AbsoluteFill>;
};
