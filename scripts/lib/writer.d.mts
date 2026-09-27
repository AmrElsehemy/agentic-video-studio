import type {VideoManifest} from '../../src/schema';
import type {EngagementAudit} from './engagement.mjs';
import type {Research} from './pokeapi.mjs';
import type {CreativeReference} from './references.mjs';
import type {VerificationReport} from './fact-verifier.mjs';

type DraftScene = {id: string; beat?: string; eyebrow?: string; headline: string; narration: string; caption: string; facts?: string[]; accent?: string; artworkUrl: string};
export type Draft = {
  id: string;
  title: string;
  storyPattern: string;
  numberRelevant: boolean;
  premise: string;
  audiencePromise: string;
  openLoop: string;
  payoff: string;
  targetEmotion: string;
  engagementQuestion: string;
  subject: {name: string; index: string; category: string; artworkUrl: string};
  evolutions: {name: string; index: string; artworkUrl: string}[];
  palette: Record<string, string>;
  voice: {voice: string; speed: number; instructions: string};
  rights: {releaseStatus: string; publicReleaseApproved: boolean; ownershipNotice: string; nonAffiliationNotice: string; assets: {kind: string; sourceUrl: string; owner: string; licenseStatus: string; publicReleaseApproved: boolean; notes?: string}[]};
  scenes: DraftScene[];
  sources: {label: string; url: string}[];
};
export type Complete = (request: {system: string; messages: {role: string; content: string}[]}) => Promise<string>;

export declare const creativeSchema: unknown;
export declare const POKEPULSES_NOTICES: {ownershipNotice: string; nonAffiliationNotice: string};
export declare const artworkChoices: (research: Research) => Map<string, {name: string; index: string; artworkUrl: string}>;
export declare const researchNumbers: (research: Research) => Set<number>;
export declare const factCheck: (draft: Draft, research: Research) => string[];
export declare const assembleDraft: (creative: unknown, research: Research, options?: {showId?: string}) => {draft: Draft; problems: string[]; showId: string};
export declare const evaluateDraft: (draft: Draft, research: Research, options?: {showId?: string}) => {problems: string[]; manifest?: VideoManifest; audit?: EngagementAudit};
export declare const buildWriterPrompt: (options: {research: Research; directing: string; references?: CreativeReference[]; storyPattern?: string}) => {system: string; user: string};
export declare const parseReply: (text: string) => unknown;
export declare const writeEpisode: (options: {research: Research; complete: Complete; verify?: Complete | null; directing: string; references?: CreativeReference[]; storyPattern?: string; showId?: string; maxAttempts?: number; onAttempt?: (attempt: {attempt: number; problems: string[]; audit?: EngagementAudit; verification?: VerificationReport}) => void}) => Promise<{draft: Draft; manifest: VideoManifest; audit: EngagementAudit; verification: VerificationReport; attempts: number}>;
