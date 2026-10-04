import type {z} from 'zod';

export declare const idSchema: z.ZodString;
export declare const colorSchema: z.ZodString;
export declare const paletteSchema: z.ZodObject<{background: z.ZodString; surface: z.ZodString; primary: z.ZodString; secondary: z.ZodString; ink: z.ZodString}>;
export declare const TARGET_EMOTIONS: readonly ['curiosity', 'surprise', 'debate', 'awe'];
export declare const pitchLine: z.ZodString;
export declare const VOICE_NAMES: readonly ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
export declare const VOICE_PROVIDERS: readonly ['openai', 'elevenlabs'];
export declare const VOICE_MODELS: {openai: string; elevenlabs: string};
export declare const ELEVENLABS_SPEED: [number, number];
export declare const voiceProblems: (voice: {provider?: string; voice: string; speed?: number; model?: string}) => string[];
export declare const voiceSettings: {
  model: z.ZodString;
  voice: z.ZodEnum<{[K in (typeof VOICE_NAMES)[number]]: K}>;
  speed: z.ZodNumber;
  instructions: z.ZodString;
};
export declare const sceneText: {
  eyebrow: z.ZodOptional<z.ZodString>;
  headline: z.ZodString;
  narration: z.ZodString;
  caption: z.ZodString;
  artworkUrl: z.ZodOptional<z.ZodString>;
  facts: z.ZodOptional<z.ZodArray<z.ZodString>>;
  accent: z.ZodOptional<z.ZodString>;
};
export type Review = {reviewer: string; date: string; decision: string};
export declare const reviewSchema: z.ZodType<Review>;
type Asset = {kind: string; sourceUrl: string; owner: string; licenseStatus: 'owned' | 'licensed' | 'public-domain' | 'permission-required' | 'unverified'; publicReleaseApproved: boolean; notes?: string};
export type Rights = {
  releaseStatus: 'internal-prototype' | 'editorial-review' | 'cleared';
  publicReleaseApproved: boolean;
  ownershipNotice: string;
  nonAffiliationNotice: string;
  assets: Asset[];
  bordersReview?: Review;
  artworkReview?: Review;
};
export declare const rightsSchema: z.ZodType<Rights>;
export declare const sourcesSchema: z.ZodType<{label: string; url: string}[]>;
