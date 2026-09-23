import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import type {VideoManifest} from '../schema';
import {PokeProfileScene} from './PokeProfileScene';
import {Scene} from './scene';

export const VerticalEpisode: React.FC<{manifest: VideoManifest}> = ({manifest}) => {
  let cursor = 0;
  const usePokeProfile = manifest.show.id === 'pokepulses';

  const sequences = manifest.scenes.map((scene, index) => {
    const from = cursor;
    const durationInFrames = Math.round(scene.durationSeconds * manifest.format.fps);
    cursor += durationInFrames;
    const SceneRenderer = usePokeProfile ? PokeProfileScene : Scene;

    return (
      <Sequence key={scene.id} from={from} durationInFrames={durationInFrames} premountFor={30}>
        <SceneRenderer
          scene={scene}
          manifest={manifest}
          sceneIndex={index}
          sceneCount={manifest.scenes.length}
          durationInFrames={durationInFrames}
        />
      </Sequence>
    );
  });

  return (
    <AbsoluteFill style={{backgroundColor: manifest.palette.background}}>
      {sequences}
      {manifest.audio.music ? <Audio src={staticFile(manifest.audio.music)} volume={manifest.audio.voiceover ? Math.min(manifest.audio.musicVolume, 0.045) : manifest.audio.musicVolume} loop /> : null}
      {manifest.audio.voiceover ? <Audio src={staticFile(manifest.audio.voiceover)} /> : null}
    </AbsoluteFill>
  );
};
