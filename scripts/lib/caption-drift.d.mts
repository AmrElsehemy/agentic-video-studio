import type {TimedWord} from './captions.mjs';
export type DriftWord = {text: string; scene?: string; caption: number; spoken: number; drift: number};
export type DriftReport = {words: DriftWord[]; unmatched: number; median?: number; p90?: number; max?: number; mean?: number; pass: boolean};
export declare const MAX_DRIFT: number;
export declare const matchWords: (a: {text: string}[], b: {text: string}[]) => number[];
export declare const timelineWords: (manifest: {scenes: {id: string; durationSeconds: number; words?: TimedWord[]}[]}) => {text: string; start: number; scene: string}[];
export declare const captionDrift: (captions: {text: string; start: number; scene?: string}[], spoken: TimedWord[]) => DriftReport;
