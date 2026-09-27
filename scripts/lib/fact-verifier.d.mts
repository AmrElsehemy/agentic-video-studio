import type {Research} from './pokeapi.mjs';
import type {Complete, Draft} from './writer.mjs';

export type Verdict = 'supported' | 'unsupported' | 'uncertain' | 'no-claim';
export type Claim = {id: string; where: string; text: string};
export type CheckedClaim = Claim & {verdict: Verdict; evidence: string[]; note: string; checkedBy: 'rules' | 'model' | 'none'};
export type VerificationReport = {claims: CheckedClaim[]; unsupported: CheckedClaim[]; uncertain: CheckedClaim[]};

export declare const VERDICTS: Verdict[];
export declare const POKEMON_TYPES: string[];
export declare const extractClaims: (draft: Draft) => Claim[];
export declare const parseJsonReply: (text: string) => unknown;
export declare const resolvePointer: (research: Research, pointer: string) => unknown;
export declare const deterministicCheck: (claim: Claim, research: Research) => {verdict: Verdict; evidence: string[]; note: string} | undefined;
export declare const buildVerifierPrompt: (options: {research: Research; claims: Claim[]}) => {system: string; messages: {role: string; content: string}[]};
export declare const verifyDraft: (options: {draft: Draft; research: Research; complete?: Complete | null}) => Promise<VerificationReport>;
export declare const verificationProblems: (report: VerificationReport) => string[];
