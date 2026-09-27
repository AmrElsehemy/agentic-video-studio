import type {VideoManifest} from '../../src/schema';

export declare const voiceInputHash: (manifest: VideoManifest, provider: string) => string;
export declare const voiceStaleReason: (manifest: VideoManifest, provider: string, timing: {inputHash?: string} | null) => string | null;
