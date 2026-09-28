import {z} from 'zod';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {fontsSchema, musicBedSchema, wordmarkSchema} from '../scripts/show-schema.mjs';

const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a six-digit hex color');

export const sceneSchema = z.object({
  id: z.string().min(1),
  durationSeconds: z.number().positive().max(12),
  beat: z.string().optional(),
  eyebrow: z.string().max(40).optional(),
  headline: z.string().min(1).max(70),
  narration: z.string().min(1).max(260),
  caption: z.string().min(1).max(120),
  role: z.enum(['hook', 'evidence', 'escalation', 'twist', 'payoff', 'interaction']),
  shot: z.enum(['mystery', 'wide', 'macro', 'tracking', 'comparison', 'impact', 'interaction']),
  subjectFocus: z.enum(['absent', 'hidden', 'secondary', 'primary']),
  beatEverySeconds: z.number().positive().max(1.5),
  visual: z.enum(['hook', 'gauntlet', 'advantage', 'race', 'tradeoff', 'cta']),
  artworkUrl: z.string().url().optional(),
  accent: color.optional(),
  facts: z.array(z.string().min(1).max(45)).max(4).optional(),
  primitive: primitiveSchema.optional(),
});

// Compiled episodes use an archetype from archetypes/<name>.json (checked by
// the compiler); legacy hand-authored manifests may also use reveal or debate.
export const storyPatternSchema = z.string().regex(/^[a-z0-9-]+$/);

export const videoSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  show: z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    handle: z.string().startsWith('@'),
    // Branding from the show profile (shows/<id>.json); without it the renderer shows the name in Bebas Neue.
    wordmark: wordmarkSchema.optional(),
    fonts: fontsSchema.optional(),
  }),
  title: z.string().min(1),
  direction: z.object({
    engineVersion: z.literal(2).optional(),
    storyPattern: storyPatternSchema.default('profile'),
    numberRelevant: z.boolean().default(false),
    premise: z.string().min(1).max(140),
    audiencePromise: z.string().min(1).max(140),
    openLoop: z.string().min(1).max(140),
    payoff: z.string().min(1).max(140),
    targetEmotion: z.enum(['curiosity', 'surprise', 'debate', 'awe']),
    engagementQuestion: z.string().min(1).max(140),
    targetSecondsBetweenVisualChanges: z.number().positive().max(1.5),
  }),
  subject: z.object({
    name: z.string().min(1),
    index: z.string().regex(/^#[0-9]{3,4}$/),
    category: z.string().min(1),
    artworkUrl: z.string().url(),
  }),
  evolutions: z.array(z.object({
    name: z.string().min(1),
    index: z.string().regex(/^#[0-9]{3,4}$/),
    artworkUrl: z.string().url(),
  })).max(3).default([]),
  format: z.object({width: z.literal(1080), height: z.literal(1920), fps: z.literal(30)}),
  palette: z.object({background: color, surface: color, primary: color, secondary: color, ink: color}),
  audio: z.object({
    voiceover: z.string().optional(),
    voice: z.object({
      provider: z.literal('openai'),
      model: z.string().min(1),
      voice: z.enum(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']),
      instructions: z.string().min(1).max(1000),
      speed: z.number().min(0.25).max(4).default(1),
      output: z.string().min(1),
    }).optional(),
    music: z.string().optional(),
    // How scripts/generate-audio.mjs builds the music bed (from the show profile).
    bed: musicBedSchema.optional(),
    musicVolume: z.number().min(0).max(1).default(0.12),
  }).default({musicVolume: 0.12}),
  rights: z.object({
    releaseStatus: z.enum(['internal-prototype', 'editorial-review', 'cleared']),
    publicReleaseApproved: z.boolean(),
    ownershipNotice: z.string().min(1),
    nonAffiliationNotice: z.string().min(1),
    assets: z.array(z.object({
      kind: z.string().min(1),
      sourceUrl: z.string().url(),
      owner: z.string().min(1),
      licenseStatus: z.enum(['owned', 'licensed', 'permission-required', 'unverified']),
      publicReleaseApproved: z.boolean(),
      notes: z.string().optional(),
    })).min(1),
  }),
  scenes: z.array(sceneSchema).min(3).max(12),
  sources: z.array(z.object({label: z.string(), url: z.string().url()})).min(1),
});

export type VideoManifest = z.infer<typeof videoSchema>;
export type VideoScene = z.infer<typeof sceneSchema>;

export const getDurationInFrames = (manifest: VideoManifest) =>
  Math.round(manifest.scenes.reduce((total, scene) => total + scene.durationSeconds, 0) * manifest.format.fps);
