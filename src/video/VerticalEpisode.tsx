import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import type {VideoManifest} from '../schema';
import {CompiledEpisodeScene} from './CompiledEpisodeScene';
import {fontVariables} from './typography';

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
          sceneCount={manifest.scenes.length}
          durationInFrames={durationInFrames}
        />
      </Sequence>
    );
  });

  // Voiceover used to clamp every music bed to 0.045, making the configured
  // PokePulses bed effectively disappear. Keep narration dominant, but allow
  // enough of the bed and scene accents through to provide momentum.
  const musicVolume = manifest.audio.voiceover
    ? Math.min(manifest.audio.musicVolume, 0.075)
    : manifest.audio.musicVolume;

  return (
    <AbsoluteFill style={{...fontVariables(manifest), backgroundColor: manifest.palette.background}}>
      {sequences}
      {manifest.audio.music ? <Audio src={staticFile(manifest.audio.music)} volume={musicVolume} loop /> : null}
      {manifest.audio.voiceover ? <Audio src={staticFile(manifest.audio.voiceover)} /> : null}
    </AbsoluteFill>
  );
};
