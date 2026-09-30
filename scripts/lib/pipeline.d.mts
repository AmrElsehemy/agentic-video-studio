export type PipelineStage = {
  name: string;
  inputs: () => unknown | Promise<unknown>;
  outputs?: () => string[];
  run?: () => void | Promise<void>;
  gate?: (hash: string, lock: PipelineLock) => string | null;
};
export type PipelineLock = {version: number; stages: Record<string, {hash: string; at: string}>; approvals: Record<string, {at: string}>};
export type PipelineResult = {ran: string[]; cached: string[]; skipped: string[]; stoppedAt: string | null; failed?: true};

export declare const STAGES: string[];
export declare const PIPELINE_VOICES: string[];
export declare const PIPELINE_VERSION: number;
export declare const hashOf: (value: unknown) => string;
export declare const hashFiles: (root: string, paths: string[]) => string;
export declare const readLock: (file: string) => PipelineLock;
export declare const writeLock: (file: string, lock: PipelineLock) => void;
export declare const runPipeline: (options: {stages: PipelineStage[]; until?: string; force?: string[]; lock: PipelineLock; saveLock?: (lock: PipelineLock) => void; dryRun?: boolean; log?: (line: string) => void}) => Promise<PipelineResult>;
export declare const execStep: (root: string, env?: Record<string, string>) => (label: string, command: string, args: string[]) => void;
export declare const episodeStages: (options: {root: string; episodeId: string; voice?: string; exec?: (label: string, command: string, args: string[]) => void}) => PipelineStage[];
export declare const approvalHash: (stages: PipelineStage[]) => string | null;
