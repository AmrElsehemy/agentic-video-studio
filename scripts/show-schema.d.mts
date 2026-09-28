import type {z} from 'zod';

export type Wordmark = {lead: string; accent: string};
export type ShowFonts = {display: string; body: string};
export type MusicBed = {bpm: number; notes: number[]};

export declare const DISPLAY_FONTS: string[];
export declare const BODY_FONTS: string[];
export declare const wordmarkSchema: z.ZodType<Wordmark>;
export declare const fontsSchema: z.ZodType<ShowFonts>;
export declare const musicBedSchema: z.ZodType<MusicBed>;
export declare const showSchema: z.ZodType<import('./lib/shows.mjs').ShowProfile>;
