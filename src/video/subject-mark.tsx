import React from 'react';

export const SubjectMark: React.FC<{accent: string; secondary: string; frame: number; compact?: boolean}> = ({accent, secondary, frame, compact = false}) => {
  const bob = Math.sin(frame / 12) * 12;
  const size = compact ? 360 : 500;
  return (
    <div style={{height: size, display: 'flex', justifyContent: 'center', alignItems: 'center', transform: `translateY(${bob}px)`}}>
      <div style={{position: 'relative', width: size * 0.72, height: size * 0.56, borderRadius: '48% 52% 43% 57%', background: `linear-gradient(145deg, ${accent}, ${secondary})`, boxShadow: `0 35px 120px ${accent}77`, border: '8px solid #ffffff35'}}>
        <div style={{position: 'absolute', width: size * 0.27, height: size * 0.35, background: accent, borderRadius: '90% 10% 80% 20%', top: -size * 0.2, left: size * 0.19, transform: `rotate(${-28 + Math.sin(frame / 15) * 5}deg)`, border: '6px solid #ffffff2f'}} />
        <div style={{position: 'absolute', width: size * 0.27, height: size * 0.35, background: accent, borderRadius: '10% 90% 20% 80%', top: -size * 0.2, right: size * 0.19, transform: `rotate(${28 - Math.sin(frame / 15) * 5}deg)`, border: '6px solid #ffffff2f'}} />
        {[0.23, 0.67].map((left) => <div key={left} style={{position: 'absolute', top: '38%', left: `${left * 100}%`, width: size * 0.055, height: size * 0.085, borderRadius: 99, background: '#f7fff9', boxShadow: 'inset 0 -12px 0 #18382d'}} />)}
        <div style={{position: 'absolute', bottom: '19%', left: '41%', width: '18%', height: '5%', borderRadius: '0 0 99px 99px', background: '#17372c'}} />
        {[{t: 22, l: 16, s: 38}, {t: 12, l: 66, s: 50}, {t: 65, l: 76, s: 30}].map((spot, i) => <div key={i} style={{position: 'absolute', top: `${spot.t}%`, left: `${spot.l}%`, width: spot.s, height: spot.s, borderRadius: '45% 55%', background: secondary, opacity: 0.8, transform: `rotate(${frame + i * 40}deg)`}} />)}
      </div>
    </div>
  );
};

