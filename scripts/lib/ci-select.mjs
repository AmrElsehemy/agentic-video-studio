// Which episodes CI should render for a change. Rendering every episode on
// every push doesn't scale to a full Pokédex, so a change renders only the
// episodes it touches, plus a small golden set when shared code changes.

/** Paths that can't change how any episode renders. */
const NON_RENDERING = [/\.md$/i, /^docs\//, /^test\//, /^creative-references\//, /^\.github\/golden-episodes\.json$/];

/** The episode an episode-specific path belongs to, if any. */
const episodeOf = (file) => {
  const match = file.match(/^(?:drafts|research)\/[^/]+\/([a-z0-9-]+)\.json$/) ?? file.match(/^videos\/[^/]+\/([a-z0-9-]+)\//);
  return match?.[1];
};

/**
 * @param {object} options
 * @param {string[]} options.changedFiles paths changed by the push or PR
 * @param {string[]} options.catalog every episode id that exists now
 * @param {string[]} options.golden the regression set
 * @param {boolean} [options.full] render everything (nightly / manual)
 * @returns {{episodes: string[], reason: string}}
 */
export const selectEpisodes = ({changedFiles, catalog, golden, full = false}) => {
  const exists = new Set(catalog);
  if (full) return {episodes: [...catalog].sort(), reason: 'full catalog run'};

  const touched = new Set();
  let sharedChange;
  for (const file of changedFiles) {
    const episode = episodeOf(file);
    if (episode) {
      if (exists.has(episode)) touched.add(episode);
      continue;
    }
    if (NON_RENDERING.some((pattern) => pattern.test(file))) continue;
    sharedChange ??= file;
  }

  const episodes = new Set(touched);
  if (sharedChange) for (const id of golden) if (exists.has(id)) episodes.add(id);
  const reasons = [];
  if (touched.size) reasons.push(`changed episodes: ${[...touched].sort().join(', ')}`);
  if (sharedChange) reasons.push(`golden set, because shared code changed (e.g. ${sharedChange})`);
  return {episodes: [...episodes].sort(), reason: reasons.join('; ') || 'nothing that affects rendering changed'};
};
