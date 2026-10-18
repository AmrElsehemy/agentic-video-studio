import React from 'react';
import {interpolate} from 'remotion';
import {displayFont} from '../typography';
import {photoPlacement} from './photoPlacement';
import {usePhotos} from './Photos';

// A photograph that fills the whole map panel (a `photo` annotation with `fill`): it pushes in slowly while the crop
// pans across the picture, so a wide image or a side-by-side pair is seen in turn instead of cut off. Its credit is
// part of the picture. Two in one scene follow each other with a short cross-fade.

export type FullPhotoSpec = {photo: string; at: number; until?: number; pan?: [number, number]};

const FADE_FRAMES = 10;
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const FullPhotos: React.FC<{photos: FullPhotoSpec[]; frame: number; durationInFrames: number}> = ({photos: specs, frame, durationInFrames}) => {
  const loaded = usePhotos(specs.map((spec) => spec.photo));
  if (!loaded) return null;
  return <div style={{position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: '#05080c'}}>
    {specs.map((spec, index) => {
      const photo = loaded.get(spec.photo);
      if (!photo) throw new Error(`Unknown photo "${spec.photo}". Add it with: npm run photos -- add ${spec.photo} "File:..."`);
      const [start, end] = [spec.at * durationInFrames, (spec.until ?? 1) * durationInFrames];
      // A photo that starts with the scene is there from its first frame; a later one fades in; one with an end fades out.
      const fadeIn = start <= 0 ? 1 : interpolate(frame, [start, start + FADE_FRAMES], [0, 1], clamp);
      const fadeOut = spec.until === undefined || spec.until >= 1 ? 1 : interpolate(frame, [end - FADE_FRAMES, end], [1, 0], clamp);
      const opacity = Math.min(fadeIn, fadeOut);
      if (opacity <= 0) return null;
      const progress = interpolate(frame, [start, Math.max(end, start + 1)], [0, 1], clamp);
      const [from, to] = spec.pan ?? [0.5, 0.5];
      const {left, top, width, height} = photoPlacement(photo, from + (to - from) * progress, progress);
      return <div key={`${spec.photo}-${index}`} style={{position: 'absolute', inset: 0, opacity}}>
        <img src={photo.href} style={{position: 'absolute', left, top, width, height, maxWidth: 'none'}} />
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 360, background: 'linear-gradient(to top, rgba(2,6,12,.78), rgba(2,6,12,0))'}} />
        {photo.caption ? <div style={{position: 'absolute', left: 36, right: 36, bottom: 92, textAlign: 'center', fontFamily: displayFont, fontSize: 44, letterSpacing: 3, color: '#ffffff', textShadow: '0 2px 14px rgba(0,0,0,.7)'}}>{photo.caption.toUpperCase()}</div> : null}
        <div style={{position: 'absolute', left: 36, bottom: 30, padding: '8px 22px', borderRadius: 24, backgroundColor: 'rgba(2,6,12,.72)', fontFamily: displayFont, fontSize: 24, letterSpacing: 2, color: '#ffffff'}}>{photo.screenCredit}</div>
      </div>;
    })}
  </div>;
};
