import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import type {VideoManifest} from '../schema';
import {CompiledEpisodeScene} from './CompiledEpisodeScene';
import {DarmanitanScene} from './DarmanitanScene';
import {GimmighoulScene} from './GimmighoulScene';
import {PokeProfileScene} from './PokeProfileScene';
import {Scene} from './scene';
import {TerapagosScene} from './TerapagosScene';

export const VerticalEpisode: React.FC<{manifest: VideoManifest}> = ({manifest}) => {
  let cursor = 0;
  const useCompiledEngine = manifest.direction.engineVersion === 2;
  const useDarmanitan = manifest.id === 'darmanitan-555';
  const useGimmighoul = manifest.id === 'gimmighoul-999';
  const useTerapagos = manifest.id === 'terapagos-1024';
  const usePokeProfile = manifest.show.id === 'pokepulses';

  const sequences = manifest.scenes.map((scene, index) => {
    const from = cursor;
    const durationInFrames = Math.round(scene.durationSeconds * manifest.format.fps);
    cursor += durationInFrames;
    const SceneRenderer = useCompiledEngine
      ? CompiledEpisodeScene
      : useDarmanitan
        ? DarmanitanScene
        : useGimmighoul
          ? GimmighoulScene
          : useTerapagos
            ? TerapagosScene
            : usePokeProfile
              ? PokeProfileScene
              : Scene;

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
