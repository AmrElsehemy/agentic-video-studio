import type {Research} from './pokeapi.mjs';
import type {Complete} from './writer.mjs';

export type Criterion = 'uniqueness' | 'surprise' | 'specificity' | 'visual' | 'support';
export type Angle = {id: string; premise: string; hook: string; archetype: string; evidence: string[]; visualIdea: string; generic?: boolean};
export type RankedAngle = Angle & {generic: boolean; scores: Record<Criterion, number>; total: number; note: string};
export type AngleRound = {round: number; candidates: (Angle | RankedAngle)[]; rejected: {id: string; reason: string}[]; request?: string; error?: string};

export declare const CRITERIA: Criterion[];
export declare const MIN_ANGLE_SCORE: number;
export declare const GENERIC_FIELDS: string[];
export declare const isGeneric: (evidence: string[]) => boolean;
export declare const validateCandidates: (items: unknown[], research: Research, options?: {storyPattern?: string}) => {candidates: (Angle & {generic: boolean})[]; rejected: {id: string; reason: string}[]};
export declare const buildGeneratorPrompt: (options: {research: Research; storyPattern?: string; feedback?: string[]; count?: number}) => {system: string; messages: {role: string; content: string}[]};
export declare const buildCriticPrompt: (options: {research: Research; candidates: Angle[]}) => {system: string; messages: {role: string; content: string}[]};
export declare const rankCandidates: (candidates: (Angle & {generic: boolean})[], review: unknown) => RankedAngle[];
export declare const findAngle: (options: {research: Research; generate: Complete; critique?: Complete; storyPattern?: string; maxRounds?: number; onRound?: (round: AngleRound) => void}) => Promise<{chosen: RankedAngle & {belowBar?: boolean}; rounds: AngleRound[]}>;
export declare const describeAngle: (angle: Angle, research: Research) => string;
