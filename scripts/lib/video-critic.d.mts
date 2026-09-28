import type {VideoManifest} from '../../src/schema';
import type {FrameIssue} from './frame-audit.mjs';

export type ContentPart = {type: 'text'; text: string} | {type: 'image'; mediaType: string; data: string};
export type VisionComplete = (request: {system: string; messages: {role: string; content: string | ContentPart[]}[]}) => Promise<string>;

export declare const VISUAL_CHECKS: Record<string, string>;
export declare const frameExpectations: (manifest: VideoManifest) => Record<string, unknown>[];
export declare const buildVideoCriticPrompt: (options: {manifest: VideoManifest; frames: {png: string}[]; cover?: {png: string}}) => {system: string; messages: {role: string; content: ContentPart[]}[]};
export declare const critiqueFrames: (options: {manifest: VideoManifest; frames: {png: string}[]; cover?: {png: string}; complete: VisionComplete}) => Promise<{issues: FrameIssue[]; modelError?: string}>;
