import React from 'react';
import {AbsoluteFill, Img} from 'remotion';
import type {VideoManifest} from '../schema';
import {bodyFont, displayFont} from './typography';

type Props = {
  manifest: VideoManifest;
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The hook headline, with the subject's name (or else the last word) in the accent colour. */
const CoverTitle: React.FC<{headline: string; subject: string; accent: string}> = ({headline, subject, accent}) => {
  const match = new RegExp(`\\b${escapeRegExp(subject)}\\b`, 'i').exec(headline);
  if (match) {
    return <>{headline.slice(0, match.index)}<span style={{color: accent}}>{match[0]}</span>{headline.slice(match.index + match[0].length)}</>;
  }
  const lastSpace = headline.trimEnd().lastIndexOf(' ');
  if (lastSpace === -1) return <span style={{color: accent}}>{headline}</span>;
  return <>{headline.slice(0, lastSpace + 1)}<span style={{color: accent}}>{headline.slice(lastSpace + 1)}</span></>;
};

export const EpisodeCover: React.FC<Props> = ({manifest}) => {
  const accent = manifest.palette.primary;
  const hook = manifest.scenes[0];
  const mentionsNumber = (text?: string) => Boolean(text && /#\s*\d/.test(text));
  // Pokédex numbers stay off the cover unless the story is about the number.
  // Compiled episodes say so explicitly; hand-authored ones predate the flag,
  // so a number in their hook counts as intent.
  const showNumber = manifest.direction.engineVersion === 2
    ? Boolean(manifest.direction.numberRelevant)
    : mentionsNumber(hook.eyebrow) || mentionsNumber(hook.headline);
  const tag = hook.eyebrow && (showNumber || !mentionsNumber(hook.eyebrow)) ? hook.eyebrow : undefined;
  // Shrink long hooks so they stay within three lines.
  const titleSize = Math.round(Math.min(132, Math.max(88, 132 * Math.sqrt(26 / Math.max(26, hook.headline.length)))));

  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        color: manifest.palette.ink,
        background: `radial-gradient(circle at 72% 36%, ${accent}45, transparent 34%), linear-gradient(155deg, ${manifest.palette.surface} 0%, ${manifest.palette.background} 55%, #000000 100%)`,
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
      {showNumber ? (
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
      ) : null}

      {showNumber ? (
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
          {manifest.subject.index.replace('#', '')}
        </div>
      ) : null}
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
      {tag ? <div
        style={{
          position: 'absolute',
          top: 1015,
          left: 67,
          padding: '13px 25px 9px',
          borderRadius: 12,
          background: accent,
          color: manifest.palette.background,
          fontFamily: displayFont,
          fontSize: 34,
          letterSpacing: 2.5,
          transform: 'rotate(-2deg)',
        }}
      >
        {tag}
      </div> : null}
      <div
        style={{
          position: 'absolute',
          left: 65,
          right: 55,
          // Below the artwork and clear of the platform UI at the bottom of the frame.
          top: 1185,
          fontFamily: displayFont,
          fontSize: titleSize,
          lineHeight: 0.86,
          letterSpacing: 1,
          textTransform: 'uppercase',
          textShadow: '0 12px 32px #000c',
        }}
      >
        <CoverTitle headline={hook.headline} subject={manifest.subject.name} accent={accent} />
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
