import type {Complete} from './writer.mjs';

export declare const PROVIDERS: Record<string, {keyEnv: string; defaultModel: string}>;
export declare const resolveProvider: (options?: {provider?: string; env?: Record<string, string | undefined>}) => string;
export declare const AGENT_ROLES: Record<string, {prefix: string; checker: boolean}>;
export declare const resolveRole: (role?: string, env?: Record<string, string | undefined>, options?: {provider?: string}) => {provider: string; model: string; source: string};
export declare const createCompletion: (options?: {
  role?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}) => Complete & import('./video-critic.mjs').VisionComplete & {provider: string; model: string; role: string};
