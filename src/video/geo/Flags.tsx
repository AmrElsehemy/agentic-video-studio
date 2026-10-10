import React, {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';

// Flags beside the countries they belong to (scripts/flags.mjs: flag-icons, MIT). A shot opts in with
// `flags: true`; a country with no flag of its own (a disputed zone, a buffer zone) simply has none.

type FlagIndex = {countries: Record<string, string>};
export type Flags = {href: (entity: string) => string | undefined};
export const NO_FLAGS: Flags = {href: () => undefined};

let index: FlagIndex | undefined;
let indexLoading: Promise<FlagIndex> | undefined;
const loadIndex = () => indexLoading ??= fetch(staticFile('flags/index.json')).then((response) => {
  if (!response.ok) throw new Error(`flags/index.json failed to load (${response.status}). Run: npm run flags:prepare`);
  return response.json() as Promise<FlagIndex>;
}).then((loaded) => (index = loaded));

const preloaded = new Set<string>();
const preload = (href: string) => new Promise<void>((resolve, reject) => {
  if (preloaded.has(href)) return resolve();
  const image = new Image();
  image.onload = () => {preloaded.add(href); resolve();};
  image.onerror = () => reject(new Error(`Flag ${href} failed to load`));
  image.src = href;
});

/** The flags of `entities` (map ids), loaded before the frame is drawn; empty when `enabled` is false. */
export const useFlags = (entities: string[], enabled: boolean): Flags | undefined => {
  const wanted = enabled ? [...new Set(entities)].sort().join(',') : '';
  const [flags, setFlags] = useState<Flags | undefined>(!enabled ? NO_FLAGS : undefined);
  const [handle] = useState(() => (enabled ? delayRender('Loading flags') : undefined));
  useEffect(() => {
    if (!enabled) return;
    loadIndex().then(async (loaded) => {
      const hrefs = wanted.split(',').filter(Boolean).flatMap((id) => (loaded.countries[id] ? [[id, staticFile(`flags/${loaded.countries[id]}.svg`)] as const] : []));
      await Promise.all(hrefs.map(([, href]) => preload(href)));
      const byId = new Map(hrefs);
      setFlags({href: (entity) => byId.get(entity)});
      if (handle !== undefined) continueRender(handle);
    }).catch((error) => cancelRender(error));
  }, [wanted, enabled, handle]);
  return flags;
};

/** A flag as a small rounded badge centred on (x, y), 4:3, with a thin edge so a white flag shows on a pale map. */
export const FlagBadge: React.FC<{href: string; x: number; y: number; width: number; opacity?: number; id: string}> = ({href, x, y, width, opacity = 1, id}) => {
  const height = (width * 3) / 4;
  const clip = `flag-${id.replace(/[^a-z0-9]/gi, '')}-${Math.round(x)}-${Math.round(y)}`;
  return <g opacity={opacity}>
    <clipPath id={clip}><rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={height * 0.16} /></clipPath>
    <rect x={x - width / 2 - 2} y={y - height / 2 - 2} width={width + 4} height={height + 4} rx={height * 0.2} fill="#fff" opacity={0.92} />
    <image href={href} x={x - width / 2} y={y - height / 2} width={width} height={height} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
    <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={height * 0.16} fill="none" stroke="#000" strokeOpacity={0.25} strokeWidth={1.5} />
  </g>;
};

/** A country's name as a chip prints it: the formal tail dropped ("United States of America" is "United States"). */
export const shortCountryName = (name: string) => name.replace(/ of (America|the .+)$/, '').replace(/^(Republic|Kingdom|Federation) of /, '');

/**
 * Whether a label names the country it is anchored on, so its flag can ride with it: the label's words contain the
 * country's name (short or full). "AFRICA" anchored on Mozambique, or "EUROPE CLOSER" on Iceland, is not about that
 * country, and a flag there would say it was.
 */
export const labelNamesCountry = (text: string, name: string) => {
  const words = (value: string) => value.toUpperCase().replace(/\(.*?\)/g, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();
  const [label, short, full] = [words(text), words(shortCountryName(name)), words(name)];
  return [short, full].some((candidate) => candidate.length > 0 && ` ${label} `.includes(` ${candidate} `));
};
