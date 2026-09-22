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
      <Atmosphere accent={accent} frame={frame} sceneIndex={sceneIndex} visual={scene.visual} />
      <header style={{position: 'absolute', top: 64, left: 58, right: 58, height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 20}}>
        <div style={{fontFamily: display, letterSpacing: 5, fontSize: 29}}>POKE<span style={{color: accent}}>PULSES</span></div>
        <div style={{fontFamily: body, fontWeight: 900, letterSpacing: 2, fontSize: 24, border: `2px solid ${accent}`, color: accent, borderRadius: 99, padding: '9px 17px'}}>{manifest.subject.index}</div>
      </header>
      <div style={{position: 'absolute', top: 142, left: 58, right: 58, height: 7, background: '#ffffff18', borderRadius: 99, overflow: 'hidden', zIndex: 20}}>
        <div style={{width: `${progress * 100}%`, height: '100%', background: accent, boxShadow: `0 0 24px ${accent}`}} />
      </div>

      <div style={{position: 'absolute', inset: '175px 0 335px', opacity: enter, zIndex: 5}}>
        <Visual scene={scene} manifest={manifest} accent={accent} frame={frame} />
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

const Atmosphere: React.FC<{accent: string; frame: number; sceneIndex: number; visual: VideoScene['visual']}> = ({accent, frame, sceneIndex, visual}) => {
  const backgrounds: Record<VideoScene['visual'], string> = {
    hook: 'radial-gradient(circle at 50% 38%, #21364b 0%, #0b1725 48%, #05090e 100%)',
    gauntlet: 'linear-gradient(145deg, #142d24 0%, #081711 48%, #061018 100%)',
    advantage: 'radial-gradient(circle at 50% 42%, #26382f, #071b13 58%, #020906)',
    race: 'linear-gradient(160deg, #0c251b 0%, #071711 58%, #020805 100%)',
    tradeoff: 'radial-gradient(circle at 50% 42%, #471820, #17080c 55%, #030102)',
    cta: 'linear-gradient(180deg, #17283b 0%, #0b1725 58%, #160f09 100%)',
  };
  return <>
    <div style={{position: 'absolute', inset: 0, background: backgrounds[visual]}} />
    <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at ${25 + sceneIndex * 9}% ${25 + sceneIndex * 6}%, ${accent}28, transparent 38%)`}} />
    <div style={{position: 'absolute', inset: -280, opacity: 0.055, transform: `rotate(${frame * 0.08 + sceneIndex * 17}deg)`, background: `repeating-conic-gradient(from 0deg, transparent 0deg 17deg, ${accent} 18deg 18.7deg)`}} />
  </>;
};

const KineticCaption: React.FC<{text: string; frame: number; durationInFrames: number; accent: string}> = ({text, frame, durationInFrames, accent}) => {
  const words = text.split(/\s+/);
  const active = Math.min(words.length - 1, Math.floor((frame / Math.max(1, durationInFrames - 6)) * words.length));
  return <div style={{fontFamily: display, fontSize: words.length > 8 ? 61 : 72, lineHeight: 0.94, letterSpacing: 0.5, textTransform: 'uppercase', textShadow: '0 8px 25px #000'}}>
    {words.map((word, index) => {
      const shown = index <= active;
      return <span key={`${word}-${index}`} style={{display: 'inline-block', marginRight: 15, color: index === active ? accent : '#f8fff9', opacity: shown ? 1 : 0, transform: `translateY(${shown ? 0 : 12}px) scale(${index === active ? 1.06 : 1})`}}>{word}</span>;
    })}
  </div>;
};

const PokemonArt: React.FC<{src: string; size: number; frame: number; style?: React.CSSProperties}> = ({src, size, frame, style}) => {
  const reveal = spring({frame, fps: 30, config: {damping: 13, stiffness: 150, mass: 0.8}});
  return <Img src={src} style={{width: size, height: size, objectFit: 'contain', filter: 'drop-shadow(0 35px 32px #000a)', opacity: reveal, transform: `translateY(${(1 - reveal) * 80}px) scale(${0.72 + reveal * 0.28})`, ...style}} />;
};

const Pokeball: React.FC<{left: number; top: number; frame: number; delay?: number; selected?: boolean; size?: number}> = ({left, top, frame, delay = 0, selected = false, size = 210}) => {
  const enter = spring({frame: frame - delay, fps: 30, config: {damping: 13, stiffness: 180}});
  const pulse = selected ? 1 + Math.sin(Math.max(0, frame - delay) / 3) * 0.045 : 1;
  return <div style={{position: 'absolute', left, top, width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: `${Math.round(size * 0.045)}px solid #090b0d`, boxShadow: selected ? '0 0 70px #f3d95b99, 0 28px 50px #000b' : '0 24px 45px #000b', opacity: enter, transform: `translateY(${(1 - enter) * -160}px) rotate(${(1 - enter) * -120}deg) scale(${enter * pulse})`}}>
    <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(#e84c4c 0 46%, #0a0b0d 46% 56%, #f5f5ed 56%)'}} />
    <div style={{position: 'absolute', left: '50%', top: '51%', width: size * 0.31, height: size * 0.31, borderRadius: '50%', background: selected ? '#f3d95b' : '#f6f6ef', border: `${Math.round(size * 0.043)}px solid #0a0b0d`, transform: 'translate(-50%, -50%)', boxShadow: selected ? '0 0 25px #f3d95b' : 'none'}} />
  </div>;
};

