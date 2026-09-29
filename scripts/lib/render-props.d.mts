import type {VideoManifest} from '../../src/schema';

export declare const VOICES: readonly ['auto', 'openai', 'local', 'none'];
export declare const enforceSubjectOnlyArtwork: <T extends {show?: {id?: string}; subject?: {artworkUrl?: string}; related?: unknown[]; scenes?: Array<{artworkUrl?: string; [key: string]: unknown}>}>(manifest: T) => T;
export declare const prepareRenderProps: (episodeId: string, options?: {voice?: string; log?: (line: string) => void; warn?: (line: string) => void}) => {root: string; manifest: VideoManifest; propsPath: string};
export declare const reviewFrames: (manifest: Pick<VideoManifest, 'scenes' | 'format'>) => {index: number; seconds: number; frame: number}[];
export declare const framePath: (root: string, episodeId: string, index: number) => string;
