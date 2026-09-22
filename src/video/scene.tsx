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
  if (scene.visual === 'dex') return <Dex manifest={manifest} accent={accent} frame={frame} headline={scene.headline} />;
  if (scene.visual === 'types') return <Types manifest={manifest} accent={accent} frame={frame} />;
  if (scene.visual === 'biology') return <Biology manifest={manifest} accent={accent} frame={frame} />;
  if (scene.visual === 'evolution') return <Evolution manifest={manifest} accent={accent} frame={frame} />;
  if (scene.visual === 'moves') return <Moves scene={scene} manifest={manifest} accent={accent} frame={frame} />;
  return <Cta manifest={manifest} accent={accent} frame={frame} headline={scene.headline} />;
};

const Hook: React.FC<{manifest: VideoManifest; accent: string; frame: number; headline: string}> = ({manifest, accent, frame, headline}) => (
  <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', top: -30, left: 28, fontFamily: display, fontSize: 300, lineHeight: 0.8, color: '#ffffff08', letterSpacing: -16}}>#001</div>
    <div style={{position: 'absolute', left: 110, top: 120}}><PokemonArt src={manifest.subject.artworkUrl} size={860} frame={frame} /></div>
    <div style={{position: 'absolute', left: 58, top: 850, right: 58, fontFamily: display, fontSize: 92, lineHeight: 0.88, textTransform: 'uppercase'}}>{headline}</div>
    <div style={{position: 'absolute', right: 72, top: 142, padding: '15px 24px', borderRadius: 99, background: accent, color: '#061a13', fontFamily: display, fontSize: 30, transform: `rotate(${3 + Math.sin(frame / 8) * 2}deg)`}}>THE ORIGINAL STARTER</div>
  </div>
);

const Dex: React.FC<{manifest: VideoManifest; accent: string; frame: number; headline: string}> = ({manifest, accent, frame, headline}) => {
  const scan = interpolate(frame % 50, [0, 50], [120, 850]);
  return <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', left: 78, top: 58, width: 710, height: 710, borderRadius: '50%', border: `4px solid ${accent}55`, boxShadow: `inset 0 0 80px ${accent}20`}} />
    <div style={{position: 'absolute', left: 96, top: 28}}><PokemonArt src={manifest.subject.artworkUrl} size={700} frame={frame} /></div>
    <div style={{position: 'absolute', left: 40, right: 40, top: scan, height: 5, background: accent, boxShadow: `0 0 32px ${accent}`}} />
    <div style={{position: 'absolute', right: 50, top: 120, fontFamily: display, color: accent, fontSize: 150, writingMode: 'vertical-rl', opacity: 0.9}}>{manifest.subject.index}</div>
    <div style={{position: 'absolute', left: 60, top: 835, right: 70, fontFamily: display, fontSize: 83, lineHeight: 0.89}}>{headline}</div>
  </div>;
};

const Types: React.FC<{manifest: VideoManifest; accent: string; frame: number}> = ({manifest, frame}) => (
  <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', top: 0, left: 190}}><PokemonArt src={manifest.subject.artworkUrl} size={700} frame={frame} /></div>
    <TypePill label="GRASS" color="#64e49c" left={72} top={690} rotate={-4} frame={frame} />
    <TypePill label="POISON" color="#9b73e8" left={480} top={785} rotate={4} frame={frame - 5} />
    <div style={{position: 'absolute', top: 960, left: 62, right: 62, fontFamily: display, fontSize: 87, lineHeight: 0.9}}>TWO TYPES.<br/><span style={{color: manifest.palette.primary}}>FROM LEVEL ONE.</span></div>
  </div>
);

const TypePill: React.FC<{label: string; color: string; left: number; top: number; rotate: number; frame: number}> = ({label, color, left, top, rotate, frame}) => {
  const pop = spring({frame, fps: 30, config: {damping: 11, stiffness: 190}});
  return <div style={{position: 'absolute', left, top, width: 440, padding: '27px 20px', borderRadius: 24, background: color, color: '#071a13', fontFamily: display, fontSize: 62, textAlign: 'center', boxShadow: `0 24px 60px ${color}55`, transform: `rotate(${rotate}deg) scale(${pop})`}}>{label}</div>;
};

