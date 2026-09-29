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

  return (
    <AbsoluteFill style={{...fontVariables(manifest), backgroundColor: manifest.palette.background}}>
      {sequences}
      {/* The generated bed is normalized before render, so the configured show volume is now meaningful. */}
      {audio.music ? <Audio src={staticFile(audio.music)} volume={audio.musicVolume} loop /> : null}
      {/* SFX live on their own track so impacts/reveals are not buried by music ducking. */}
      {audio.sfx ? <Audio src={staticFile(audio.sfx)} volume={audio.sfxVolume ?? 0.48} /> : null}
      {audio.voiceover ? <Audio src={staticFile(audio.voiceover)} /> : null}
    </AbsoluteFill>
  );
};