const SpeedLines: React.FC<{frame: number; color: string; reverse?: boolean}> = ({frame, color, reverse = false}) => <>
  {Array.from({length: 12}, (_, index) => {
    const travel = ((frame * (18 + index * 1.3) + index * 97) % 1250) - 180;
    const left = reverse ? 1080 - travel : travel;
    return <div key={index} style={{position: 'absolute', left, top: 90 + index * 82, width: 160 + index * 13, height: 5 + index % 3, borderRadius: 99, opacity: 0.18 + (index % 4) * 0.08, background: color, transform: 'skewX(-24deg)'}} />;
  })}
</>;

const Visual: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number}> = ({scene, manifest, accent, frame}) => {
  if (scene.visual === 'hook') return <Hook manifest={manifest} accent={accent} frame={frame} headline={scene.headline} />;
  if (scene.visual === 'gauntlet') return <Gauntlet scene={scene} manifest={manifest} accent={accent} frame={frame} />;
  if (scene.visual === 'advantage') return <Advantage scene={scene} accent={accent} frame={frame} />;
  if (scene.visual === 'race') return <Race manifest={manifest} accent={accent} frame={frame} />;
  if (scene.visual === 'tradeoff') return <Tradeoff scene={scene} manifest={manifest} accent={accent} frame={frame} />;
  return <Cta accent={accent} frame={frame} headline={scene.headline} />;
};

