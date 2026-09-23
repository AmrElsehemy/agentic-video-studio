import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
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

const Art: React.FC<{src: string; frame: number; size?: number; delay?: number; flip?: boolean}> = ({src, frame, size = 620, delay = 0, flip = false}) => {
  const enter = spring({frame: frame - delay, fps: 30, config: {damping: 14, stiffness: 130, mass: 0.75}});
  const float = Math.sin(Math.max(0, frame - delay) / 9) * 10;
  const scale = 0.86 + enter * 0.14;
  return (
    <Img
      src={src}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        opacity: enter,
        filter: 'drop-shadow(0 38px 34px #0009)',
        transform: `translateY(${(1 - enter) * 80 + float}px) scale(${flip ? -scale : scale}, ${scale})`,
      }}
    />
  );
};

const TypeChip: React.FC<{label: string; index: number; frame: number}> = ({label, index, frame}) => {
  const enter = spring({frame: frame - 10 - index * 8, fps: 30, config: {damping: 13, stiffness: 170}});
  const palette: Record<string, string> = {GRASS: '#78d98a', POISON: '#a97bdc'};
  const background = palette[label] ?? '#ffffff';
  return (
    <div style={{padding: '22px 34px', borderRadius: 999, background, color: '#09120d', fontFamily: display, fontSize: 46, transform: `scale(${enter})`, boxShadow: `0 15px 35px ${background}44`}}>
      {label}
    </div>
  );
};

const Base: React.FC<{manifest: VideoManifest; scene: VideoScene; sceneIndex: number; sceneCount: number; children: React.ReactNode}> = ({manifest, scene, sceneIndex, sceneCount, children}) => {
  const frame = useCurrentFrame();
  const accent = scene.accent ?? manifest.palette.primary;
  const progress = (sceneIndex + frame / Math.max(1, scene.durationSeconds * manifest.format.fps)) / sceneCount;
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 50% 28%, ${accent}2c 0%, ${manifest.palette.background} 43%, #020705 100%)`, color: manifest.palette.ink, overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: -250, opacity: 0.045, transform: `rotate(${frame * 0.04}deg)`, background: `repeating-conic-gradient(from 0deg, transparent 0deg 21deg, ${accent} 22deg 22.5deg)`}} />
      <div style={{position: 'absolute', top: 62, left: 58, right: 58, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{fontFamily: display, fontSize: 27, letterSpacing: 5}}>POKE<span style={{color: accent}}>PULSES</span></div>
        <div style={{fontFamily: display, color: accent, fontSize: 28, letterSpacing: 3}}>{manifest.subject.index}</div>
      </div>
      <div style={{position: 'absolute', top: 126, left: 58, right: 58, height: 5, borderRadius: 99, background: '#ffffff16', overflow: 'hidden', zIndex: 20}}>
        <div style={{height: '100%', width: `${Math.min(1, progress) * 100}%`, background: accent}} />
      </div>
      {children}
      <div style={{position: 'absolute', left: 62, right: 62, bottom: 58, zIndex: 30}}>
        <div style={{fontFamily: body, fontWeight: 900, color: accent, fontSize: 22, letterSpacing: 4, marginBottom: 10}}>{scene.eyebrow}</div>
        <div style={{fontFamily: display, fontSize: 64, lineHeight: 0.94, textTransform: 'uppercase', textShadow: '0 7px 24px #000b'}}>{scene.caption}</div>
      </div>
    </AbsoluteFill>
  );
};

