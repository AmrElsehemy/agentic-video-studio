import type {Research} from './pokeapi.mjs';

export type Tier = 'official' | 'trusted_secondary' | 'community';
export type TierRules = Record<Tier, string[]>;

export declare const TIERS: Tier[];
export declare const DEFAULT_TIERS: TierRules;
export declare const TIER_GUIDANCE: Record<Tier, string>;
export declare const tierOf: (pointer: string, research?: Pick<Research, 'tiers'>) => Tier;
export declare const strongestTier: (evidence: string[], research?: Pick<Research, 'tiers'>) => Tier | undefined;
export declare const isHedged: (text: string) => boolean;
export declare const tierRules: (research?: {tiers?: Partial<Record<Tier, string[] | null>>}) => TierRules;
