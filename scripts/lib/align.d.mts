import type {TimedWord} from './captions.mjs';
export declare const alignNarration: (options: {root: string; track: string; scenes: {id: string; narration: string; durationSeconds: number}[]; python?: string}) => {words?: Record<string, TimedWord[]>; error?: string};
export declare const alignerAvailable: (python?: string) => boolean;
