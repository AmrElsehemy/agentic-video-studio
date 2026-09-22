import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VideoManifest, VideoScene} from '../schema';
import {bodyFont as body, displayFont as display} from './typography';

type Props = {
  scene: VideoScene;
  manifest: VideoManifest;
  sceneIndex: number;
  sceneCount: number;
  durationInFrames: number;
};

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

export const Scene: React.FC<Props> = ({scene, manifest, sceneIndex, sceneCount, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const accent = scene.accent ?? manifest.palette.primary;
  const enter = spring({frame, fps, config: {damping: 18, stiffness: 170, mass: 0.7}});
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {...clamp, easing: Easing.in(Easing.quad)});
  const progress = (sceneIndex + frame / durationInFrames) / sceneCount;

  return (
    <AbsoluteFill style={{color: manifest.palette.ink, background: manifest.palette.background, overflow: 'hidden', opacity: exit}}>
      <Atmosphere accent={accent} frame={frame} sceneIndex={sceneIndex} />
      <header style={{position: 'absolute', top: 64, left: 58, right: 58, height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 20}}>
        <div style={{fontFamily: display, letterSpacing: 5, fontSize: 29}}>POKE<span style={{color: accent}}>PULSES</span></div>
        <div style={{fontFamily: body, fontWeight: 900, letterSpacing: 2, fontSize: 24, border: `2px solid ${accent}`, color: accent, borderRadius: 99, padding: '9px 17px'}}>{manifest.subject.index}</div>
      </header>
      <div style={{position: 'absolute', top: 142, left: 58, right: 58, height: 7, background: '#ffffff18', borderRadius: 99, overflow: 'hidden', zIndex: 20}}>
        <div style={{width: `${progress * 100}%`, height: '100%', background: accent, boxShadow: `0 0 24px ${accent}`}} />
      </div>

      <div style={{position: 'absolute', inset: '175px 0 335px', opacity: enter, transform: `scale(${0.94 + enter * 0.06})`, zIndex: 5}}>
        <Visual scene={scene} manifest={manifest} accent={accent} frame={frame} durationInFrames={durationInFrames} />
      </div>

      <div style={{position: 'absolute', left: 62, right: 62, bottom: 64, zIndex: 30}}>
        <div style={{fontFamily: display, color: accent, fontSize: 25, letterSpacing: 4, marginBottom: 12}}>{scene.eyebrow}</div>
        <KineticCaption text={scene.caption} frame={frame} durationInFrames={durationInFrames} accent={accent} />
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, fontFamily: body, color: '#ffffff82', fontSize: 19, fontWeight: 800, letterSpacing: 2}}>
          <span>{scene.visual === 'cta' ? 'UNOFFICIAL FAN PROJECT • NOT AFFILIATED' : manifest.show.handle}</span><span>{String(sceneIndex + 1).padStart(2, '0')} / {String(sceneCount).padStart(2, '0')}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Atmosphere: React.FC<{accent: string; frame: number; sceneIndex: number}> = ({accent, frame, sceneIndex}) => (
  <>
    <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at ${25 + sceneIndex * 9}% ${25 + sceneIndex * 6}%, ${accent}36, transparent 38%), linear-gradient(155deg, #061a13 0%, #09271c 55%, #020906 100%)`}} />
    <div style={{position: 'absolute', inset: -280, opacity: 0.12, transform: `rotate(${frame * 0.12 + sceneIndex * 17}deg)`, background: `repeating-conic-gradient(from 0deg, transparent 0deg 17deg, ${accent} 18deg 18.7deg)`}} />
    <div style={{position: 'absolute', inset: 0, opacity: 0.14, backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '72px 72px'}} />
  </>
);

const KineticCaption: React.FC<{text: string; frame: number; durationInFrames: number; accent: string}> = ({text, frame, durationInFrames, accent}) => {
  const words = text.split(/\s+/);
  const active = Math.min(words.length - 1, Math.floor((frame / Math.max(1, durationInFrames - 6)) * words.length));
  return (
    <div style={{fontFamily: display, fontSize: words.length > 9 ? 61 : 72, lineHeight: 0.94, letterSpacing: 0.5, textTransform: 'uppercase', textShadow: '0 8px 25px #000'}}>
      {words.map((word, index) => {
        const shown = index <= active;
        return <span key={`${word}-${index}`} style={{display: 'inline-block', marginRight: 15, color: index === active ? accent : '#f8fff9', opacity: shown ? 1 : 0, transform: `translateY(${shown ? 0 : 12}px) scale(${index === active ? 1.06 : 1})`}}>{word}</span>;
      })}
    </div>
  );
};