const Hook: React.FC<Props> = ({scene, manifest, sceneIndex, sceneCount}) => {
  const frame = useCurrentFrame();
  const reveal = spring({frame: frame - 8, fps: 30, config: {damping: 13, stiffness: 120}});
  return (
    <Base manifest={manifest} scene={scene} sceneIndex={sceneIndex} sceneCount={sceneCount}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 170, height: 1060, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
        <div style={{position: 'absolute', width: 760, height: 760, borderRadius: '50%', background: 'radial-gradient(circle, #64f1a54a 0%, transparent 66%)', transform: `scale(${0.7 + reveal * 0.3})`}} />
        <Art src={manifest.subject.artworkUrl} frame={frame} size={760} delay={5} />
        <div style={{position: 'absolute', top: 55, left: 0, right: 0, textAlign: 'center', fontFamily: display, fontSize: 166, color: '#ffffff12', letterSpacing: -8}}>001</div>
      </div>
      <div style={{position: 'absolute', left: 68, right: 68, top: 1035, textAlign: 'center', fontFamily: display, fontSize: 83, lineHeight: 0.9, textTransform: 'uppercase'}}>{scene.headline}</div>
    </Base>
  );
};

const Gyms: React.FC<Props> = ({scene, manifest, sceneIndex, sceneCount}) => {
  const frame = useCurrentFrame();
  const push = interpolate(frame, [0, 100], [-40, 70], clamp);
  return (
    <Base manifest={manifest} scene={scene} sceneIndex={sceneIndex} sceneCount={sceneCount}>
      <div style={{position: 'absolute', top: 205, left: 0, right: 0, height: 980}}>
        <div style={{position: 'absolute', left: 58, top: 85, width: 330, height: 330, borderRadius: 38, background: '#8c735b33', border: '3px solid #c5a27555', transform: 'rotate(-5deg)'}}>
          <div style={{fontFamily: display, fontSize: 64, padding: 34}}>BROCK</div>
          <div style={{fontFamily: body, fontSize: 28, padding: '0 34px', opacity: 0.7}}>GYM 01</div>
        </div>
        <div style={{position: 'absolute', right: 58, top: 150, width: 330, height: 330, borderRadius: 38, background: '#58c7ff2b', border: '3px solid #75d8ff55', transform: 'rotate(5deg)'}}>
          <div style={{fontFamily: display, fontSize: 64, padding: 34}}>MISTY</div>
          <div style={{fontFamily: body, fontSize: 28, padding: '0 34px', opacity: 0.7}}>GYM 02</div>
        </div>
        <div style={{position: 'absolute', left: 250 + push, top: 320}}><Art src={manifest.subject.artworkUrl} frame={frame} size={590} /></div>
        <div style={{position: 'absolute', left: 80, right: 80, top: 805, textAlign: 'center', fontFamily: display, fontSize: 78, lineHeight: 0.9}}>THE OPENING HOURS<br/><span style={{color: '#64f1a5'}}>FAVOR GRASS.</span></div>
      </div>
    </Base>
  );
};