const Hook: React.FC<{manifest: VideoManifest; accent: string; frame: number; headline: string}> = ({manifest, accent, frame, headline}) => {
  const reveal = spring({frame: frame - 45, fps: 30, config: {damping: 12, stiffness: 180}});
  const curtain = interpolate(frame, [36, 55], [0, 1], clamp);
  return <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', top: 50, left: 68, right: 68, height: 750, borderRadius: 42, border: '3px solid #ffffff1c', background: 'linear-gradient(180deg, #bddfff10, #07121a44)', overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 0, top: 370, width: '100%', height: 4, background: '#ffffff18'}} />
      {[0, 1, 2].map((index) => <div key={index} style={{position: 'absolute', left: 130 + index * 300, top: 70, width: 4, height: 620, background: `linear-gradient(transparent, ${index === 1 ? accent : '#ffffff'}30, transparent)`, transform: `rotate(${index === 1 ? 0 : index ? 18 : -18}deg)`}} />)}
      <div style={{position: 'absolute', left: 60, right: 60, top: 105, textAlign: 'center', fontFamily: display, fontSize: 35, letterSpacing: 8, color: '#ffffff8a'}}>THREE STARTERS. ONE SECRET.</div>
      <Pokeball left={65} top={430} frame={frame} size={155} />
      <Pokeball left={385} top={405} frame={frame} delay={4} selected={frame > 32} size={175} />
      <Pokeball left={720} top={430} frame={frame} delay={8} size={155} />
      <div style={{position: 'absolute', left: 355, top: 180, width: 270, height: 300, opacity: reveal, filter: frame < 52 ? 'brightness(0)' : 'none', transform: `translateY(${(1 - reveal) * 70}px) scale(${0.65 + reveal * 0.35})`}}>
        <PokemonArt src={manifest.subject.artworkUrl} size={270} frame={frame - 45} />
      </div>
      <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(circle at 50% 40%, ${accent}${Math.round(curtain * 70).toString(16).padStart(2, '0')}, transparent ${18 + curtain * 22}%)`}} />
    </div>
    <div style={{position: 'absolute', left: 55, right: 55, top: 880, fontFamily: display, fontSize: 92, lineHeight: 0.86, textAlign: 'center', textTransform: 'uppercase', textShadow: '0 12px 26px #000'}}>{headline}</div>
  </div>;
};

const GymGate: React.FC<{label: string; color: string; left: number; top: number; frame: number; openAt: number}> = ({label, color, left, top, frame, openAt}) => {
  const open = spring({frame: frame - openAt, fps: 30, config: {damping: 13, stiffness: 170}});
  return <div style={{position: 'absolute', left, top, width: 340, height: 260}}>
    <div style={{position: 'absolute', left: 0, right: 0, top: 0, textAlign: 'center', fontFamily: display, fontSize: 47, color, letterSpacing: 4}}>{label}</div>
    <div style={{position: 'absolute', left: 30 - open * 100, top: 75, width: 135, height: 160, borderRadius: '18px 5px 5px 18px', background: `linear-gradient(135deg, ${color}, #17191c)`, border: '5px solid #050607', transform: `rotateY(${open * 54}deg)`}} />
    <div style={{position: 'absolute', right: 30 - open * 100, top: 75, width: 135, height: 160, borderRadius: '5px 18px 18px 5px', background: `linear-gradient(225deg, ${color}, #17191c)`, border: '5px solid #050607', transform: `rotateY(${-open * 54}deg)`}} />
    <div style={{position: 'absolute', left: 168, top: 129, width: 18, height: 18, borderRadius: '50%', background: open > 0.5 ? '#64f1a5' : '#ff706d', boxShadow: `0 0 20px ${open > 0.5 ? '#64f1a5' : '#ff706d'}`}} />
  </div>;
};

const Gauntlet: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number}> = ({scene, manifest, accent, frame}) => {
  const route = interpolate(frame, [5, 82], [0, 1], clamp);
  const x = interpolate(route, [0, 0.5, 1], [80, 455, 815]);
  const y = interpolate(route, [0, 0.5, 1], [790, 500, 185]);
  return <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', left: 90, top: 175, width: 850, height: 700, borderRadius: 50, background: '#07140fbb', border: '3px solid #ffffff12', transform: 'rotate(-3deg)'}} />
    <svg viewBox="0 0 1080 1050" style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}>
      <path d="M95 850 C260 740 360 650 500 540 S720 330 930 180" fill="none" stroke="#ffffff20" strokeWidth="44" strokeLinecap="round" />
      <path d="M95 850 C260 740 360 650 500 540 S720 330 930 180" fill="none" stroke={accent} strokeWidth="12" strokeLinecap="round" strokeDasharray="1000" strokeDashoffset={1000 - route * 1000} />
    </svg>
    <GymGate label={scene.facts?.[0] ?? 'BROCK'} color="#d1a56c" left={185} top={540} frame={frame} openAt={24} />
    <GymGate label={scene.facts?.[1] ?? 'MISTY'} color="#75d8ff" left={585} top={145} frame={frame} openAt={62} />
    <div style={{position: 'absolute', left: x, top: y, width: 170, height: 170, transform: `translate(-50%, -50%) rotate(${Math.sin(frame / 5) * 5}deg)`, zIndex: 8}}>
      <PokemonArt src={manifest.subject.artworkUrl} size={170} frame={frame} />
    </div>
    <div style={{position: 'absolute', left: 60, top: 940, fontFamily: display, fontSize: 76, lineHeight: 0.9}}>THE MAP KEEPS<br/><span style={{color: accent}}>OPENING FOR IT.</span></div>
  </div>;
};

