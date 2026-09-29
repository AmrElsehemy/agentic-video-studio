import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import type {VideoManifest} from '../schema';
import {CompiledEpisodeScene} from './CompiledEpisodeScene';
import {fontVariables} from './typography';

type RuntimeAudio = VideoManifest['audio'] & {sfx?: string; sfxVolume?: number};

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

  const audio = manifest.audio as RuntimeAudio;
  // Short-form mix: narration remains dominant, but not so dominant that the
  // bed and punctuation disappear perceptually on phone speakers.
  const voiceVolume = 0.94;
  const musicVolume = audio.musicVolume;
  const sfxVolume = audio.sfxVolume ?? 0.82;

  return (
    <AbsoluteFill style={{...fontVariables(manifest), backgroundColor: manifest.palette.background}}>
      {sequences}
      {audio.music ? <Audio src={staticFile(audio.music)} volume={musicVolume} loop /> : null}
      {audio.sfx ? <Audio src={staticFile(audio.sfx)} volume={sfxVolume} /> : null}
      {audio.voiceover ? <Audio src={staticFile(audio.voiceover)} volume={voiceVolume} /> : null}
    </AbsoluteFill>
  );
};
