import React from 'react';
import {AbsoluteFill, Audio, cancelRender, continueRender, delayRender, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

// A ranked race from a race manifest (races/pokepulses/<id>.json, built by scripts/lib/dex.mjs).
// Every bar counts up together and stops at its own value; then the rows re-sort, the winner is
// contrasted with itself, and the video closes on a question. No narration: the headlines tell it.

export type Racer = {id: number; name: string; value: number; total: number; artwork: string; hero: boolean; tag?: string};
export type Headline = {from: number; to: number; kicker?: string; text: string; tone?: 'hero' | 'twist'};
export type RaceManifest = {
  id: string;
  metric: {id: string; label: string; unit: string; scale: number; decimals: number};
  racers: Racer[];
  order: {initial: number[]; final: number[]; initialLabel: string; finalLabel: string};
  counter: {frame: number; value: number}[];
  timeline: {sortStart: number; sortEnd: number; payoff: number; question: number; end: number};
  headlines: Headline[];
  question: {prompt: string; options: {id: number; label: string; sub: string}[]};
  caption: string;
};
export type RaceProps = {
  manifest: RaceManifest;
  brand: {wordmark: {lead: string; accent: string}; palette: {background: string; surface: string; primary: string; secondary: string; ink: string}};
  audio?: {music?: string; sfx?: string; musicVolume?: number; sfxVolume?: number};
};

// Bebas Neue (SIL OFL) from a local copy, so a render needs no font server.
const fontFamily = 'Bebas Neue Race';
const fontHandle = delayRender('Bebas Neue');
new FontFace(fontFamily, `url(${staticFile('fonts/BebasNeue-Regular.woff2')})`).load()
  .then((face) => { document.fonts.add(face); continueRender(fontHandle); })
  .catch((error) => cancelRender(error));

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const MUTED = '#3d5a7c';
const TWIST = '#ff6fae';
const ROW_TOP = 470;
const ROW_SPACE = 1200;
const BAR_X = 400;
const BAR_MAX = 1080 - BAR_X - 190;

/** Local files are served from public/; a URL (the Studio preview) is used as is. */
const asset = (file: string) => (/^https?:/.test(file) ? file : staticFile(file));

const counterAt = (counter: RaceManifest['counter'], frame: number) =>
  interpolate(frame, counter.map((key) => key.frame), counter.map((key) => key.value), {...clamp, easing: Easing.inOut(Easing.quad)});

/** The first frame at which the counter reaches a value. */
const stopFrame = (counter: RaceManifest['counter'], value: number) => {
  let frame = counter[0].frame;
  const last = counter[counter.length - 1].frame;
  while (frame < last && counterAt(counter, frame) < value) frame++;
  return frame;
};

const shown = (metric: RaceManifest['metric'], value: number) => {
  const scaled = value * metric.scale;
  return metric.decimals ? scaled.toFixed(metric.decimals) : String(Math.round(scaled));
};

export const raceDuration = (manifest: RaceManifest) => manifest.timeline.end;

const HeadlineView: React.FC<{headline: Headline; frame: number; colors: Record<string, string>}> = ({headline, frame, colors}) => {
  const {fps} = useVideoConfig();
  if (frame < headline.from || frame > headline.to) return null;
  const enter = spring({frame: frame - headline.from, fps, config: {damping: 14, stiffness: 180}});
  const exit = interpolate(frame, [headline.to - 8, headline.to], [1, 0], clamp);
  const color = headline.tone === 'hero' ? colors.primary : headline.tone === 'twist' ? TWIST : colors.ink;
  const size = headline.text.length > 18 ? 96 : 118;
  return <div style={{position: 'absolute', top: 150, left: 60, right: 60, textAlign: 'center', opacity: Math.min(enter, exit), transform: `translateY(${(1 - enter) * 40}px) scale(${0.92 + enter * 0.08})`}}>
    {headline.kicker ? <div style={{fontSize: 46, letterSpacing: 4, color: colors.primary}}>{headline.kicker}</div> : null}
    <div style={{fontSize: size, lineHeight: 0.95, color}}>{headline.text}</div>
  </div>;
};

export const RankedRace: React.FC<RaceProps> = ({manifest, brand, audio}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {racers, counter, timeline, metric, order} = manifest;
  const colors = brand.palette;
  const value = counterAt(counter, frame);
  // The axis fills during the first run, then grows so the last bar always fits.
  const floor = counter[1]?.value ?? Math.max(...racers.map((racer) => racer.value));
  const scale = Math.max(floor, value) * 1.05;
  const rowHeight = Math.min(118, ROW_SPACE / racers.length);
  const sort = interpolate(frame, [timeline.sortStart, timeline.sortEnd], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const focus = interpolate(frame, [timeline.payoff, timeline.payoff + 15], [0, 1], clamp);
  const rowsOut = interpolate(frame, [timeline.question, timeline.question + 15], [1, 0], clamp);
  const label = (text: string, opacity: number) => <div style={{position: 'absolute', top: ROW_TOP - 70, left: 60, fontSize: 34, letterSpacing: 2, color: MUTED, opacity: opacity * rowsOut}}>{text}</div>;

  return <AbsoluteFill style={{background: `radial-gradient(circle at 50% 30%, ${colors.surface} 0%, ${colors.background} 70%)`, fontFamily, color: colors.ink}}>
    {audio?.music ? <Audio src={staticFile(audio.music)} volume={audio.musicVolume ?? 0.4} loop /> : null}
    {audio?.sfx ? <Audio src={staticFile(audio.sfx)} volume={audio.sfxVolume ?? 0.5} /> : null}

    {manifest.headlines.map((headline, index) => <HeadlineView key={index} headline={headline} frame={frame} colors={colors} />)}
    {label(order.initialLabel, interpolate(frame, [10, 30, timeline.sortStart - 10, timeline.sortStart], [0, 1, 1, 0], clamp))}
    {label(order.finalLabel, interpolate(frame, [timeline.sortEnd, timeline.sortEnd + 10], [0, 1], clamp))}

    {racers.map((racer) => {
      const startRank = order.initial.indexOf(racer.id);
      const rank = interpolate(sort, [0, 1], [startRank, order.final.indexOf(racer.id)]);
      const appear = spring({frame: frame - 6 - startRank * 3, fps, config: {damping: 16}});
      const current = Math.min(value, racer.value);
      const stopped = value >= racer.value;
      const since = stopped ? frame - stopFrame(counter, racer.value) : -1;
      const pop = stopped ? interpolate(since, [0, 4, 14], [1.25, 1.25, 1], clamp) : 1;
      const width = Math.max(14, (current / scale) * BAR_MAX);
      const leading = racer.hero && value > floor;
      const dim = racer.hero ? 1 : interpolate(focus, [0, 1], [1, 0.28]);
      const bar = racer.hero ? colors.primary : stopped ? MUTED : colors.secondary;
      const art = Math.min(104, rowHeight - 10);
      return <div key={racer.id} style={{position: 'absolute', top: ROW_TOP + rank * rowHeight, left: 0, width: 1080, height: rowHeight, zIndex: racer.hero ? 2 : 1, opacity: appear * dim * rowsOut, transform: `translateX(${(1 - appear) * -80}px)`}}>
        <Img src={asset(racer.artwork)} style={{position: 'absolute', left: 50, top: (rowHeight - art) / 2, width: art, height: art, objectFit: 'contain'}} />
        <div style={{position: 'absolute', left: 166, top: rowHeight / 2 - (racer.tag ? 38 : 26), fontSize: racer.name.length > 10 ? 40 : 48, color: leading ? colors.primary : colors.ink}}>{racer.name.toUpperCase()}</div>
        {racer.tag ? <div style={{position: 'absolute', left: 168, top: rowHeight / 2 + 10, fontSize: 26, letterSpacing: 2, color: racer.hero ? colors.primary : MUTED}}>{racer.tag}</div> : null}
        <div style={{position: 'absolute', left: BAR_X, top: rowHeight / 2 - 31, height: 62, width, borderRadius: 31, background: bar, boxShadow: leading ? `0 0 40px ${colors.primary}` : 'none'}} />
        <div style={{position: 'absolute', left: BAR_X + width + 18, top: rowHeight / 2 - 37, fontSize: 64, color: racer.hero ? colors.primary : colors.ink, transform: `scale(${pop})`, transformOrigin: 'left center'}}>
          {shown(metric, current)}
        </div>
      </div>;
    })}

    {frame >= timeline.question ? <Question manifest={manifest} frame={frame - timeline.question} colors={colors} /> : null}

    <div style={{position: 'absolute', bottom: 150, width: '100%', textAlign: 'center', fontSize: 30, letterSpacing: 3, color: MUTED, opacity: rowsOut}}>{manifest.caption}</div>
    <div style={{position: 'absolute', bottom: 70, width: '100%', textAlign: 'center', fontSize: 44, letterSpacing: 3}}>
      {brand.wordmark.lead}<span style={{color: colors.primary}}>{brand.wordmark.accent}</span>
    </div>
  </AbsoluteFill>;
};

const Question: React.FC<{manifest: RaceManifest; frame: number; colors: Record<string, string>}> = ({manifest, frame, colors}) => {
  const {fps} = useVideoConfig();
  const artwork = new Map(manifest.racers.map((racer) => [racer.id, racer.artwork]));
  const cardColors = [colors.primary, colors.secondary];
  return <>
    <div style={{position: 'absolute', top: 360, width: '100%', textAlign: 'center', fontSize: 52, letterSpacing: 4, color: colors.primary, opacity: spring({frame, fps, config: {damping: 14}})}}>{manifest.question.prompt}</div>
    <div style={{position: 'absolute', top: 480, left: 60, right: 60, display: 'flex', gap: 36}}>
      {manifest.question.options.map((option, index) => {
        const t = spring({frame: frame - index * 8, fps, config: {damping: 14}});
        return <div key={option.id} style={{flex: 1, background: colors.surface, border: `4px solid ${cardColors[index % 2]}`, borderRadius: 36, padding: '36px 20px', textAlign: 'center', opacity: t, transform: `translateY(${(1 - t) * 60}px)`}}>
          <Img src={asset(artwork.get(option.id) ?? '')} style={{width: 260, height: 260, objectFit: 'contain'}} />
          <div style={{fontSize: option.label.length > 10 ? 60 : 74, color: cardColors[index % 2]}}>{option.label}</div>
          <div style={{fontSize: 38, color: colors.ink, opacity: 0.8}}>{option.sub}</div>
        </div>;
      })}
    </div>
    <div style={{position: 'absolute', top: 1260, width: '100%', textAlign: 'center', fontSize: 60, opacity: spring({frame: frame - 8, fps, config: {damping: 14}})}}>COMMENT YOUR PICK</div>
  </>;
};
