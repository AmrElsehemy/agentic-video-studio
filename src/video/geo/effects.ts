// Map effects (pure functions of the frame, so renders stay deterministic): a ripple ring where a
// place lights up, a brief flash on its fill, dashes marching along an outline, and numbers in a
// label that count up to their value as it appears.

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (progress: number) => 1 - (1 - progress) ** 3;

/** Frames the ripple takes to travel and fade. */
export const RIPPLE_FRAMES = 22;

/** The ring that spreads from a place's centre as it lights up: radius and stroke in px, and its opacity. */
export const ripple = (frame: number, startFrame: number): {radius: number; width: number; opacity: number} | null => {
  const elapsed = frame - startFrame;
  if (elapsed < 0 || elapsed >= RIPPLE_FRAMES) return null;
  const progress = elapsed / RIPPLE_FRAMES;
  return {radius: 14 + 120 * easeOut(progress), width: 7 * (1 - progress) + 1, opacity: 0.65 * (1 - progress) ** 1.6};
};

/** Frames the fill's flash fades over. */
export const FLASH_FRAMES = 10;

/** How much brighter a fill is for a moment as it lands: 1 at the start, 0 after FLASH_FRAMES. */
export const flash = (frame: number, startFrame: number) => {
  const elapsed = frame - startFrame;
  return elapsed < 0 ? 0 : clamp01(1 - elapsed / FLASH_FRAMES);
};

/** Dash length, gap and speed (px per frame) of the dashes that march along an outline. */
export const MARCH = {dash: 26, gap: 20, speed: 0.9};

/** The dash offset at `frame`, moving the dashes along the outline. */
export const marchOffset = (frame: number) => 0 - frame * MARCH.speed;

/** Frames a number takes to count up. */
export const COUNT_FRAMES = 18;

// A standalone number: not part of a word ("18TH"), not a decimal's tail, and a year-shaped one is left alone.
const NUMBER = /(?<![\dA-Za-z.,])\d[\d,]*(?:\.\d+)?(?![\dA-Za-z])/;

/**
 * `text` with its first number counted up to `progress` (0-1) of its value, in the same style: the
 * same decimals and thousands commas. At progress 1 (or when there is no number to count, or it
 * looks like a year) it is `text` itself, exactly.
 */
export const countUp = (text: string, progress: number): string => {
  const match = NUMBER.exec(text);
  if (!match || progress >= 1) return text;
  const raw = match[0];
  const value = Number(raw.replace(/,/g, ''));
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  if (!Number.isFinite(value) || (decimals === 0 && !raw.includes(',') && value >= 1000 && value <= 2100)) return text;
  const current = value * easeOut(clamp01(progress));
  const shown = decimals ? current.toFixed(decimals) : String(Math.round(current));
  const [whole, fraction] = shown.split('.');
  const grouped = raw.includes(',') ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole;
  return `${text.slice(0, match.index)}${fraction === undefined ? grouped : `${grouped}.${fraction}`}${text.slice(match.index + raw.length)}`;
};