const Advantage: React.FC<{scene: VideoScene; accent: string; frame: number}> = ({scene, accent, frame}) => {
  const split = spring({frame: frame - 20, fps: 30, config: {damping: 12, stiffness: 155}});
  const pulse = 1 + Math.sin(frame / 7) * 0.025;
  return <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', left: 145, top: 40, width: 790, height: 790, borderRadius: '48% 52% 56% 44% / 60% 44% 56% 40%', background: 'linear-gradient(135deg, #6ee69f 0 49.5%, #8a62d7 50.5%)', transform: `rotate(-9deg) scale(${pulse})`, boxShadow: '0 0 90px #64f1a544', overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: '50%', top: 0, bottom: 0, width: 12, background: '#061a13', transform: `translateX(-50%) scaleY(${split})`, boxShadow: '0 0 35px #000'}} />
      {Array.from({length: 7}, (_, index) => <div key={index} style={{position: 'absolute', left: 80 + index * 100, top: 110 + (index % 3) * 190, width: 40, height: 120, borderRadius: '100% 0 100% 0', border: '8px solid #ffffff38', transform: `rotate(${frame + index * 40}deg)`}} />)}
      <div style={{position: 'absolute', left: 75, top: 310, fontFamily: display, fontSize: 72, color: '#062016', transform: `translateX(${(1 - split) * 120}px)`}}>{scene.facts?.[0] ?? 'GRASS'}</div>
      <div style={{position: 'absolute', right: 55, top: 310, fontFamily: display, fontSize: 67, color: '#100820', transform: `translateX(${(1 - split) * -120}px)`}}>{scene.facts?.[1] ?? 'POISON'}</div>
    </div>
    <div style={{position: 'absolute', left: 0, right: 0, top: 860, textAlign: 'center', fontFamily: display, fontSize: 38, letterSpacing: 7, color: '#ffffff85'}}>CUTAWAY: WHAT THE SEED HID</div>
    <div style={{position: 'absolute', left: 68, right: 68, top: 965, fontFamily: display, fontSize: 85, lineHeight: 0.88, textAlign: 'center'}}>ONE CHOICE.<br/><span style={{color: accent}}>TWO TYPES.</span></div>
  </div>;
};

const Race: React.FC<{manifest: VideoManifest; accent: string; frame: number}> = ({manifest, accent, frame}) => {
  const stages = manifest.evolutions.length === 3 ? manifest.evolutions : [{name: manifest.subject.name, artworkUrl: manifest.subject.artworkUrl, index: manifest.subject.index}];
  const progress = interpolate(frame, [5, 92], [0, 1], clamp);
  const positions = [{x: 85, y: 675, size: 235, level: '05'}, {x: 400, y: 395, size: 270, level: '16'}, {x: 700, y: 85, size: 330, level: '32'}];
  return <div style={{position: 'absolute', inset: 0}}>
    <SpeedLines frame={frame} color={accent} />
    <svg viewBox="0 0 1080 1050" style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}>
      <path d="M110 850 L500 560 L925 205" fill="none" stroke="#ffffff18" strokeWidth="28" strokeLinecap="round" />
      <path d="M110 850 L500 560 L925 205" fill="none" stroke={accent} strokeWidth="10" strokeLinecap="round" strokeDasharray="1150" strokeDashoffset={1150 - progress * 1150} />
    </svg>
    {stages.map((stage, index) => {
      const position = positions[Math.min(index, positions.length - 1)];
      return <div key={stage.name} style={{position: 'absolute', left: position.x, top: position.y, opacity: interpolate(frame, [index * 24 + 4, index * 24 + 14], [0, 1], clamp)}}>
        <div style={{fontFamily: display, fontSize: 31, color: accent, letterSpacing: 4}}>LV {position.level}</div>
        <PokemonArt src={stage.artworkUrl} size={position.size} frame={frame - index * 24} />
        <div style={{fontFamily: display, fontSize: 36, marginTop: -25}}>{stage.name.toUpperCase()}</div>
      </div>;
    })}
    <div style={{position: 'absolute', right: 55, top: 690, width: 290, height: 220, border: '4px dashed #ffffff38', borderRadius: 30, padding: 28, transform: 'rotate(4deg)', background: '#06130dcc'}}>
      <div style={{fontFamily: display, fontSize: 88, color: '#ffffff72'}}>36</div>
      <div style={{fontFamily: display, fontSize: 29, color: '#ffffff8a'}}>OTHER FINAL FORMS</div>
    </div>
    <div style={{position: 'absolute', left: 55, top: 980, fontFamily: display, fontSize: 70}}>THE SEED <span style={{color: accent}}>GETS THERE FIRST.</span></div>
  </div>;
};

