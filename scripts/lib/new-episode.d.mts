import type {VideoManifest} from '../../src/schema';
import type {EngagementAudit} from './engagement.mjs';
import type {Research} from './pokeapi.mjs';
import type {Complete, Draft} from './writer.mjs';
import type {VerificationReport} from './fact-verifier.mjs';
import type {RankedAngle} from './angles.mjs';
import type {CreativeReview} from './creative-critic.mjs';
import type {VisualAssignment} from './visual-director.mjs';

export declare const runNewEpisode: (options: {
  number: number;
  root?: string;
  showId?: string;
  fetchJson: (url: string) => Promise<unknown>;
  complete: Complete;
  verify?: Complete | null;
  ideate?: Complete | null;
  angleCritique?: Complete | null;
  critique?: Complete | null;
  direct?: Complete | null;
  storyPattern?: string;
  refreshResearch?: boolean;
  overwrite?: boolean;
  maxAttempts?: number;
  maxWriterCalls?: number;
  log?: (line: string) => void;
}) => Promise<{id: string; research: Research; angle?: RankedAngle & {belowBar?: boolean}; visuals: {assigned: VisualAssignment[]; rejected: {id: string; reason: string}[]; modelError?: string}; draft: Draft; manifest: VideoManifest; audit: EngagementAudit; verification: VerificationReport; creative: CreativeReview; attempts: number}>;
