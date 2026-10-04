// Palette checks (#92): text and accents must stand out from what they sit on,
// whether a palette is dark (the shows' default) or light. Contrast is the
// WCAG ratio of relative luminances, 1 (none) to 21 (black on white).

const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance of a #rrggbb colour, 0 (black) to 1 (white). */
export const luminance = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};

/** WCAG contrast ratio between two colours, 1 to 21. */
export const contrastRatio = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/** "light" when the background is closer to white than black, else "dark". */
export const paletteMode = (palette) => (luminance(palette.background) > .5 ? 'light' : 'dark');

/**
 * The minimum contrasts: text (ink) 4.5:1 on the background and on the
 * surface (WCAG AA for text; maps put labels on the surface), and the accent
 * 3:1 on the background (WCAG's minimum for graphics, which highlights,
 * routes and data fills are).
 */
export const MIN_CONTRAST = {ink: 4.5, accent: 3};

/** What in a palette is too faint to read, as sentences; empty when it passes. */
export const paletteProblems = (palette) => [
  ['ink', 'background', MIN_CONTRAST.ink, 'text'],
  ['ink', 'surface', MIN_CONTRAST.ink, 'text'],
  ['primary', 'background', MIN_CONTRAST.accent, 'the accent'],
].flatMap(([fore, back, minimum, what]) => {
  const ratio = contrastRatio(palette[fore], palette[back]);
  return ratio < minimum ? [`${what} (${fore} ${palette[fore]}) on ${back} ${palette[back]} is ${ratio.toFixed(2)}:1, below ${minimum}:1`] : [];
});