const Biology: React.FC<{manifest: VideoManifest; accent: string; frame: number}> = ({manifest, accent, frame}) => {
  const pulse = 1 + Math.sin(frame / 7) * 0.04;
  return <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', top: -30, left: 160}}><PokemonArt src={manifest.subject.artworkUrl} size={770} frame={frame} /></div>
    <div style={{position: 'absolute', left: 480, top: 30, width: 320, height: 320, borderRadius: '50%', border: `5px solid ${accent}`, boxShadow: `0 0 80px ${accent}88, inset 0 0 55px ${accent}44`, transform: `scale(${pulse})`}} />
    <div style={{position: 'absolute', left: 760, top: 310, width: 210, height: 4, background: accent, transform: 'rotate(28deg)', transformOrigin: 'left'}} />
    <div style={{position: 'absolute', right: 42, top: 455, width: 235, padding: '15px 18px', borderRadius: 18, background: '#061a13dd', border: `2px solid ${accent}88`, fontFamily: display, fontSize: 31, color: accent, letterSpacing: 2}}>SOLAR<br/>ENERGY<br/>STORAGE</div>
    <div style={{position: 'absolute', top: 860, left: 60, right: 60, fontFamily: display, fontSize: 84, lineHeight: 0.9}}>THE SEED<br/><span style={{color: accent}}>GROWS WITH IT.</span></div>
  </div>;
};

const Evolution: React.FC<{manifest: VideoManifest; accent: string; frame: number}> = ({manifest, accent, frame}) => (
  <div style={{position: 'absolute', inset: 0}}>
    <div style={{display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 0, height: 790}}>
      {manifest.evolutions.map((pokemon, index) => <div key={pokemon.index} style={{width: index === 2 ? 390 : 310, textAlign: 'center', position: 'relative'}}>
        <PokemonArt src={pokemon.artworkUrl} size={index === 2 ? 430 : 330} frame={frame} delay={index * 8} />
        <div style={{fontFamily: display, fontSize: 34, color: index === 2 ? accent : '#fff'}}>{pokemon.name.toUpperCase()}</div>
        <div style={{fontFamily: body, fontWeight: 900, color: '#ffffff70', marginTop: 5}}>{pokemon.index}</div>
      </div>)}
    </div>
    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, fontFamily: display, fontSize: 42}}><span>BASE</span><span style={{color: accent}}>→ 16 →</span><span>IVYSAUR</span><span style={{color: accent}}>→ 32 →</span><span>VENUSAUR</span></div>
    <div style={{position: 'absolute', left: 62, right: 62, top: 1000, fontFamily: display, fontSize: 86, lineHeight: 0.9}}>SEED TO<br/><span style={{color: accent}}>FULL BLOOM.</span></div>
  </div>
);

const Moves: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number}> = ({scene, manifest, accent, frame}) => (
  <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', top: 90, left: 300}}><PokemonArt src={manifest.subject.artworkUrl} size={500} frame={frame} /></div>
    {(scene.facts ?? []).map((move, index) => {
      const positions = [[45, 150], [585, 120], [40, 620], [590, 650]];
      const [left, top] = positions[index];
      const pop = spring({frame: frame - index * 4, fps: 30, config: {damping: 12, stiffness: 190}});
      return <div key={move} style={{position: 'absolute', left, top, width: 420, padding: '24px 20px', borderRadius: 22, border: `3px solid ${index === 3 ? '#f3d95b' : accent}`, background: '#071a13e8', color: index === 3 ? '#f3d95b' : '#fff', fontFamily: display, fontSize: 39, textAlign: 'center', transform: `scale(${pop}) rotate(${index % 2 ? 3 : -3}deg)`, boxShadow: '0 18px 45px #0008'}}>{move}</div>;
    })}
    <div style={{position: 'absolute', left: 62, right: 62, top: 930, fontFamily: display, fontSize: 88, lineHeight: 0.9}}>SERIOUS<br/><span style={{color: accent}}>BATTLE CONTROL.</span></div>
  </div>
);

const Cta: React.FC<{manifest: VideoManifest; accent: string; frame: number; headline: string}> = ({manifest, accent, frame, headline}) => (
  <div style={{position: 'absolute', inset: 0, textAlign: 'center'}}>
    <div style={{display: 'flex', justifyContent: 'center', marginTop: -10}}><PokemonArt src={manifest.subject.artworkUrl} size={670} frame={frame} /></div>
    <div style={{fontFamily: display, fontSize: 88, lineHeight: 0.9, margin: '-30px 55px 0'}}>{headline}</div>
    <div style={{display: 'flex', gap: 22, justifyContent: 'center', marginTop: 65}}>
      <div style={{background: accent, color: '#081a13', padding: '24px 38px', borderRadius: 22, fontFamily: display, fontSize: 46, transform: 'rotate(-3deg)'}}>UNDERRATED</div>
      <div style={{border: '3px solid #fff', padding: '24px 38px', borderRadius: 22, fontFamily: display, fontSize: 46, transform: 'rotate(3deg)'}}>CORRECT</div>
    </div>
  </div>
);
