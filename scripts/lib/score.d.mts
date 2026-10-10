export const RATE: number;
export const AMBIENCES: string[];
export const SCORE_NAMES: ['wonder', 'epic', 'tension', 'calm', 'quirky', 'pulse'];
export type ScoreName = (typeof SCORE_NAMES)[number];
export const SCORES: Record<ScoreName, {bpm: number; key: number; bars: number; chords: [number, string][]; reverb: number}>;
export const intensityOf: (scene: {beat?: string; role?: string}, index: number, count: number) => number;
export const ambienceOf: (primitive: {ambience?: string; streets?: unknown; surface?: {kind: string}}) => string | undefined;
export const renderBed: (input: {manifest: any; speech?: Record<string, {start: number; end: number; pauses?: {start: number; end: number}[]}>; episodeId?: string}) => {left: Float32Array; right: Float32Array; windows: {id: string; start: number; end: number; level: number; ambience?: string}[]; duration: number};
