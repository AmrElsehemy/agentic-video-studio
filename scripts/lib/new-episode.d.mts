import type {VideoManifest} from '../../src/schema';
import type {EngagementAudit} from './engagement.mjs';
import type {Research} from './pokeapi.mjs';
import type {Complete, Draft} from './writer.mjs';

export declare const runNewEpisode: (options: {
  number: number;
  root?: string;
  showId?: string;
  fetchJson: (url: string) => Promise<unknown>;
  complete: Complete;
  storyPattern?: string;
  refreshResearch?: boolean;
  overwrite?: boolean;
  maxAttempts?: number;
  log?: (line: string) => void;
}) => Promise<{id: string; research: Research; draft: Draft; manifest: VideoManifest; audit: EngagementAudit; attempts: number}>;
