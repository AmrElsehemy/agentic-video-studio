import type {VideoManifest} from '../../src/schema';

export type FrameIssue = {where: string; check: string; severity: 'blocking' | 'warning'; message: string; source?: 'audit' | 'vision'};
export type AuditedFrame = {text?: string; gray?: Uint8Array | number[]};

export declare const words: (text: string) => string[];
export declare const coverage: (expected: string, ocrText: string) => number;
export declare const occurrences: (phrase: string, ocrText: string) => number;
export declare const MIN_COVERAGE: number;
export declare const frameStats: (gray: Uint8Array | number[]) => {mean: number; stddev: number};
export declare const difference: (a: Uint8Array | number[], b: Uint8Array | number[]) => number;
export declare const auditFrames: (options: {manifest: VideoManifest; frames: AuditedFrame[]; cover?: AuditedFrame}) => FrameIssue[];
