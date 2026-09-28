export type EvolutionMember = {
  name: string;
  index: string;
  stage: number;
  evolvesFrom?: string;
  method?: string;
  types: string[];
  artworkUrl: string;
  isSubject: boolean;
};

export type Research = {
  schemaVersion: 1;
  id: string;
  number: number;
  index: string;
  name: string;
  slug: string;
  category: string;
  generation: string;
  isLegendary: boolean;
  isMythical: boolean;
  types: string[];
  heightMeters: number;
  weightKg: number;
  artworkUrl: string;
  pokedexEntries: {game: string; text: string}[];
  evolutionChain: EvolutionMember[];
  varieties: {name: string; types: string[]; heightMeters: number; weightKg: number; artworkUrl: string}[];
  /** Community lore with its source; may only be stated hedged. */
  lore?: {text: string; source: {label: string; url: string}}[];
  /** Field patterns per source tier; research cached before tiers existed uses DEFAULT_TIERS. */
  tiers?: import('./source-tiers.mjs').TierRules;
  sources: {label: string; url: string; tier?: import('./source-tiers.mjs').Tier}[];
};

export declare const POKEAPI: string;
export declare const formatIndex: (number: number) => string;
export declare const researchPokemon: (number: number, options: {fetchJson: (url: string) => Promise<unknown>}) => Promise<Research>;
