import React from 'react';
import {AbsoluteFill, Img} from 'remotion';
import type {VideoManifest} from '../schema';
import {bodyFont, displayFont} from './typography';

type Props = {
  manifest: VideoManifest;
};

export const EpisodeCover: React.FC<Props> = ({manifest}) => {
  const accent = manifest.palette.primary;

  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        color: manifest.palette.ink,
        background: `radial-gradient(circle at 72% 36%, ${accent}45, transparent 34%), linear-gradient(155deg, #0c3a29 0%, ${manifest.palette.background} 55%, #020906 100%)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.11,
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />
      <div style={{position: 'absolute', top: 74, left: 64, fontFamily: displayFont, fontSize: 42, letterSpacing: 6}}>
        POKE<span style={{color: accent}}>PULSES</span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 67,
          right: 64,
          padding: '10px 21px 8px',
          border: `3px solid ${accent}`,
          borderRadius: 99,
          color: accent,
          fontFamily: displayFont,
          fontSize: 35,
          letterSpacing: 2,
        }}
      >
        {manifest.subject.index}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 210,
          left: 58,
          color: '#ffffff0d',
          fontFamily: displayFont,
          fontSize: 410,
          lineHeight: 0.8,
          letterSpacing: -16,
        }}
      >
        001
      </div>
      <div
        style={{
          position: 'absolute',
          top: 245,
          left: 112,
          width: 890,
          height: 890,
          borderRadius: '50%',
          border: `5px solid ${accent}55`,
          boxShadow: `inset 0 0 110px ${accent}28, 0 0 100px ${accent}18`,
        }}
      />
      <Img
        src={manifest.subject.artworkUrl}
        style={{
          position: 'absolute',
          top: 210,
          left: 105,
          width: 900,
          height: 900,
          objectFit: 'contain',
          filter: 'drop-shadow(0 48px 42px #000a)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 1015,
          left: 67,
          padding: '13px 25px 9px',
          borderRadius: 12,
          background: accent,
          color: '#061a13',
          fontFamily: displayFont,
          fontSize: 34,
          letterSpacing: 2.5,
          transform: 'rotate(-2deg)',
        }}
      >
        THE ORIGINAL STARTER
      </div>
      <div
        style={{
          position: 'absolute',
          left: 65,
          right: 55,
          bottom: 215,
          fontFamily: displayFont,
          fontSize: 132,
          lineHeight: 0.82,
          letterSpacing: 1,
          textTransform: 'uppercase',
          textShadow: '0 12px 32px #000c',
        }}
      >
        WHY <span style={{color: accent}}>BULBASAUR</span>
        <br />IS NUMBER ONE
      </div>
      <div
        style={{
          position: 'absolute',
          left: 68,
          right: 68,
          bottom: 82,
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: '2px solid #ffffff25',
          paddingTop: 24,
          fontFamily: bodyFont,
          fontWeight: 900,
          fontSize: 22,
          letterSpacing: 2.5,
          color: '#ffffffaa',
        }}
      >
        <span>{manifest.subject.category.toUpperCase()}</span>
        <span>{manifest.show.handle}</span>
      </div>
    </AbsoluteFill>
  );
};
