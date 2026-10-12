import React from 'react';
import {AbsoluteFill, Audio, Freeze, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import type {VideoManifest} from '../schema';
import {CompiledEpisodeScene} from './CompiledEpisodeScene';
import {fontVariables} from './typography';

type RuntimeAudio = VideoManifest['audio'] & {sfx?: string; sfxVolume?: number};

const LOOP_SECONDS = 0.4;

const FadeIn: React.FC<{frames: number; children: React.ReactNode}> = ({frames, children}) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{opacity: interpolate(frame, [0, frames - 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>{children}</AbsoluteFill>;
};

// Every episode renders through the same scene engine: what differs between
// episodes is data (story shape, shots, primitives, palette), never code.
export const VerticalEpisode: React.FC<{manifest: VideoManifest}> = ({manifest}) => {
  let cursor = 0;

  const sequences = manifest.scenes.map((scene, index) => {
    const from = cursor;
    const durationInFrames = Math.round(scene.durationSeconds * manifest.format.fps);
    cursor += durationInFrames;
    return (
      <Sequence key={scene.id} from={from} durationInFrames={durationInFrames} premountFor={30}>
        <CompiledEpisodeScene
          scene={scene}
          manifest={manifest}
          sceneIndex={index}
          durationInFrames={durationInFrames}
        />
      </Sequence>
    );
  });

  // Ending 'loop': the last 0.4 seconds dissolve into the first frame, so a replay starts where this ends.
  // Skipped when the narration is still talking then.
  const last = manifest.scenes.at(-1)!;
  const lastWordEnd = last.words?.length ? last.words[last.words.length - 1].end : 0;
  const loopFrames = Math.round(LOOP_SECONDS * manifest.format.fps);
  const looping = manifest.framing?.ending === 'loop' && manifest.scenes.length > 1 && last.durationSeconds - lastWordEnd >= LOOP_SECONDS;
  const first = manifest.scenes[0];
  const loopOverlay = looping ? (
    <Sequence from={cursor - loopFrames} durationInFrames={loopFrames}>
      <FadeIn frames={loopFrames}>
        <Freeze frame={0}>
          <CompiledEpisodeScene scene={first} manifest={manifest} sceneIndex={0} durationInFrames={Math.round(first.durationSeconds * manifest.format.fps)} />
        </Freeze>
      </FadeIn>
    </Sequence>
  ) : null;

  const audio = manifest.audio as RuntimeAudio;
  // Short-form mix: narration remains dominant, but not so dominant that the
  // bed and punctuation disappear perceptually on phone speakers.
  const voiceVolume = 0.94;
  const musicVolume = audio.musicVolume;
  const sfxVolume = audio.sfxVolume ?? 0.82;

  return (
    <AbsoluteFill style={{...fontVariables(manifest), backgroundColor: manifest.palette.background}}>
      {sequences}
      {loopOverlay}
      {audio.music ? <Audio src={staticFile(audio.music)} volume={musicVolume} loop /> : null}
      {audio.sfx ? <Audio src={staticFile(audio.sfx)} volume={sfxVolume} /> : null}
      {audio.voiceover ? <Audio src={staticFile(audio.voiceover)} volume={voiceVolume} /> : null}
    </AbsoluteFill>
  );
};
