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

      <div style={{position: 'absolute', inset: '175px 0 335px', opacity: enter, transform: `translate(${Math.sin(frame / 19) * 4}px, ${Math.cos(frame / 23) * 3}px) scale(${0.94 + enter * 0.06 + frame / durationInFrames * 0.025})`, zIndex: 5}}>
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

const Atmosphere: React.FC<{accent: string; frame: number; sceneIndex: number; visual: VideoScene['visual']}> = ({accent, frame, sceneIndex, visual}) => {
  const backgrounds: Record<VideoScene['visual'], string> = {
    hook: 'linear-gradient(180deg, #17283b 0%, #0b1725 58%, #23160e 59%, #080604 100%)',
    gauntlet: 'linear-gradient(135deg, #372b20 0%, #16120f 48%, #092d43 52%, #061824 100%)',
    advantage: 'radial-gradient(circle at 50% 40%, #314a37, #071b13 58%, #020906)',
    race: 'linear-gradient(180deg, #152f27 0%, #071711 62%, #020805 100%)',
    tradeoff: 'radial-gradient(circle at 50% 42%, #471820, #17080c 55%, #030102)',
    cta: 'linear-gradient(180deg, #17283b 0%, #0b1725 58%, #23160e 59%, #080604 100%)',
  };
  return <>
    <div style={{position: 'absolute', inset: 0, background: backgrounds[visual]}} />
    <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at ${25 + sceneIndex * 9}% ${25 + sceneIndex * 6}%, ${accent}33, transparent 38%)`}} />
    <div style={{position: 'absolute', inset: -280, opacity: 0.08, transform: `rotate(${frame * 0.12 + sceneIndex * 17}deg)`, background: `repeating-conic-gradient(from 0deg, transparent 0deg 17deg, ${accent} 18deg 18.7deg)`}} />
  </>;
};

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

const Pokeball: React.FC<{left: number; top: number; frame: number; delay?: number; selected?: boolean; size?: number}> = ({left, top, frame, delay = 0, selected = false, size = 210}) => {
  const enter = spring({frame: frame - delay, fps: 30, config: {damping: 13, stiffness: 180}});
  const pulse = selected ? 1 + Math.sin(Math.max(0, frame - delay) / 3) * 0.045 : 1;
  return <div style={{position: 'absolute', left, top, width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: '10px solid #090b0d', boxShadow: selected ? '0 0 70px #f3d95b99, 0 28px 50px #000b' : '0 24px 45px #000b', opacity: enter, transform: `translateY(${(1 - enter) * -180}px) rotate(${(1 - enter) * -120}deg) scale(${enter * pulse})`}}>
    <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(#e84c4c 0 46%, #0a0b0d 46% 56%, #f5f5ed 56%)'}} />
    <div style={{position: 'absolute', left: '50%', top: '51%', width: size * 0.31, height: size * 0.31, borderRadius: '50%', background: selected ? '#f3d95b' : '#f6f6ef', border: '9px solid #0a0b0d', transform: 'translate(-50%, -50%)', boxShadow: selected ? '0 0 25px #f3d95b' : 'none'}} />
  </div>;
};

const SpeedLines: React.FC<{frame: number; color: string; reverse?: boolean}> = ({frame, color, reverse = false}) => <>
  {Array.from({length: 12}, (_, index) => {
    const travel = ((frame * (18 + index * 1.3) + index * 97) % 1250) - 180;
    const left = reverse ? 1080 - travel : travel;
    return <div key={index} style={{position: 'absolute', left, top: 90 + index * 82, width: 160 + index * 13, height: 5 + index % 3, borderRadius: 99, opacity: 0.18 + (index % 4) * 0.08, background: color, transform: `skewX(-24deg)`}} />;
  })}
</>;

const LeafBurst: React.FC<{frame: number; originX: number; originY: number; color?: string}> = ({frame, originX, originY, color = '#64f1a5'}) => <>
  {Array.from({length: 14}, (_, index) => {
    const angle = index / 14 * Math.PI * 2;
    const distance = interpolate(frame, [8 + index % 3, 34], [0, 210 + index * 8], clamp);
    const opacity = interpolate(frame, [8, 22, 42], [0, 1, 0], clamp);
    return <div key={index} style={{position: 'absolute', left: originX + Math.cos(angle) * distance, top: originY + Math.sin(angle) * distance, width: 15, height: 42, borderRadius: '100% 0 100% 0', background: color, opacity, transform: `rotate(${angle * 180 / Math.PI + frame * 8}deg)`, boxShadow: `0 0 16px ${color}`}} />;
  })}
</>;

const Visual: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number; durationInFrames: number}> = ({scene, manifest, accent, frame}) => {
  if (scene.visual === 'hook') return <Hook manifest={manifest} accent={accent} frame={frame} headline={scene.headline} />;
  if (scene.visual === 'gauntlet') return <Gauntlet scene={scene} manifest={manifest} accent={accent} frame={frame} />;
  if (scene.visual === 'advantage') return <Advantage scene={scene} manifest={manifest} accent={accent} frame={frame} />;
  if (scene.visual === 'race') return <Race manifest={manifest} accent={accent} frame={frame} />;
  if (scene.visual === 'tradeoff') return <Tradeoff scene={scene} manifest={manifest} accent={accent} frame={frame} />;
  return <Cta manifest={manifest} accent={accent} frame={frame} headline={scene.headline} />;
};

const Hook: React.FC<{manifest: VideoManifest; accent: string; frame: number; headline: string}> = ({manifest, accent, frame, headline}) => {
  const choice = spring({frame: frame - 14, fps: 30, config: {damping: 11, stiffness: 190}});
  const flash = interpolate(frame, [14, 17, 24], [0, 0.9, 0], clamp);
  const stamp = spring({frame: frame - 31, fps: 30, config: {damping: 9, stiffness: 220}});
  return <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', top: 35, left: 78, right: 78, height: 410, borderRadius: '38px 38px 10px 10px', background: 'linear-gradient(180deg, #d8f2ff18, #86caff08)', border: '4px solid #bce9ff28', boxShadow: 'inset 0 0 70px #78bfff18'}} />
    <div style={{position: 'absolute', top: 450, left: -80, right: -80, height: 300, background: 'linear-gradient(175deg, #6a4228, #25170e)', borderTop: '14px solid #9b6742', transform: 'perspective(700px) rotateX(58deg)', boxShadow: '0 -25px 55px #0008'}} />
    <div style={{position: 'absolute', top: 64, left: 0, right: 0, textAlign: 'center', fontFamily: display, fontSize: 42, letterSpacing: 9, color: '#ffffff9a'}}>OAK'S LAB • YOUR FIRST CHOICE</div>
    <Pokeball left={95} top={420} frame={frame} delay={0} />
    <Pokeball left={435} top={392} frame={frame} delay={3} selected />
    <Pokeball left={775} top={420} frame={frame} delay={6} />
    <div style={{position: 'absolute', left: 202, top: 410, width: 680, height: 430, opacity: choice, transform: `translateY(${(1 - choice) * 180}px) scale(${0.45 + choice * 0.55})`, filter: frame < 16 ? 'brightness(0)' : 'none'}}>
      <PokemonArt src={manifest.subject.artworkUrl} size={680} frame={frame - 13} style={{filter: 'drop-shadow(0 45px 45px #000c)'}} />
    </div>
    <LeafBurst frame={frame - 10} originX={540} originY={570} />
    <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 42%, #fff ${flash * 3}%, ${accent}${Math.round(flash * 80).toString(16).padStart(2, '0')} 12%, transparent 40%)`, pointerEvents: 'none'}} />
    <div style={{position: 'absolute', left: 50, right: 50, top: 870, fontFamily: display, fontSize: 89, lineHeight: 0.86, textAlign: 'center', textTransform: 'uppercase', transform: `rotate(-2deg) scale(${stamp})`, textShadow: '0 12px 26px #000'}}>{headline}</div>
    <div style={{position: 'absolute', right: 58, top: 205, padding: '15px 24px', borderRadius: 99, background: accent, color: '#061a13', fontFamily: display, fontSize: 30, transform: `rotate(-5deg) scale(${stamp})`}}>THE IGNORED PICK</div>
  </div>;
};

