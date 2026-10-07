import type {Angle} from './angles.mjs';
import type {Research} from './pokeapi.mjs';
import type {Complete, Draft} from './writer.mjs';

export type CreativeCriterion = 'hook' | 'specificity' | 'tension' | 'escalation' | 'surprise' | 'variety' | 'payoff' | 'question';
export type ExplainerCriterion = 'hook' | 'clarity' | 'order' | 'specificity' | 'tension' | 'variety' | 'payoff' | 'question';
export type CreativeFinding = {criterion: CreativeCriterion; quote: string; note: string};
export type CriterionReview = {criterion: CreativeCriterion | ExplainerCriterion; score: number; quote: string; revision: string; capped?: boolean};
export type CreativeReview =
  | {skipped: true; passed: true; findings: CreativeFinding[]; modelError?: string}
  | {skipped?: undefined; modelError?: undefined; score: number; passed: boolean; criteria: CriterionReview[]; findings: CreativeFinding[]};
/** The fields the critic reads; drafts and curated references both have them. */
export type Story = Pick<Draft, 'title' | 'premise' | 'openLoop' | 'payoff' | 'engagementQuestion'> & {subject: {name: string}; scenes: {id: string; headline: string; narration: string; caption: string}[]};

export declare const CREATIVE_CRITERIA: Record<CreativeCriterion, string>;
export declare const EXPLAINER_CRITERIA: Record<ExplainerCriterion, string>;
export declare const CREATIVE_PASSING_SCORE: number;
export declare const CRITERION_FLOOR: number;
export declare const deterministicCritique: (draft: Pick<Story, 'subject' | 'scenes'>) => CreativeFinding[];
export declare const buildCreativeCriticPrompt: (options: {draft: Story; research?: Research; angle?: Angle}) => {system: string; messages: {role: string; content: string}[]};
export declare const buildExplainerCriticPrompt: (options: {draft: Omit<Story, 'subject'> & {show?: {name: string}; scenes: {id: string; beat?: string; headline: string; narration: string}[]}; sources: string}) => {system: string; messages: {role: string; content: string}[]};
export declare const critiqueDraft: (options: {draft: Story; research?: Research; angle?: Angle; complete?: Complete | null; kind?: 'story' | 'explainer'; sources?: string}) => Promise<CreativeReview>;
export declare const creativeProblems: (review: CreativeReview) => string[];
export type CalibrationStory = {label: string; story: Story; research?: Research; expect: 'pass' | 'lower'};
export declare const calibrateCritic: (options: {stories: CalibrationStory[]; complete: Complete}) => Promise<{rows: {label: string; expect: 'pass' | 'lower'; review: CreativeReview; ok: boolean}[]; calibrated: boolean}>;
export declare const referenceStory: (reference: import('./references.mjs').CreativeReference) => Story;
