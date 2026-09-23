import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame} from 'remotion';
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

const Art: React.FC<{src: string; frame: number; size?: number; delay?: number}> = ({src, frame, size = 650, delay = 0}) => {
  const enter = spring({frame: frame - delay, fps: 30, config: {damping: 13, stiffness: 150, mass: 0.72}});
  const float = Math.sin(Math.max(0, frame - delay) / 8) * 9;
  return <Img src={src} style={{width: size, height: size, objectFit: 'contain', opacity: enter, filter: 'drop-shadow(0 40px 36px #000b)', transform: `translateY(${(1 - enter) * 90 + float}px) scale(${0.82 + enter * 0.18})`}} />;
};

const Coin: React.FC<{x: number; y: number; frame: number; delay: number; size?: number}> = ({x, y, frame, delay, size = 88}) => {
  const enter = spring({frame: frame - delay, fps: 30, config: {damping: 11, stiffness: 180}});
  const spin = (frame - delay) * 7;
  return <div style={{position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fff2a6 0%, #f6c945 38%, #a86d09 100%)', border: '5px solid #7a4a00', boxShadow: '0 12px 30px #0008, 0 0 26px #f6c94555', opacity: enter, transform: `scale(${enter}) rotateY(${spin}deg)`}}>
    <div style={{position: 'absolute', inset: 13, borderRadius: '50%', border: '4px solid #a96e0c88'}} />
  </div>;
};

const Base: React.FC<Props & {children: React.ReactNode}> = ({scene, manifest, sceneIndex, sceneCount, children}) => {
  const frame = useCurrentFrame();
  const accent = scene.accent ?? manifest.palette.primary;
  const progress = (sceneIndex + frame / Math.max(1, scene.durationSeconds * manifest.format.fps)) / sceneCount;
  return <AbsoluteFill style={{overflow: 'hidden', color: manifest.palette.ink, background: `radial-gradient(circle at 50% 30%, ${accent}2b 0%, ${manifest.palette.background} 43%, #040301 100%)`}}>
    <div style={{position: 'absolute', inset: -250, opacity: 0.04, transform: `rotate(${frame * 0.05}deg)`, background: `repeating-conic-gradient(from 0deg, transparent 0deg 18deg, ${accent} 19deg 19.5deg)`}} />
    <div style={{position: 'absolute', top: 60, left: 58, right: 58, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 20}}>
      <div style={{fontFamily: display, fontSize: 28, letterSpacing: 5}}>POKE<span style={{color: accent}}>PULSES</span></div>
      <div style={{fontFamily: display, fontSize: 30, color: accent, letterSpacing: 3}}>{manifest.subject.index}</div>
    </div>
    <div style={{position: 'absolute', top: 125, left: 58, right: 58, height: 5, borderRadius: 99, background: '#ffffff18', overflow: 'hidden', zIndex: 20}}><div style={{height: '100%', width: `${Math.min(1, progress) * 100}%`, background: accent}} /></div>
    {children}
    <div style={{position: 'absolute', left: 62, right: 62, bottom: 60, zIndex: 30}}>
      <div style={{fontFamily: body, fontWeight: 900, color: accent, fontSize: 22, letterSpacing: 4, marginBottom: 10}}>{scene.eyebrow}</div>
      <div style={{fontFamily: display, fontSize: 66, lineHeight: 0.92, textTransform: 'uppercase', textShadow: '0 8px 26px #000d'}}>{scene.caption}</div>
    </div>
  </AbsoluteFill>;
};

const Hook: React.FC<Props> = (props) => {
  const {scene, manifest} = props;
  const frame = useCurrentFrame();
  const number = spring({frame: frame - 4, fps: 30, config: {damping: 12, stiffness: 170}});
  return <Base {...props}>
    <div style={{position: 'absolute', top: 170, left: 0, right: 0, height: 1100, textAlign: 'center'}}>
      <div style={{fontFamily: display, fontSize: 300, lineHeight: 0.8, color: '#f6c94520', transform: `scale(${0.7 + number * 0.3})`}}>999</div>
      <div style={{position: 'absolute', top: 190, left: 205}}><Art src={manifest.subject.artworkUrl} frame={frame} size={680} delay={4} /></div>
      {[0,1,2,3,4,5,6].map((i) => <Coin key={i} x={90 + (i % 4) * 250} y={590 + Math.floor(i / 4) * 220 + (i % 2) * 50} frame={frame} delay={8 + i * 3} size={72 + (i % 3) * 10} />)}
      <div style={{position: 'absolute', left: 60, right: 60, top: 945, fontFamily: display, fontSize: 84, lineHeight: 0.88}}>{scene.headline}</div>
    </div>
  </Base>;
};

const Identity: React.FC<Props> = (props) => {
  const {manifest} = props;
  const frame = useCurrentFrame();
  return <Base {...props}>
    <div style={{position: 'absolute', top: 210, left: 0, right: 0, height: 1020}}>
      <div style={{position: 'absolute', left: 185, top: 40}}><Art src={manifest.subject.artworkUrl} frame={frame} size={720} /></div>
      <div style={{position: 'absolute', left: 120, top: 700, padding: '22px 34px', borderRadius: 999, background: '#8a6cff', color: '#fff', fontFamily: display, fontSize: 44}}>GHOST</div>
      <div style={{position: 'absolute', right: 120, top: 700, padding: '22px 34px', borderRadius: 999, background: '#f6c945', color: '#160f03', fontFamily: display, fontSize: 44}}>#999</div>
      <div style={{position: 'absolute', left: 75, right: 75, top: 830, textAlign: 'center', fontFamily: display, fontSize: 78, lineHeight: 0.9}}>TREASURE CHEST.<br/><span style={{color: '#f6c945'}}>ACTUAL GHOST.</span></div>
    </div>
  </Base>;
};

const NotNormal: React.FC<Props> = (props) => {
  const {scene, manifest} = props;
  const frame = useCurrentFrame();
  const labels = scene.facts ?? [];
  return <Base {...props}>
    <div style={{position: 'absolute', top: 220, left: 0, right: 0, height: 1030}}>
      <div style={{position: 'absolute', left: 285, top: 210}}><Art src={manifest.subject.artworkUrl} frame={frame} size={500} /></div>
      {labels.map((label, i) => {
        const enter = spring({frame: frame - 7 - i * 7, fps: 30, config: {damping: 12, stiffness: 180}});
        return <div key={label} style={{position: 'absolute', left: 110 + (i % 2) * 500, top: 85 + i * 255, width: 360, padding: '25px 20px', borderRadius: 26, background: '#20150acc', border: '3px solid #ff746f88', color: '#ffaaa6', fontFamily: display, fontSize: 48, textAlign: 'center', transform: `scale(${enter}) rotate(${i % 2 ? 4 : -4}deg)`}}>{label}<div style={{fontSize: 60, marginTop: 10}}>✕</div></div>;
      })}
      <div style={{position: 'absolute', left: 70, right: 70, top: 850, textAlign: 'center', fontFamily: display, fontSize: 78, lineHeight: 0.9}}>THE GAME WANTS<br/><span style={{color: '#f6c945'}}>COINS.</span></div>
    </div>
  </Base>;
};

const Counter: React.FC<Props> = (props) => {
  const {manifest} = props;
  const frame = useCurrentFrame();
  const milestones = [12, 99, 777, 999];
  const phase = Math.min(3, Math.floor(frame / 38));
  const current = milestones[phase];
  const flash = spring({frame: frame - phase * 38, fps: 30, config: {damping: 10, stiffness: 210}});
  return <Base {...props}>
    <div style={{position: 'absolute', top: 205, left: 0, right: 0, height: 1050, textAlign: 'center'}}>
      {[0,1,2,3,4,5,6,7,8,9,10,11].map((i) => <Coin key={i} x={65 + (i % 4) * 255} y={120 + Math.floor(i / 4) * 250} frame={frame} delay={i * 3} size={70} />)}
      <div style={{position: 'absolute', left: 0, right: 0, top: 260, fontFamily: display, fontSize: 250, color: '#f6c945', textShadow: '0 18px 48px #000', transform: `scale(${0.88 + flash * 0.12})`}}>{current}</div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 520, fontFamily: body, fontSize: 34, fontWeight: 900, letterSpacing: 7, opacity: 0.75}}>GIMMIGHOUL COINS</div>
      <div style={{position: 'absolute', left: 250, top: 650}}><Art src={manifest.subject.artworkUrl} frame={frame} size={580} /></div>
    </div>
  </Base>;
};

