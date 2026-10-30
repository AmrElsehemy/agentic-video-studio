// Ranked races have their own entry point, so the one-Pokémon episodes (src/index.ts) never load them.
import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {raceDuration, RankedRace, type RaceProps} from './RankedRace';
import preview from './preview.json';

const Root: React.FC = () => React.createElement(Composition, {
  id: 'RankedRace',
  component: RankedRace as React.FC<Record<string, unknown>>,
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: raceDuration((preview as unknown as RaceProps).manifest),
  defaultProps: preview as unknown as Record<string, unknown>,
  calculateMetadata: ({props}: {props: Record<string, unknown>}) => ({durationInFrames: raceDuration((props as unknown as RaceProps).manifest)}),
});

registerRoot(Root);