const Types: React.FC<Props> = ({scene, manifest, sceneIndex, sceneCount}) => {
  const frame = useCurrentFrame();
  return (
    <Base manifest={manifest} scene={scene} sceneIndex={sceneIndex} sceneCount={sceneCount}>
      <div style={{position: 'absolute', top: 220, left: 0, right: 0, height: 980, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <Art src={manifest.subject.artworkUrl} frame={frame} size={650} />
        <div style={{display: 'flex', gap: 24, marginTop: -70}}>
          {(scene.facts ?? ['GRASS', 'POISON']).map((fact, index) => <TypeChip key={fact} label={fact} index={index} frame={frame} />)}
        </div>
        <div style={{fontFamily: display, fontSize: 82, marginTop: 58, textAlign: 'center'}}>FROM THE<br/><span style={{color: '#64f1a5'}}>VERY START.</span></div>
      </div>
    </Base>
  );
};

const Evolutions: React.FC<Props> = ({scene, manifest, sceneIndex, sceneCount}) => {
  const frame = useCurrentFrame();
  const stages = manifest.evolutions.slice(0, 3);
  const sizes = [310, 360, 430];
  return (
    <Base manifest={manifest} scene={scene} sceneIndex={sceneIndex} sceneCount={sceneCount}>
      <div style={{position: 'absolute', top: 205, left: 42, right: 42, height: 1030}}>
        {stages.map((stage, index) => {
          const enter = spring({frame: frame - index * 14, fps: 30, config: {damping: 13, stiffness: 150}});
          return (
            <div key={stage.name} style={{position: 'absolute', left: 50 + index * 295, top: 120 + (2 - index) * 115, width: 320, textAlign: 'center', opacity: enter, transform: `translateY(${(1 - enter) * 80}px)`}}>
              <Art src={stage.artworkUrl} frame={frame} delay={index * 14} size={sizes[index]} />
              <div style={{fontFamily: display, fontSize: 31, color: index === 2 ? '#f3d95b' : '#64f1a5'}}>{['LV 05', 'LV 16', 'LV 32'][index]}</div>
              <div style={{fontFamily: display, fontSize: 31, marginTop: 7}}>{stage.name.toUpperCase()}</div>
            </div>
          );
        })}
        <div style={{position: 'absolute', left: 70, right: 70, top: 845, textAlign: 'center', fontFamily: display, fontSize: 74, lineHeight: 0.9}}>VENUSAUR ARRIVES<br/><span style={{color: '#f3d95b'}}>AT LEVEL 32.</span></div>
      </div>
    </Base>
  );
};

const Tradeoff: React.FC<Props> = ({scene, manifest, sceneIndex, sceneCount}) => {
  const frame = useCurrentFrame();
  const facts = scene.facts ?? [];
  return (
    <Base manifest={manifest} scene={scene} sceneIndex={sceneIndex} sceneCount={sceneCount}>
      <div style={{position: 'absolute', top: 210, left: 0, right: 0, height: 1000}}>
        <div style={{position: 'absolute', left: 245, top: 180}}><Art src={manifest.subject.artworkUrl} frame={frame} size={610} /></div>
        {facts.map((fact, index) => {
          const enter = spring({frame: frame - 8 - index * 9, fps: 30, config: {damping: 12, stiffness: 180}});
          const positions = [{left: 55, top: 80}, {right: 55, top: 115}, {left: 70, top: 640}, {right: 70, top: 680}];
          return <div key={fact} style={{position: 'absolute', ...positions[index], padding: '18px 28px', borderRadius: 22, border: '3px solid #ff706d88', background: '#2a0d12dd', color: '#ff9d9a', fontFamily: display, fontSize: 45, transform: `scale(${enter}) rotate(${index % 2 ? 4 : -4}deg)`}}>{fact}</div>;
        })}
        <div style={{position: 'absolute', left: 70, right: 70, top: 850, textAlign: 'center', fontFamily: display, fontSize: 76, lineHeight: 0.9}}>STRONG START.<br/><span style={{color: '#ff706d'}}>NOT A FREE WIN.</span></div>
      </div>
    </Base>
  );
};

const Cta: React.FC<Props> = ({scene, manifest, sceneIndex, sceneCount}) => {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 7) * 0.025;
  return (
    <Base manifest={manifest} scene={scene} sceneIndex={sceneIndex} sceneCount={sceneCount}>
      <div style={{position: 'absolute', top: 210, left: 0, right: 0, height: 1040, textAlign: 'center'}}>
        <div style={{transform: `scale(${pulse})`, display: 'inline-block'}}><Art src={manifest.subject.artworkUrl} frame={frame} size={720} /></div>
        <div style={{marginTop: -65, fontFamily: display, fontSize: 90, lineHeight: 0.88}}>WOULD YOU PICK<br/><span style={{color: '#f3d95b'}}>BULBASAUR?</span></div>
        <div style={{marginTop: 34, fontFamily: body, fontWeight: 900, fontSize: 28, letterSpacing: 5, opacity: 0.65}}>COMMENT YOUR STARTER</div>
      </div>
    </Base>
  );
};

export const PokeProfileScene: React.FC<Props> = (props) => {
  if (props.scene.visual === 'hook') return <Hook {...props} />;
  if (props.scene.visual === 'gauntlet') return <Gyms {...props} />;
  if (props.scene.visual === 'advantage') return <Types {...props} />;
  if (props.scene.visual === 'race') return <Evolutions {...props} />;
  if (props.scene.visual === 'tradeoff') return <Tradeoff {...props} />;
  return <Cta {...props} />;
};