const PokemonArt: React.FC<{src: string; size: number; frame: number; delay?: number; style?: React.CSSProperties}> = ({src, size, frame, delay = 0, style}) => {
  const reveal = spring({frame: frame - delay, fps: 30, config: {damping: 13, stiffness: 150, mass: 0.8}});
  const float = Math.sin((frame + delay) / 13) * 13;
  return <Img src={src} style={{width: size, height: size, objectFit: 'contain', filter: 'drop-shadow(0 40px 38px #0009)', opacity: reveal, transform: `translateY(${(1 - reveal) * 120 + float}px) scale(${0.7 + reveal * 0.3})`, ...style}} />;
};

const Visual: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number; durationInFrames: number}> = ({scene, manifest, accent, frame}) => {
  if (scene.visual === 'hook') return <Hook manifest={manifest} accent={accent} frame={frame} headline={scene.headline} />;
  if (scene.visual === 'gauntlet') return <Gauntlet scene={scene} manifest={manifest} accent={accent} frame={frame} />;
  if (scene.visual === 'advantage') return <Advantage scene={scene} manifest={manifest} accent={accent} frame={frame} />;
  if (scene.visual === 'race') return <Race manifest={manifest} accent={accent} frame={frame} />;
  if (scene.visual === 'tradeoff') return <Tradeoff scene={scene} manifest={manifest} accent={accent} frame={frame} />;
  return <Cta manifest={manifest} accent={accent} frame={frame} headline={scene.headline} />;
};

const Hook: React.FC<{manifest: VideoManifest; accent: string; frame: number; headline: string}> = ({manifest, accent, frame, headline}) => (
  <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', top: -20, left: 30, fontFamily: display, fontSize: 300, lineHeight: 0.8, color: '#ffffff08', letterSpacing: -16}}>WRONG?</div>
    <div style={{position: 'absolute', left: 105, top: 90, filter: frame < 13 ? 'brightness(0)' : 'none'}}><PokemonArt src={manifest.subject.artworkUrl} size={850} frame={frame} /></div>
    <div style={{position: 'absolute', left: 48, top: 835, right: 48, fontFamily: display, fontSize: 100, lineHeight: 0.83, textTransform: 'uppercase'}}>{headline}</div>
    <div style={{position: 'absolute', right: 64, top: 118, padding: '15px 24px', borderRadius: 99, background: accent, color: '#061a13', fontFamily: display, fontSize: 31, transform: `rotate(${-4 + Math.sin(frame / 4) * 2}deg) scale(${frame % 10 < 2 ? 1.08 : 1})`}}>PROVE ME WRONG</div>
    {frame < 14 ? <div style={{position: 'absolute', inset: 0, background: frame % 4 < 2 ? '#f3d95b18' : 'transparent'}} /> : null}
  </div>
);

const TypePill: React.FC<{label: string; color: string; left: number; top: number; rotate: number; frame: number}> = ({label, color, left, top, rotate, frame}) => {
  const pop = spring({frame, fps: 30, config: {damping: 11, stiffness: 190}});
  return <div style={{position: 'absolute', left, top, width: 440, padding: '27px 20px', borderRadius: 24, background: color, color: '#071a13', fontFamily: display, fontSize: 62, textAlign: 'center', boxShadow: `0 24px 60px ${color}55`, transform: `rotate(${rotate}deg) scale(${pop})`}}>{label}</div>;
};

const Gauntlet: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number}> = ({scene, manifest, accent, frame}) => {
  const second = frame >= 34;
  return <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', top: 70, left: 280}}><PokemonArt src={manifest.subject.artworkUrl} size={550} frame={frame} /></div>
    {(scene.facts ?? []).map((gym, index) => {
      const active = index === 0 || second;
      const color = index === 0 ? '#d1a56c' : '#65bfff';
      return <div key={gym} style={{position: 'absolute', left: index === 0 ? 55 : 565, top: index === 0 ? 140 : 520, width: 440, padding: '30px 24px', borderRadius: 28, background: active ? color : '#ffffff10', color: active ? '#071a13' : '#ffffff66', fontFamily: display, fontSize: 60, textAlign: 'center', border: `3px solid ${color}`, transform: `rotate(${index ? 3 : -3}deg) scale(${active ? 1 : 0.85})`, boxShadow: active ? `0 25px 70px ${color}55` : 'none'}}>{gym}<div style={{fontSize: 25, marginTop: 10}}>{active ? 'GRASS WINS' : 'NEXT?'}</div></div>;
    })}
    <div style={{position: 'absolute', left: 62, right: 62, top: 900, fontFamily: display, fontSize: 88, lineHeight: 0.9}}>TWO GYMS.<br/><span style={{color: accent}}>ONE ANSWER.</span></div>
  </div>;
};

