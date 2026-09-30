// Which episodes CI should render for a change, and how. Rendering every
// episode on every push doesn't scale to a full Pokédex, so a change renders
// only the episodes it touches (as full MP4s), and a shared-code change checks
// a small golden set frame by frame: the video critic only reads one frame per
// scene and the cover, so rendering just those catches the same problems for a
// fraction of the cost. Nightly runs still render every episode in full.

/** Paths that can't change how any episode renders. */
const NON_RENDERING = [/\.md$/i, /^docs\//, /^test\//, /^creative-references\//, /^scripts\/(lib\/)?pipeline\.(mjs|d\.mts)$/];

/** Map-only paths: they can't change an episode without a map, so they run the geo golden frames instead. */
const GEO_ONLY = [/^public\/geo\//, /^src\/video\/geo\//, /^scripts\/(lib\/)?geo-[a-z-]+\.(mjs|d\.mts|json)$/, /^test\/(golden\/geo|fixtures\/geo-)/];
/** Shared paths that also shape map scenes (the primitive contract, the scene layout, dependencies). */
const GEO_SHARED = [/^scripts\/primitive-schema\./, /^src\/video\/(primitives|CompiledEpisodeScene)\.tsx$/, /^src\/schema\.ts$/, /^package(-lock)?\.json$/, /^\.github\/workflows\//];

/**
 * Shared paths that can change the MP4 in ways review frames can't show:
 * audio, encoding, the render script and its QA, dependencies and the workflow.
 * A change here adds one full golden render as a smoke test.
 */
const MP4_ONLY = [
  /^scripts\/(render|qa|generate-audio|generate-voice)\.mjs$/,
  /^scripts\/lib\/(render-props|sound-design|voice-lock)\.mjs$/,
  /^src\/video\/VerticalEpisode\.tsx$/,
  /^public\//,
  /^shows\//,
  /^remotion\.config\.ts$/,
  /^package(-lock)?\.json$/,
  /^\.github\/workflows\//,
];

/** The episode an episode-specific path belongs to, if any. */
const episodeOf = (file) => {
  const match = file.match(/^(?:drafts|research)\/[^/]+\/([a-z0-9-]+)(?:\.[a-z]+)?\.json$/) ?? file.match(/^videos\/[^/]+\/([a-z0-9-]+)\//);
  return match?.[1];
};

/**
 * @param {object} options
 * @param {string[]} options.changedFiles paths changed by the push or PR
 * @param {string[]} options.catalog every episode id that exists now
 * @param {string[]} options.golden the regression set
 * @param {boolean} [options.full] render everything (nightly / manual)
 * @returns {{episodes: string[], frames: string[], geo: boolean, reason: string}} episodes to render as full MP4s, episodes to check frame by frame, and whether to check the geo golden frames
 */
export const selectEpisodes = ({changedFiles, catalog, golden, full = false}) => {
  const exists = new Set(catalog);
  if (full) return {episodes: [...catalog].sort(), frames: [], geo: true, reason: 'full catalog run'};

  const touched = new Set();
  let sharedChange;
  let mp4Change;
  let geoChange;
  for (const file of changedFiles) {
    if (GEO_ONLY.some((pattern) => pattern.test(file))) {
      geoChange ??= file;
      continue;
    }
    if (GEO_SHARED.some((pattern) => pattern.test(file))) geoChange ??= file;
    const episode = episodeOf(file);
    if (episode) {
      if (exists.has(episode)) touched.add(episode);
      continue;
    }
    if (NON_RENDERING.some((pattern) => pattern.test(file))) continue;
    sharedChange ??= file;
    if (MP4_ONLY.some((pattern) => pattern.test(file))) mp4Change ??= file;
  }

  const episodes = new Set(touched);
  const goldenNow = golden.filter((id) => exists.has(id));
  const smoke = mp4Change ? goldenNow.find((id) => !touched.has(id)) : undefined;
  if (smoke && !touched.size) episodes.add(smoke);
  const frames = sharedChange ? goldenNow.filter((id) => !episodes.has(id)) : [];

  const reasons = [];
  if (touched.size) reasons.push(`full render of changed episodes: ${[...touched].sort().join(', ')}`);
  if (smoke && !touched.size) reasons.push(`full render of ${smoke}, because audio or encoding may have changed (e.g. ${mp4Change})`);
  if (frames.length) reasons.push(`frame check of the golden set, because shared code changed (e.g. ${sharedChange})`);
  if (geoChange) reasons.push(`geo golden frames, because map rendering may have changed (e.g. ${geoChange})`);
  return {episodes: [...episodes].sort(), frames: frames.sort(), geo: Boolean(geoChange), reason: reasons.join('; ') || 'nothing that affects rendering changed'};
};

/** GitHub Actions caps a job matrix at 256 entries; stay well below it. */
export const MAX_SHARDS = 64;

/**
 * Group episodes into at most maxShards render jobs, as space-separated ids.
 * Small selections get one job per episode; large ones are spread evenly.
 */
export const toShards = (episodes, maxShards = MAX_SHARDS) => {
  const count = Math.min(episodes.length, maxShards);
  const shards = Array.from({length: count}, () => []);
  episodes.forEach((id, index) => shards[index % count].push(id));
  return shards.map((shard) => shard.join(' '));
};
