import React from 'react';
import type {VideoManifest} from '../schema';
import {displayFont} from './typography';

/** The show's wordmark: lead text, then the accent part in the accent colour. */
export const Wordmark: React.FC<{show: VideoManifest['show']; accent: string; style?: React.CSSProperties}> = ({show, accent, style}) => {
  const wordmark = show.wordmark ?? {lead: show.name.toUpperCase(), accent: ''};
  return <div style={{fontFamily: displayFont, ...style}}>{wordmark.lead}{wordmark.accent ? <span style={{color: accent}}>{wordmark.accent}</span> : null}</div>;
};