const Advantage: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number}> = ({scene, manifest, frame}) => (
  <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', top: 20, left: 205}}><PokemonArt src={manifest.subject.artworkUrl} size={690} frame={frame} /></div>
    <TypePill label={scene.facts?.[0] ?? 'GRASS'} color="#64e49c" left={70} top={650} rotate={-5} frame={frame - 8} />
    <TypePill label={scene.facts?.[1] ?? 'POISON'} color="#9b73e8" left={490} top={760} rotate={5} frame={frame - 25} />
    <div style={{position: 'absolute', top: 945, left: 62, right: 62, fontFamily: display, fontSize: 88, lineHeight: 0.86}}>DOUBLE-TYPED.<br/><span style={{color: '#64e49c'}}>FROM THE START.</span></div>
  </div>
);

const Race: React.FC<{manifest: VideoManifest; accent: string; frame: number}> = ({manifest, accent, frame}) => {
  const venusaur = manifest.evolutions[2];
  const width = interpolate(frame, [8, 62], [0, 860], clamp);
  return <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', top: 0, left: 260}}><PokemonArt src={venusaur.artworkUrl} size={560} frame={frame} /></div>
    <div style={{position: 'absolute', left: 80, top: 600, width: 860, height: 18, background: '#ffffff18', borderRadius: 99}}><div style={{height: '100%', width, background: accent, boxShadow: `0 0 35px ${accent}`}} /></div>
    <div style={{position: 'absolute', left: 70, top: 665, fontFamily: display, fontSize: 150, color: accent}}>32</div>
    <div style={{position: 'absolute', right: 70, top: 690, textAlign: 'right', fontFamily: display, fontSize: 72, color: '#ffffff70'}}>36<br/><span style={{fontSize: 28}}>CHARIZARD + BLASTOISE</span></div>
    <div style={{position: 'absolute', left: 62, right: 62, top: 950, fontFamily: display, fontSize: 86, lineHeight: 0.88}}>FULLY EVOLVED.<br/><span style={{color: accent}}>FOUR LEVELS EARLY.</span></div>
  </div>;
};

const Tradeoff: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number}> = ({scene, manifest, accent, frame}) => (
  <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', top: 80, left: 300, filter: 'grayscale(.35)'}}><PokemonArt src={manifest.subject.artworkUrl} size={500} frame={frame} /></div>
    {(scene.facts ?? []).map((weakness, index) => {
      const positions = [[35, 105], [600, 115], [35, 610], [600, 630]];
      const [left, top] = positions[index];
      const pop = spring({frame: frame - index * 8, fps: 30, config: {damping: 10, stiffness: 210}});
      return <div key={weakness} style={{position: 'absolute', left, top, width: 410, padding: '25px 18px', borderRadius: 22, border: `3px solid ${accent}`, background: '#2a0d11e8', color: '#fff', fontFamily: display, fontSize: 42, textAlign: 'center', transform: `scale(${pop}) rotate(${index % 2 ? 4 : -4}deg)`, boxShadow: `0 18px 45px ${accent}44`}}>× {weakness}</div>;
    })}
    <div style={{position: 'absolute', left: 62, right: 62, top: 930, fontFamily: display, fontSize: 88, lineHeight: 0.88}}>THE CATCH?<br/><span style={{color: accent}}>FOUR WEAKNESSES.</span></div>
  </div>
);

const Cta: React.FC<{manifest: VideoManifest; accent: string; frame: number; headline: string}> = ({manifest, accent, frame, headline}) => (
  <div style={{position: 'absolute', inset: 0, textAlign: 'center'}}>
    <div style={{display: 'flex', justifyContent: 'center', marginTop: -10}}><PokemonArt src={manifest.subject.artworkUrl} size={670} frame={frame} /></div>
    <div style={{fontFamily: display, fontSize: 80, lineHeight: 0.87, margin: '-30px 45px 0'}}>{headline}</div>
    <div style={{display: 'flex', gap: 22, justifyContent: 'center', marginTop: 65}}>
      <div style={{background: accent, color: '#081a13', padding: '24px 38px', borderRadius: 22, fontFamily: display, fontSize: 43, transform: `rotate(-3deg) scale(${frame % 18 < 4 ? 1.06 : 1})`}}>SMART PICK</div>
      <div style={{border: '3px solid #fff', padding: '24px 38px', borderRadius: 22, fontFamily: display, fontSize: 43, transform: 'rotate(3deg)'}}>SAFE PICK</div>
    </div>
  </div>
);
