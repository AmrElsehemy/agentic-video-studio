// Fields a creative draft (scripts/draft-schema.mjs) and a compiled manifest
// (src/schema.ts) share, defined once so the two can't drift apart.
import {z} from 'zod';

export const idSchema = z.string().regex(/^[a-z0-9-]+$/);
export const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a six-digit hex color');
export const paletteSchema = z.object({background: colorSchema, surface: colorSchema, primary: colorSchema, secondary: colorSchema, ink: colorSchema});

export const TARGET_EMOTIONS = ['curiosity', 'surprise', 'debate', 'awe'];
/** The episode's promise, loop and payoff: one short line each. */
export const pitchLine = z.string().min(1).max(140);

export const VOICE_NAMES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
/** Who reads the narration (#102). OpenAI voices are named; an ElevenLabs voice is its voice id. */
export const VOICE_PROVIDERS = ['openai', 'elevenlabs'];
/** Default model per provider. */
export const VOICE_MODELS = {openai: 'gpt-4o-mini-tts', elevenlabs: 'eleven_v4'};
/** ElevenLabs takes a narrower speed range than OpenAI. */
export const ELEVENLABS_SPEED = [0.7, 1.2];

/** What's wrong with a voice for its provider: an OpenAI voice name, or an ElevenLabs speed in range. */
export const voiceProblems = ({provider = 'openai', voice, speed, model}) => [
  ...(model && (provider === 'elevenlabs') !== model.startsWith('eleven_') ? [`"${model}" isn't an ${provider} model; use ${VOICE_MODELS[provider]} or leave model out`] : []),
  ...(provider === 'openai' && !VOICE_NAMES.includes(voice) ? [`"${voice}" isn't an OpenAI voice; use one of ${VOICE_NAMES.join(', ')}`] : []),
  ...(provider === 'elevenlabs' && !/^[A-Za-z0-9]{10,40}$/.test(voice) ? [`"${voice}" isn't an ElevenLabs voice id`] : []),
  ...(provider === 'elevenlabs' && speed !== undefined && (speed < ELEVENLABS_SPEED[0] || speed > ELEVENLABS_SPEED[1]) ? [`ElevenLabs speed must be ${ELEVENLABS_SPEED.join('–')}, not ${speed}`] : []),
];

export const voiceSettings = {
  model: z.string().min(1),
  voice: z.enum(VOICE_NAMES),
  speed: z.number().min(0.25).max(4),
  instructions: z.string().min(1).max(1000),
};

/** On-screen scene text limits. */
export const sceneText = {
  eyebrow: z.string().max(40).optional(),
  headline: z.string().min(1).max(70),
  narration: z.string().min(1).max(260),
  caption: z.string().min(1).max(120),
  artworkUrl: z.string().url().optional(),
  facts: z.array(z.string().min(1).max(45)).max(4).optional(),
  accent: colorSchema.optional(),
};

/** A person's recorded decision: who, when, and what they decided. */
export const reviewSchema = z.object({reviewer: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), decision: z.string().min(1).max(500)}).strict();

export const rightsSchema = z.object({
  releaseStatus: z.enum(['internal-prototype', 'editorial-review', 'cleared']),
  publicReleaseApproved: z.boolean(),
  ownershipNotice: z.string().min(1),
  nonAffiliationNotice: z.string().min(1),
  assets: z.array(z.object({
    kind: z.string().min(1),
    sourceUrl: z.string().url(),
    owner: z.string().min(1),
    licenseStatus: z.enum(['owned', 'licensed', 'public-domain', 'permission-required', 'unverified']),
    publicReleaseApproved: z.boolean(),
    notes: z.string().optional(),
  })).min(1),
  // A person's sign-off on how disputed borders or names are shown (map episodes touching flagged places).
  bordersReview: reviewSchema.optional(),
  // The rights owner's own legal review allowing 'permission-required' artwork to be published without a licence.
  artworkReview: reviewSchema.optional(),
});

export const sourcesSchema = z.array(z.object({label: z.string().min(1), url: z.string().url()})).min(1);
