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
  sources: {label: string; url: string}[];
};

export declare const POKEAPI: string;
export declare const formatIndex: (number: number) => string;
export declare const researchPokemon: (number: number, options: {fetchJson: (url: string) => Promise<unknown>}) => Promise<Research>;
