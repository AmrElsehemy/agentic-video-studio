import type {VideoManifest} from '../../src/schema';

export declare const DEFAULT_SPEED: number;
export declare const BASE_WPM: number;
export declare const SAFE_RATIO: number;
export declare const END_PADDING: number;
export declare const MIN_SCENE: number;
export declare const MAX_SCENE: number;
export declare const MAX_TOTAL: number;

export declare const estimatedSpeech: (text: string, speed: number) => number;
export declare const safeDuration: (text: string, speed: number) => number;
export declare const compileEpisode: (rawDraft: unknown, options: {showId: string; show?: import('./shows.mjs').ShowProfile; geo?: import('./geo-primitives.mjs').GeoData}) => {manifest: VideoManifest; totalSeconds: number};
export declare const serializeManifest: (manifest: unknown) => string;
export declare const firstDifference: (expected: unknown, actual: unknown, at?: string) => string | null;
export declare const manifestDrift: (manifest: unknown, committedJson: string) => string | null;
