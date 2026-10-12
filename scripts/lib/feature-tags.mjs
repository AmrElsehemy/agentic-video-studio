// What an episode is made of, read from its own manifest, so performance can be compared by feature
// without anyone tagging episodes by hand. Tags describe what the viewer sees, not how it was authored.
const ANNOTATIONS = {photo: 'photo', timeline: 'timeline', route: 'route', reconstruction: 'reconstruction', truesize: 'true-size', ring: 'ring', arrow: 'arrow'};

export const featureTags = (manifest) => {
  const tags = new Set();
  const primitives = manifest.scenes.map((scene) => scene.primitive).filter((primitive) => primitive?.kind === 'geo-map');
  for (const primitive of primitives) {
    if (primitive.flags) tags.add('flags');
    if (primitive.globe) tags.add('globe');
    if (primitive.morph) tags.add('projection-morph');
    if (primitive.relief) tags.add('relief');
    if (primitive.streets) tags.add('street-plan');
    if (primitive.surface) tags.add('surface');
    if (primitive.data) tags.add(`data-${primitive.data.view ?? 'map'}`);
    if (primitive.series) tags.add(`chart-${primitive.series.view}`);
    if (primitive.cut) tags.add('cuts');
    for (const annotation of primitive.annotations ?? []) if (ANNOTATIONS[annotation.type]) tags.add(ANNOTATIONS[annotation.type]);
  }
  if (manifest.palette) tags.add(isLight(manifest.palette.background) ? 'light-palette' : 'dark-palette');
  if (manifest.look && manifest.look !== 'classic') tags.add(`look-${manifest.look}`);
  const hook = manifest.scenes[0];
  tags.add(`hook-${hook?.shot ?? 'unknown'}`);
  tags.add(`story-${manifest.direction?.storyPattern ?? 'unknown'}`);
  tags.add(hook?.narration?.trim().endsWith('?') ? 'question-hook' : 'statement-hook');
  return [...tags].sort();
};

const isLight = (hex) => {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
};
