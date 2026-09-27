import type {VideoManifest} from '../../src/schema';

export type EngagementAudit = {
  pattern: string;
  score: number;
  passed: boolean;
  checks: {label: string; passed: boolean; points: number}[];
};

export declare const PASSING_SCORE: number;
export declare const scoreEpisode: (manifest: VideoManifest) => EngagementAudit;
