import {z} from 'zod';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {fontsSchema, musicBedSchema, wordmarkSchema} from '../scripts/show-schema.mjs';
import {relatedSchema, subjectSchema} from '../scripts/subject-schema.mjs';
import {idSchema, paletteSchema, pitchLine, rightsSchema, sceneText, sourcesSchema, TARGET_EMOTIONS, voiceSettings} from '../scripts/episode-fields.mjs';

export const sceneSchema = z.object({
  id: z.string().min(1),
  durationSeconds: z.number().positive().max(12),
  beat: z.string().optional(),
  ...sceneText,
  role: z.enum(['hook', 'evidence', 'escalation', 'twist', 'payoff', 'interaction']),
  shot: z.enum(['mystery', 'wide', 'macro', 'tracking', 'comparison', 'impact', 'interaction']),
  subjectFocus: z.enum(['absent', 'hidden', 'secondary', 'primary']),
  beatEverySeconds: z.number().positive().max(1.5),
  visual: z.enum(['hook', 'gauntlet', 'advantage', 'race', 'tradeoff', 'cta']),
  primitive: primitiveSchema.optional(),
});

// Compiled episodes use an archetype from archetypes/<name>.json (checked by
// the compiler); legacy hand-authored manifests may also use reveal or debate.
export const storyPatternSchema = idSchema;

export const videoSchema = z.object({
  // 2: generic subject (identifier, attributes) and related subjects instead of Pokédex index and evolutions.
  schemaVersion: z.literal(2),
  id: idSchema,
  show: z.object({
    id: idSchema,
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
    premise: pitchLine,
    audiencePromise: pitchLine,
    openLoop: pitchLine,
    payoff: pitchLine,
    targetEmotion: z.enum(TARGET_EMOTIONS),
    engagementQuestion: pitchLine,
    targetSecondsBetweenVisualChanges: z.number().positive().max(1.5),
  }),
  subject: subjectSchema,
  related: z.array(relatedSchema).max(3).default([]),
  format: z.object({width: z.literal(1080), height: z.literal(1920), fps: z.literal(30)}),
  palette: paletteSchema,
  audio: z.object({
    voiceover: z.string().optional(),
    voice: z.object({
      provider: z.literal('openai'),
      ...voiceSettings,
      speed: voiceSettings.speed.default(1),
      output: z.string().min(1),
    }).optional(),
    music: z.string().optional(),
    // How scripts/generate-audio.mjs builds the music bed (from the show profile).
    bed: musicBedSchema.optional(),
    musicVolume: z.number().min(0).max(1).default(0.12),
  }).default({musicVolume: 0.12}),
  rights: rightsSchema,
  scenes: z.array(sceneSchema).min(3).max(12),
  sources: sourcesSchema,
});

export type VideoManifest = z.infer<typeof videoSchema>;
export type VideoScene = z.infer<typeof sceneSchema>;

export const getDurationInFrames = (manifest: VideoManifest) =>
  Math.round(manifest.scenes.reduce((total, scene) => total + scene.durationSeconds, 0) * manifest.format.fps);
