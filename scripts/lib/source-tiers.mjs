// Source-quality tiers for research facts. Not every fact is equally safe to
// say out loud: official Pokédex text and game data can be stated plainly,
// data derived by PokéAPI or wiki tables should be stated precisely, and
// community lore may only be told as lore ("some fans believe...").

export const TIERS = ['official', 'trusted_secondary', 'community'];
const RANK = {official: 0, trusted_secondary: 1, community: 2};

/**
 * Which research fields belong to which tier, as pointer patterns with array
 * indices written as []. Written into every research file; research cached
 * before tiers existed falls back to these.
 */
export const DEFAULT_TIERS = {
  official: [
    'name', 'index', 'number', 'category', 'generation', 'isLegendary', 'isMythical', 'types', 'heightMeters', 'weightKg',
    'pokedexEntries', 'evolutionChain[].name', 'evolutionChain[].index', 'evolutionChain[].types', 'evolutionChain[].stage',
    'varieties[].types', 'varieties[].heightMeters', 'varieties[].weightKg',
  ],
  trusted_secondary: ['evolutionChain[].method', 'evolutionChain[].evolvesFrom', 'varieties[].name'],
  community: ['lore'],
};

export const TIER_GUIDANCE = {
  official: 'official Pokédex text and game data: state it plainly.',
  trusted_secondary: 'derived from game data by PokéAPI or wiki data tables: state it plainly but precisely, without embellishing.',
  community: 'fan lore and theories: never state it as fact. Only use it hedged ("some fans believe…", "legend says…", "may"), or leave it out.',
};

/** The tier rules for a research record: its own per tier, falling back to the defaults for any tier it omits. */
export const tierRules = (research) => Object.fromEntries(TIERS.map((tier) => [tier, research?.tiers?.[tier] ?? DEFAULT_TIERS[tier]]));

const normalize = (pointer) => pointer.replace(/\[\d+\]/g, '[]').replace(/\s+/g, '');

/** The tier of the research field a pointer names; unknown fields count as trusted_secondary. */
export const tierOf = (pointer, research) => {
  const rules = tierRules(research);
  const normalized = normalize(pointer);
  // The longest matching pattern wins, so "evolutionChain[].method" beats "evolutionChain".
  let best;
  for (const tier of TIERS) {
    for (const pattern of rules[tier]) {
      const matches = normalized === pattern || normalized.startsWith(`${pattern}.`) || normalized.startsWith(`${pattern}[`);
      if (matches && (!best || pattern.length > best.pattern.length)) best = {tier, pattern};
    }
  }
  return best?.tier ?? 'trusted_secondary';
};

/** The strongest tier among a claim's evidence, or undefined with no evidence. */
export const strongestTier = (evidence, research) => evidence
  .map((pointer) => tierOf(pointer, research))
  .sort((a, b) => RANK[a] - RANK[b])[0];

const HEDGE = /\b(may|might|possibly|perhaps|supposedly|reportedly|allegedly|rumou?red|legends?\s+(say|says|tell)|some\s+(say|believe|think|fans|trainers|people)|fans\s+(believe|think|say)|is\s+said|are\s+said|according\s+to|theor(y|ies|ize|ise))\b/i;

/** Whether a sentence presents its claim as lore or possibility rather than fact. */
export const isHedged = (text) => HEDGE.test(text);