const Tradeoff: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number}> = ({scene, manifest, accent, frame}) => {
  const colors = ['#ff6b3d', '#8fe8ff', '#d8d8ef', '#c071ff'];
  const cards = [{x: 40, y: 80, r: -8}, {x: 650, y: 170, r: 7}, {x: 60, y: 690, r: 6}, {x: 680, y: 760, r: -7}];
  const dodge = interpolate(frame, [25, 45, 70], [0, 130, -50], clamp);
  return <div style={{position: 'absolute', inset: 0}}>
    <SpeedLines frame={frame} color="#ff706d" reverse />
    <div style={{position: 'absolute', left: 370 + dodge, top: 370, width: 330, height: 330, transform: `rotate(${Math.sin(frame / 5) * 5}deg)`, filter: frame > 65 ? 'grayscale(.65) brightness(.7)' : 'none'}}>
      <PokemonArt src={manifest.subject.artworkUrl} size={330} frame={frame} />
    </div>
    {(scene.facts ?? []).map((fact, index) => {
      const card = cards[index];
      const enter = spring({frame: frame - (8 + index * 11), fps: 30, config: {damping: 11, stiffness: 190}});
      const travel = Math.min(1, Math.max(0, (frame - 55) / 28));
      const targetX = 420 + (index % 2) * 130;
      const targetY = 430 + Math.floor(index / 2) * 120;
      const x = card.x + (targetX - card.x) * travel;
      const y = card.y + (targetY - card.y) * travel;
      return <div key={fact} style={{position: 'absolute', left: x, top: y, width: 330, padding: '27px 18px', borderRadius: 24, background: colors[index], color: '#14060a', fontFamily: display, fontSize: 52, textAlign: 'center', boxShadow: `0 0 50px ${colors[index]}88`, transform: `rotate(${card.r + frame * (index % 2 ? -0.2 : 0.2)}deg) scale(${enter})`, zIndex: 8}}>{fact}</div>;
    })}
    <div style={{position: 'absolute', left: 65, right: 65, top: 1010, fontFamily: display, fontSize: 75, lineHeight: 0.88}}>THE ADVANTAGE<br/><span style={{color: accent}}>WAS NEVER FOREVER.</span></div>
  </div>;
};

const Cta: React.FC<{accent: string; frame: number; headline: string}> = ({accent, frame, headline}) => {
  const choose = spring({frame: frame - 16, fps: 30, config: {damping: 12, stiffness: 175}});
  return <div style={{position: 'absolute', inset: 0, textAlign: 'center'}}>
    <div style={{position: 'absolute', left: 0, right: 0, top: 15, fontFamily: display, fontSize: 34, letterSpacing: 9, color: '#ffffff80'}}>YOU FINISHED THE STORY</div>
    <div style={{position: 'absolute', left: 70, right: 70, top: 130, height: 730, overflow: 'hidden', borderRadius: 46, border: '3px solid #ffffff18', background: '#071018aa'}}>
      <div style={{position: 'absolute', left: 440, top: 300, width: 4, height: 500, background: '#ffffff20'}} />
      <div style={{position: 'absolute', left: 0, right: '50%', top: 0, bottom: 0, background: 'radial-gradient(circle at 50% 38%, #f3d95b35, transparent 52%)'}} />
      <div style={{position: 'absolute', left: '50%', right: 0, top: 0, bottom: 0, background: 'radial-gradient(circle at 50% 38%, #64f1a535, transparent 52%)'}} />
      <Pokeball left={115} top={105} frame={frame} selected size={230} />
      <Pokeball left={575} top={105} frame={frame} delay={5} selected size={230} />
      <div style={{position: 'absolute', left: 65, top: 405, width: 350, padding: '28px 18px', borderRadius: 24, background: '#f3d95b', color: '#151005', fontFamily: display, fontSize: 50, transform: `rotate(-3deg) scale(${choose})`}}>EASY MODE</div>
      <div style={{position: 'absolute', right: 65, top: 405, width: 350, padding: '28px 18px', borderRadius: 24, background: '#64f1a5', color: '#061a13', fontFamily: display, fontSize: 50, transform: `rotate(3deg) scale(${choose})`}}>SMART DESIGN</div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 590, fontFamily: display, fontSize: 36, letterSpacing: 8, color: accent, opacity: choose}}>COMMENT YOUR PICK</div>
    </div>
    <div style={{position: 'absolute', top: 925, left: 45, right: 45, fontFamily: display, fontSize: 82, lineHeight: 0.88, textShadow: '0 9px 20px #000'}}>{headline}</div>
  </div>;
};
