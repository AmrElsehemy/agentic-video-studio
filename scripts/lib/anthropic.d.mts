import type {Complete} from './writer.mjs';

export declare const DEFAULT_WRITER_MODEL: string;
export declare const createClaudeCompletion: (options?: {apiKey?: string; model?: string; maxTokens?: number}) => Complete;
