import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {captionAt} from '../../scripts/lib/captions.mjs';
import type {VideoManifest, VideoScene} from '../schema';
import {continuesMap} from './geo/camera';
import {PrimitiveVisual} from './primitives';
import {HEADLINE_SHOTS, ShotVisual} from './shots';
import {SketchScene} from './sketch/SketchPage';
import {ArchScene} from './arch/ArchScene';
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

  // An architecture walkthrough (#120) replays its source diagram across the whole frame.
  if (scene.primitive?.kind === 'diagram' && manifest.diagram?.spec.theme === 'architecture') {
    return <AbsoluteFill><ArchScene scene={scene} manifest={manifest} sceneIndex={sceneIndex} frame={frame} fps={fps} durationInFrames={durationInFrames} fadeOut={!seams.out} /></AbsoluteFill>;
  }
  // A notebook diagram (#132) takes the whole frame: the page on the desk, no headline or scene chrome.
  if (scene.primitive?.kind === 'diagram' && manifest.diagram?.spec.theme === 'notebook') {
    return <AbsoluteFill style={{fontFamily: bodyFont}}><SketchScene scene={scene} manifest={manifest} sceneIndex={sceneIndex} frame={frame} fps={fps} durationInFrames={durationInFrames} fadeOut={!seams.out} /></AbsoluteFill>;
  }

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
      {scene.words?.length
        ? <WordCaption words={scene.words} seconds={frame / fps} fps={fps} accent={accent} />
        : <div style={{fontFamily: displayFont, fontSize: 54, lineHeight: .92, textTransform: 'uppercase', maxWidth: 900}}>{scene.caption}</div>}
    </div>
  </AbsoluteFill>;
};

/**
 * Word-synced caption (#86): the narration a short phrase at a time, the word
 * being spoken in the accent colour. Each new phrase rises in over a few frames.
 */
const WordCaption: React.FC<{words: NonNullable<VideoScene['words']>; seconds: number; fps: number; accent: string}> = ({words, seconds, fps, accent}) => {
  const caption = captionAt(words, seconds);
  if (!caption) return null;
  const sinceStart = (seconds - caption.words[0].start) * fps;
  const rise = caption.words[0] === words[0] ? 1 : interpolate(sinceStart, [0, 4], [0, 1], clamp);
  return <div style={{fontFamily: displayFont, fontSize: 62, lineHeight: .95, textTransform: 'uppercase', maxWidth: 940, opacity: rise, transform: `translateY(${(1 - rise) * 14}px)`}}>
    {caption.words.map((word, index) => {
      const active = index === caption.active;
      const pop = active ? interpolate((seconds - word.start) * fps, [0, 3], [1.08, 1], clamp) : 1;
      return <span key={index} style={{display: 'inline-block', marginRight: '.26em', color: active ? accent : undefined, transform: `scale(${pop})`, transformOrigin: '50% 80%'}}>{word.text}</span>;
    })}
  </div>;
};
