import type React from 'react';
import {loadFont as loadAnton} from '@remotion/google-fonts/Anton';
import {loadFont as loadArchivoBlack} from '@remotion/google-fonts/ArchivoBlack';
import {loadFont as loadBangers} from '@remotion/google-fonts/Bangers';
import {loadFont as loadBebasNeue} from '@remotion/google-fonts/BebasNeue';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadMontserrat} from '@remotion/google-fonts/Montserrat';
import {loadFont as loadOswald} from '@remotion/google-fonts/Oswald';
import {loadFont as loadPoppins} from '@remotion/google-fonts/Poppins';
import type {VideoManifest} from '../schema';

// Components use these CSS variables; the episode's root element sets them
// from the show's fonts (manifest.show.fonts), so every show can have its own.
export const displayFont = 'var(--font-display)';
export const bodyFont = 'var(--font-body)';

const SYSTEM_FONT = 'Arial, Helvetica, sans-serif';
// Only the requested fonts are loaded, once each.
const loaders: Record<string, () => string> = {
  'Bebas Neue': () => loadBebasNeue('normal', {weights: ['400'], subsets: ['latin']}).fontFamily,
  Anton: () => loadAnton('normal', {weights: ['400'], subsets: ['latin']}).fontFamily,
  Oswald: () => loadOswald('normal', {weights: ['600'], subsets: ['latin']}).fontFamily,
  'Archivo Black': () => loadArchivoBlack('normal', {weights: ['400'], subsets: ['latin']}).fontFamily,
  Bangers: () => loadBangers('normal', {weights: ['400'], subsets: ['latin']}).fontFamily,
  Inter: () => loadInter('normal', {weights: ['400', '900'], subsets: ['latin']}).fontFamily,
  Montserrat: () => loadMontserrat('normal', {weights: ['400', '900'], subsets: ['latin']}).fontFamily,
  Poppins: () => loadPoppins('normal', {weights: ['400', '900'], subsets: ['latin']}).fontFamily,
};
const loaded = new Map<string, string>();
const family = (name: string) => {
  if (!loaded.has(name)) loaded.set(name, loaders[name]?.() ?? loaders['Bebas Neue']());
  return loaded.get(name)!;
};

/** CSS variables for an episode's fonts; manifests without show fonts use Bebas Neue and the system font. */
export const fontVariables = (manifest: VideoManifest) => {
  const fonts = manifest.show.fonts ?? {display: 'Bebas Neue', body: 'system'};
  return {
    '--font-display': family(fonts.display),
    '--font-body': fonts.body === 'system' ? SYSTEM_FONT : `${family(fonts.body)}, ${SYSTEM_FONT}`,
  } as React.CSSProperties;
};
