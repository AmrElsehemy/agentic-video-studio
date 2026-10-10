import React, {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, interpolate, staticFile} from 'remotion';
import {displayFont} from '../typography';
import {pop} from './motion';

// Real photographs on a map scene (scripts/photos.mjs: Wikimedia Commons, public domain, CC0 or CC BY), as a
// card that settles onto the map with a slow push in and its credit on it. The credit is part of the picture,
// never left to the description alone.

export type PhotoMeta = {title: string; author: string; license: string; width: number; height: number; screenCredit: string; caption?: string};
export type Photos = {get: (slug: string) => (PhotoMeta & {href: string}) | undefined};

let index: Record<string, PhotoMeta> | undefined;
let indexLoading: Promise<Record<string, PhotoMeta>> | undefined;
const loadIndex = () => indexLoading ??= fetch(staticFile('photos/index.json')).then((response) => {
  if (!response.ok) throw new Error(`photos/index.json failed to load (${response.status}). Run: npm run photos`);
  return response.json() as Promise<{photos: Record<string, PhotoMeta>}>;
}).then((loaded) => (index = loaded.photos));

const preloaded = new Set<string>();
const preload = (href: string) => new Promise<void>((resolve, reject) => {
  if (preloaded.has(href)) return resolve();
  const image = new Image();
  image.onload = () => {preloaded.add(href); resolve();};
  image.onerror = () => reject(new Error(`Photo ${href} failed to load`));
  image.src = href;
});

/** The photos named by `slugs`, loaded before the frame is drawn; empty when there are none. */
export const usePhotos = (slugs: string[]): Photos | undefined => {
  const wanted = [...new Set(slugs)].sort().join(',');
  const [photos, setPhotos] = useState<Photos | undefined>(wanted ? undefined : {get: () => undefined});
  const [handle] = useState(() => (wanted ? delayRender('Loading photos') : undefined));
  useEffect(() => {
    if (!wanted) return;
    loadIndex().then(async (loaded) => {
      const found = wanted.split(',').flatMap((slug) => (loaded[slug] ? [[slug, {...loaded[slug], href: staticFile(`photos/${slug}.jpg`)}] as const] : []));
      await Promise.all(found.map(([, photo]) => preload(photo.href)));
      const bySlug = new Map(found);
      setPhotos({get: (slug) => bySlug.get(slug)});
      if (handle !== undefined) continueRender(handle);
    }).catch((error) => cancelRender(error));
  }, [wanted, handle]);
  return photos;
};

export const PHOTO_WIDTH = 900;
export const PHOTO_HEIGHT = 560;
/** The card's whole height (frame and credit strip), and the gap below it: the map lifts by half of both. */
export const PHOTO_CARD = PHOTO_HEIGHT + 2 * 12 + 34;
const FRAME = 12;

/** A photo card: settles in with a small overshoot at `startFrame`, pushes in slowly, fades at `endFrame`. */
export const PhotoCard: React.FC<{
  photo: PhotoMeta & {href: string};
  id: string;
  cx: number;
  cy: number;
  frame: number;
  startFrame: number;
  endFrame: number;
  fps: number;
  ink: string;
  backdrop: string;
}> = ({photo, id, cx, cy, frame, startFrame, endFrame, fps, ink, backdrop}) => {
  const enter = pop(frame, startFrame, fps);
  const fade = Math.min(interpolate(frame, [startFrame, startFrame + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), interpolate(frame, [endFrame - 8, endFrame], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  if (fade <= 0) return null;
  const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  // Fill the card with the photo (cover), then push in 9% and drift a little across the scene.
  const cover = Math.max(PHOTO_WIDTH / photo.width, PHOTO_HEIGHT / photo.height);
  const zoom = cover * (1 + 0.09 * progress);
  const [w, h] = [photo.width * zoom, photo.height * zoom];
  const drift = (progress - 0.5) * 24;
  const clip = `photo-${id.replace(/[^a-z0-9]/gi, '')}`;
  const [x, y] = [-PHOTO_WIDTH / 2, -PHOTO_HEIGHT / 2];
  const credit = photo.screenCredit;
  const creditWidth = Math.min(PHOTO_WIDTH - 40, credit.length * 15 + 44);
  return <g opacity={fade} transform={`translate(${cx} ${cy + (1 - Math.min(1, enter)) * 90}) rotate(-1.6) scale(${0.9 + 0.1 * Math.min(1.04, enter)})`}>
    <clipPath id={clip}><rect x={x} y={y} width={PHOTO_WIDTH} height={PHOTO_HEIGHT} rx={14} /></clipPath>
    <rect x={x - FRAME} y={y - FRAME} width={PHOTO_WIDTH + 2 * FRAME} height={PHOTO_HEIGHT + 2 * FRAME + 34} rx={22} fill="#fffdf8" style={{filter: 'drop-shadow(0 18px 28px rgba(0,0,0,.38))'}} />
    <image href={photo.href} x={x - (w - PHOTO_WIDTH) / 2 + drift} y={y - (h - PHOTO_HEIGHT) / 2} width={w} height={h} preserveAspectRatio="none" clipPath={`url(#${clip})`} />
    <rect x={x + 20} y={y + PHOTO_HEIGHT - 28} width={creditWidth} height={44} rx={22} fill={backdrop} opacity={0.82} />
    <text x={x + 20 + creditWidth / 2} y={y + PHOTO_HEIGHT - 6} textAnchor="middle" dominantBaseline="middle" style={{fontFamily: displayFont, fontSize: 22, letterSpacing: 2, fill: ink}}>{credit}</text>
  </g>;
};