const Evolution: React.FC<Props> = (props) => {
  const {manifest} = props;
  const frame = useCurrentFrame();
  const gholdengo = manifest.evolutions[1] ?? manifest.evolutions[0];
  const switcher = interpolate(frame, [35, 55], [0, 1], clamp);
  return <Base {...props}>
    <div style={{position: 'absolute', top: 205, left: 0, right: 0, height: 1050, textAlign: 'center'}}>
      <div style={{position: 'absolute', left: 60, right: 60, top: 35, fontFamily: display, fontSize: 170, color: '#ffffff12'}}>999 → 1000</div>
      <div style={{position: 'absolute', left: 215, top: 190, opacity: 1 - switcher}}><Art src={manifest.subject.artworkUrl} frame={frame} size={650} /></div>
      {gholdengo ? <div style={{position: 'absolute', left: 165, top: 120, opacity: switcher, transform: `scale(${0.7 + switcher * 0.3})`}}><Art src={gholdengo.artworkUrl} frame={frame - 38} size={760} /></div> : null}
      <div style={{position: 'absolute', left: 0, right: 0, top: 840, fontFamily: display, fontSize: 90, lineHeight: 0.9, color: '#f6c945'}}>POKÉMON #1000</div>
    </div>
  </Base>;
};

const Cta: React.FC<Props> = (props) => {
  const {manifest} = props;
  const frame = useCurrentFrame();
  const gholdengo = manifest.evolutions[1] ?? manifest.evolutions[0];
  return <Base {...props}>
    <div style={{position: 'absolute', top: 210, left: 0, right: 0, height: 1040, textAlign: 'center'}}>
      {gholdengo ? <div style={{display: 'inline-block'}}><Art src={gholdengo.artworkUrl} frame={frame} size={730} /></div> : null}
      <div style={{marginTop: -80, fontFamily: display, fontSize: 92, lineHeight: 0.88}}>BRILLIANT<br/><span style={{color: '#f6c945'}}>OR RIDICULOUS?</span></div>
      <div style={{marginTop: 35, fontFamily: body, fontWeight: 900, fontSize: 28, letterSpacing: 5, opacity: 0.68}}>999 COINS • YOUR CALL</div>
    </div>
  </Base>;
};

export const GimmighoulScene: React.FC<Props> = (props) => {
  if (props.scene.visual === 'hook') return <Hook {...props} />;
  if (props.scene.visual === 'gauntlet') return <Identity {...props} />;
  if (props.scene.visual === 'advantage') return <NotNormal {...props} />;
  if (props.scene.visual === 'race') return <Counter {...props} />;
  if (props.scene.visual === 'tradeoff') return <Evolution {...props} />;
  return <Cta {...props} />;
};
