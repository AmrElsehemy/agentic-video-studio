import React from 'react';
import {AbsoluteFill, Img} from 'remotion';
import type {VideoManifest} from '../schema';
import {GeoMapVisual} from './geo/GeoMap';
import {bodyFont, displayFont, fontVariables} from './typography';
import {Wordmark} from './wordmark';

type Props = {
  manifest: VideoManifest;
};

/** The cover shows a map scene's final state: its camera settled and every layer drawn in. */
const COVER_MAP_FRAMES = 300;

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
  const mapScene = manifest.scenes.find((scene) => scene.primitive?.kind === 'geo-map');
  const identifier = manifest.subject.identifier;
  const mentionsIdentifier = (text?: string) => Boolean(text && identifier && text.includes(identifier));
  // The identifier (e.g. a Pokédex number) stays off the cover unless the story is about it.
  const showIdentifier = Boolean(identifier && manifest.direction.numberRelevant);
  const tag = hook.eyebrow && (showIdentifier || !mentionsIdentifier(hook.eyebrow)) ? hook.eyebrow : undefined;
  // Shrink long hooks so they stay within three lines.
  const titleSize = Math.round(Math.min(132, Math.max(88, 132 * Math.sqrt(26 / Math.max(26, hook.headline.length)))));

  return (
    <AbsoluteFill
      style={{
        ...fontVariables(manifest),
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
      <Wordmark show={manifest.show} accent={accent} style={{position: 'absolute', top: 74, left: 64, fontSize: 42, letterSpacing: 6}} />
      {showIdentifier ? (
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
          {identifier}
        </div>
      ) : null}

      {showIdentifier ? (
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
          {identifier?.replace(/^#/, '')}
        </div>
      ) : null}
      {manifest.subject.artworkUrl ? <>
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
      </> : mapScene?.primitive?.kind === 'geo-map' ? (
        // Episodes told with maps show their first map, finished (the hook's answer, before any labels), where the artwork would be.
        <div style={{position: 'absolute', top: 190, left: 65, width: 950, height: 950, borderRadius: 40, overflow: 'hidden', boxShadow: `0 0 0 5px ${accent}55, 0 40px 80px #000a`}}>
          <div style={{position: 'absolute', left: -30, top: -212, transform: 'scale(1)'}}>
            <GeoMapVisual data={mapScene.primitive} scene={mapScene} manifest={manifest} frame={COVER_MAP_FRAMES} durationInFrames={COVER_MAP_FRAMES + 1} accent={accent} />
          </div>
        </div>
      ) : null}
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