const TypePill: React.FC<{label: string; color: string; left: number; top: number; rotate: number; frame: number}> = ({label, color, left, top, rotate, frame}) => {
  const pop = spring({frame, fps: 30, config: {damping: 11, stiffness: 190}});
  return <div style={{position: 'absolute', left, top, width: 440, padding: '27px 20px', borderRadius: 24, background: color, color: '#071a13', fontFamily: display, fontSize: 62, textAlign: 'center', boxShadow: `0 24px 60px ${color}55`, transform: `rotate(${rotate}deg) scale(${pop})`}}>{label}</div>;
};

const Gauntlet: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number}> = ({scene, manifest, accent, frame}) => {
  const second = frame >= 39;
  const wipe = interpolate(frame, [35, 43], [0, 100], clamp);
  const dashX = second
    ? interpolate(frame, [39, 70], [-420, 540], clamp)
    : interpolate(frame, [0, 32], [-420, 430], clamp);
  const impactFrame = second ? frame - 48 : frame - 18;
  const shake = impactFrame >= 0 && impactFrame < 8 ? Math.sin(impactFrame * 5) * (8 - impactFrame) * 2 : 0;
  return <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', inset: 0, transform: `translateX(${shake}px)`, background: 'linear-gradient(160deg, #59452e, #21170f 65%, #0d0907)'}}>
      {Array.from({length: 7}, (_, index) => <div key={index} style={{position: 'absolute', left: 40 + index * 165, top: 130 + (index % 3) * 190, width: 130, height: 100, borderRadius: 18, background: '#8e7654', border: '6px solid #3b2e20', transform: `rotate(${index % 2 ? 12 : -9}deg) translate(${Math.max(0, impactFrame) * (index - 3) * 2}px, ${Math.max(0, impactFrame) * ((index % 3) - 1) * 3}px)`, boxShadow: 'inset 0 -18px 25px #31261c88'}} />)}
      <div style={{position: 'absolute', left: 52, top: 65, fontFamily: display, fontSize: 78, letterSpacing: 5, color: '#d1a56c'}}>PEWTER GYM</div>
    </div>
    <div style={{position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - wipe}% 0 0)`, background: 'linear-gradient(180deg, #0f668e, #07304b 60%, #021724)'}}>
      {Array.from({length: 6}, (_, index) => <div key={index} style={{position: 'absolute', left: -150 + index * 230 + Math.sin((frame + index * 12) / 8) * 70, top: 370 + index * 78, width: 420, height: 90, borderRadius: '50%', borderTop: '14px solid #78dcff', opacity: 0.48}} />)}
      <div style={{position: 'absolute', left: 52, top: 65, fontFamily: display, fontSize: 78, letterSpacing: 5, color: '#75d8ff'}}>CERULEAN GYM</div>
    </div>
    <SpeedLines frame={frame} color={second ? '#75d8ff' : '#d1a56c'} />
    <div style={{position: 'absolute', left: dashX, top: 255, transform: `rotate(${second ? -5 : 4}deg) scaleX(${second ? 1 : 1})`}}><PokemonArt src={manifest.subject.artworkUrl} size={570} frame={frame} style={{filter: `drop-shadow(0 38px 35px #000c) blur(${Math.abs(Math.sin(frame / 2)) * 0.15}px)`}} /></div>
    <LeafBurst frame={impactFrame} originX={second ? 720 : 670} originY={500} color={second ? '#9ef7c3' : accent} />
    <div style={{position: 'absolute', left: 62, top: 770, fontFamily: display, fontSize: 48, color: second ? '#75d8ff' : '#d1a56c', letterSpacing: 5}}>{second ? (scene.facts?.[1] ?? 'MISTY') : (scene.facts?.[0] ?? 'BROCK')} • ADVANTAGE</div>
    <div style={{position: 'absolute', left: 62, right: 62, top: 900, fontFamily: display, fontSize: 88, lineHeight: 0.9}}>TWO GYMS.<br/><span style={{color: accent}}>ONE ANSWER.</span></div>
  </div>;
};

const Advantage: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number}> = ({scene, manifest, frame}) => {
  const orbit = frame * 0.055;
  const centerX = 540;
  const centerY = 440;
  const types = [
    {label: scene.facts?.[0] ?? 'GRASS', color: '#64e49c', angle: orbit},
    {label: scene.facts?.[1] ?? 'POISON', color: '#9b73e8', angle: orbit + Math.PI},
  ];
  return <div style={{position: 'absolute', inset: 0}}>
    {Array.from({length: 9}, (_, index) => <div key={index} style={{position: 'absolute', left: 70 + index * 125 + Math.sin((frame + index * 8) / 12) * 45, top: 80 + (index % 4) * 215, width: 80, height: 180, borderRadius: '100% 0 100% 0', background: index % 2 ? '#9b73e844' : '#64e49c44', transform: `rotate(${frame * (index % 2 ? -1.5 : 1.8) + index * 37}deg)`, filter: 'blur(2px)'}} />)}
    <div style={{position: 'absolute', left: 160, top: 35, width: 760, height: 760, borderRadius: '50%', border: '3px solid #ffffff18', boxShadow: 'inset 0 0 90px #64e49c20'}} />
    <div style={{position: 'absolute', top: 90, left: 220, transform: `rotate(${Math.sin(frame / 13) * 2}deg)`}}><PokemonArt src={manifest.subject.artworkUrl} size={650} frame={frame} /></div>
    {types.map((type, index) => {
      const x = centerX + Math.cos(type.angle) * 360 - 175;
      const y = centerY + Math.sin(type.angle) * 230 - 55;
      return <div key={type.label} style={{position: 'absolute', left: x, top: y, width: 350, padding: '22px 18px', borderRadius: 26, background: type.color, color: '#071a13', fontFamily: display, fontSize: 54, textAlign: 'center', boxShadow: `0 22px 60px ${type.color}77`, transform: `rotate(${index ? 4 : -4}deg)`, zIndex: Math.sin(type.angle) > 0 ? 8 : 2}}>{type.label}</div>;
    })}
    <LeafBurst frame={frame - 8} originX={540} originY={430} />
    <div style={{position: 'absolute', top: 900, left: 62, right: 62, fontFamily: display, fontSize: 88, lineHeight: 0.86}}>TWO TYPES.<br/><span style={{color: '#64e49c'}}>BEFORE BATTLE ONE.</span></div>
  </div>;
};

const Race: React.FC<{manifest: VideoManifest; accent: string; frame: number}> = ({manifest, accent, frame}) => {
  const stages = manifest.evolutions.length === 3 ? manifest.evolutions : [
    {name: manifest.subject.name, artworkUrl: manifest.subject.artworkUrl, index: manifest.subject.index},
  ];
  const activeStage = frame < 24 ? 0 : frame < 50 ? Math.min(1, stages.length - 1) : stages.length - 1;
  const stageStart = activeStage === 0 ? 0 : activeStage === 1 ? 24 : 50;
  const evolutionFlash = Math.max(
    interpolate(frame, [20, 24, 31], [0, 1, 0], clamp),
    interpolate(frame, [46, 50, 58], [0, 1, 0], clamp),
  );
  const width = interpolate(frame, [8, 62], [0, 860], clamp);
  return <div style={{position: 'absolute', inset: 0}}>
    <SpeedLines frame={frame} color={accent} />
    <div style={{position: 'absolute', left: -40, right: -40, top: 560, height: 230, background: 'linear-gradient(180deg, #183d2c, #07150e)', transform: 'perspective(650px) rotateX(58deg)', borderTop: `8px solid ${accent}55`}} />
    {stages.map((stage, index) => <div key={stage.name} style={{position: 'absolute', top: index === 2 ? -25 : 75, left: index === 2 ? 205 : 275, opacity: activeStage === index ? 1 : 0, transform: `translateX(${activeStage === index ? 0 : index < activeStage ? -260 : 260}px) scale(${activeStage === index ? 1 : 0.5})`, transition: 'none'}}><PokemonArt src={stage.artworkUrl} size={index === 2 ? 680 : 540} frame={frame - stageStart} /></div>)}
    <div style={{position: 'absolute', inset: 0, opacity: evolutionFlash, background: 'radial-gradient(circle at 50% 34%, #fff 0 8%, #b5ffcc 18%, transparent 48%)', mixBlendMode: 'screen'}} />
    <LeafBurst frame={frame - 44} originX={540} originY={390} />
    <div style={{position: 'absolute', left: 80, top: 650, width: 860, height: 18, background: '#ffffff18', borderRadius: 99}}><div style={{height: '100%', width, background: accent, boxShadow: `0 0 35px ${accent}`}} /></div>
    <div style={{position: 'absolute', left: 70, top: 705, fontFamily: display, fontSize: 150, color: accent}}>32</div>
    <div style={{position: 'absolute', right: 70, top: 730, textAlign: 'right', fontFamily: display, fontSize: 72, color: '#ffffff70'}}>36<br/><span style={{fontSize: 28}}>THE OTHER FINAL FORMS</span></div>
    <div style={{position: 'absolute', left: 62, right: 62, top: 950, fontFamily: display, fontSize: 86, lineHeight: 0.88}}>FULLY EVOLVED.<br/><span style={{color: accent}}>FOUR LEVELS EARLY.</span></div>
  </div>;
};

const Tradeoff: React.FC<{scene: VideoScene; manifest: VideoManifest; accent: string; frame: number}> = ({scene, manifest, accent, frame}) => {
  const hit = Math.max(0, frame - 49);
  const dodgeX = interpolate(frame, [38, 49, 61], [0, -90, 50], clamp);
  const shake = hit < 9 ? Math.sin(hit * 5.5) * (9 - hit) * 2.2 : 0;
  const colors = ['#ff6b3d', '#8fe8ff', '#d8d8ef', '#c071ff'];
  const origins = [[-240, 150], [1100, 210], [-230, 650], [1110, 720]];
  return <div style={{position: 'absolute', inset: 0, transform: `translateX(${shake}px)`}}>
    <div style={{position: 'absolute', inset: 0, background: `repeating-conic-gradient(from ${frame * 1.6}deg at 50% 38%, #0000 0 12deg, #ff706d12 13deg 18deg)`}} />
    <SpeedLines frame={frame} color="#ff706d" reverse />
    {(scene.facts ?? []).map((weakness, index) => {
      const [fromX, fromY] = origins[index];
      const start = 5 + index * 9;
      const travel = interpolate(frame, [start, 53], [0, 1], clamp);
      const left = fromX + (500 - fromX) * travel;
      const top = fromY + (410 - fromY) * travel;
      return <React.Fragment key={weakness}>
        <div style={{position: 'absolute', left: left - 180, top: top + 38, width: 230, height: 18, borderRadius: 99, background: `linear-gradient(90deg, transparent, ${colors[index]})`, opacity: 0.75, transform: `rotate(${index % 2 ? -10 : 10}deg)`, filter: 'blur(3px)'}} />
        <div style={{position: 'absolute', left, top, width: 235, padding: '20px 10px', borderRadius: 22, background: colors[index], color: '#13060a', fontFamily: display, fontSize: 38, textAlign: 'center', boxShadow: `0 0 45px ${colors[index]}`, transform: `rotate(${frame * (index % 2 ? -2 : 2)}deg) scale(${0.75 + travel * 0.25})`}}>{weakness}</div>
      </React.Fragment>;
    })}
    <div style={{position: 'absolute', top: 105, left: 270 + dodgeX, filter: `grayscale(${frame > 52 ? 0.55 : 0}) brightness(${frame > 52 ? 0.7 : 1})`, transform: `rotate(${frame > 49 ? -8 : 0}deg)`}}><PokemonArt src={manifest.subject.artworkUrl} size={540} frame={frame} /></div>
    <div style={{position: 'absolute', left: 540, top: 430, width: 30 + Math.min(hit, 18) * 26, height: 30 + Math.min(hit, 18) * 26, borderRadius: '50%', border: `12px solid ${accent}`, opacity: interpolate(hit, [0, 4, 18], [0, 1, 0], clamp), transform: 'translate(-50%, -50%)'}} />
    <div style={{position: 'absolute', left: 62, right: 62, top: 930, fontFamily: display, fontSize: 88, lineHeight: 0.88}}>THEN KANTO<br/><span style={{color: accent}}>FIGHTS BACK.</span></div>
  </div>;
};

const Cta: React.FC<{manifest: VideoManifest; accent: string; frame: number; headline: string}> = ({manifest, accent, frame, headline}) => {
  const choose = spring({frame: frame - 18, fps: 30, config: {damping: 12, stiffness: 175}});
  return <div style={{position: 'absolute', inset: 0, textAlign: 'center'}}>
    <div style={{position: 'absolute', top: 430, left: -80, right: -80, height: 300, background: 'linear-gradient(175deg, #6a4228, #25170e)', borderTop: '14px solid #9b6742', transform: 'perspective(700px) rotateX(58deg)'}} />
    <Pokeball left={110} top={410} frame={frame} delay={0} />
    <Pokeball left={435} top={380} frame={frame} delay={4} selected />
    <Pokeball left={760} top={410} frame={frame} delay={8} />
    <div style={{position: 'absolute', left: 435, top: 45, width: 220, height: 560, opacity: 0.32 + choose * 0.3, background: `linear-gradient(180deg, ${accent}00, ${accent}66 68%, ${accent}00)`, clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)', filter: 'blur(9px)'}} />
    <div style={{position: 'absolute', left: 476, top: 105 + Math.sin(frame / 4) * 12, width: 128, height: 128, borderRight: `18px solid ${accent}`, borderBottom: `18px solid ${accent}`, transform: 'rotate(45deg)', filter: `drop-shadow(0 0 16px ${accent})`, opacity: choose}} />
    <div style={{position: 'absolute', left: 0, right: 0, top: 72, fontFamily: display, fontSize: 34, letterSpacing: 8, color: accent, opacity: choose}}>MAKE YOUR CHOICE</div>
    <div style={{position: 'absolute', top: 5, left: 210, opacity: choose, transform: `translateY(${(1 - choose) * 120}px) scale(${0.75 + choose * 0.25})`}}><PokemonArt src={manifest.subject.artworkUrl} size={660} frame={frame - 15} /></div>
    <LeafBurst frame={frame - 18} originX={540} originY={510} />
    <div style={{position: 'absolute', top: 735, left: 45, right: 45, fontFamily: display, fontSize: 76, lineHeight: 0.88, textShadow: '0 9px 20px #000'}}>{headline}</div>
    <div style={{position: 'absolute', left: 90, right: 90, top: 950, display: 'flex', gap: 22, justifyContent: 'center'}}>
      <div style={{background: accent, color: '#081a13', padding: '24px 38px', borderRadius: 22, fontFamily: display, fontSize: 43, transform: `rotate(-3deg) scale(${1 + Math.sin(frame / 5) * 0.035})`}}>SMART PICK</div>
      <div style={{border: '3px solid #fff', background: '#08120dcc', padding: '24px 38px', borderRadius: 22, fontFamily: display, fontSize: 43, transform: 'rotate(3deg)'}}>SAFE PICK</div>
    </div>
  </div>;
};
