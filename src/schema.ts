import {z} from 'zod';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {archSpecSchema} from '../scripts/diagram-arch-schema.mjs';
import {diagramSpecSchema} from '../scripts/diagram-schema.mjs';
import {captionsSchema, fontsSchema, musicBedSchema, wordmarkSchema} from '../scripts/show-schema.mjs';
import {relatedSchema, subjectSchema} from '../scripts/subject-schema.mjs';
import {idSchema, paletteSchema, pitchLine, rightsSchema, sceneText, sourcesSchema, TARGET_EMOTIONS, VOICE_PROVIDERS, voiceProblems, voiceSettings} from '../scripts/episode-fields.mjs';

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
  // Word-synced captions (#86): added at render time from the narration track, never stored in the manifest.
  words: z.array(z.object({text: z.string(), start: z.number(), end: z.number()})).optional(),
  // When each diagram action happens, in seconds from the scene start (#125): set in the render props.
  diagramTimes: z.array(z.object({start: z.number(), end: z.number(), until: z.number().optional()})).optional(),
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
    captions: captionsSchema.optional(),
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
  format: z.union([z.object({width: z.literal(1080), height: z.literal(1920), fps: z.literal(30)}), z.object({width: z.literal(1920), height: z.literal(1080), fps: z.literal(30)})]),
  palette: paletteSchema,
  // An architecture diagram (#120) with its layout, computed when the episode was compiled.
  diagram: z.object({
    spec: z.union([archSpecSchema, diagramSpecSchema]),
    layout: z.object({
      width: z.number(),
      height: z.number(),
      nodes: z.record(z.string(), z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number(), rank: z.number(), cx: z.number().optional(), cy: z.number().optional(), r: z.number().optional()})),
      edges: z.record(z.string(), z.object({points: z.array(z.tuple([z.number(), z.number()])), labelAt: z.tuple([z.number(), z.number()]).optional(), d: z.string().optional()})),
      groups: z.record(z.string(), z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()})),
      titleAt: z.tuple([z.number(), z.number()]).optional(),
    }),
  }).optional(),
  // The episode this one retells with a different palette (#92).
  twinOf: idSchema.optional(),
  audio: z.object({
    voiceover: z.string().optional(),
    voice: z.object({
      provider: z.enum(VOICE_PROVIDERS),
      ...voiceSettings,
      voice: z.string().min(1),
      speed: voiceSettings.speed.default(1),
      output: z.string().min(1),
    }).superRefine((voice, context) => voiceProblems(voice).forEach((message) => context.addIssue({code: 'custom', path: ['voice'], message}))).optional(),
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
type EpisodeDiagram = NonNullable<VideoManifest['diagram']>;
/** A diagram the compiler laid out (the clean and notebook themes), as opposed to an architecture picture kept as drawn. */
export type LaidOutDiagram = EpisodeDiagram & {spec: Exclude<EpisodeDiagram['spec'], {theme: 'architecture'}>};
/** An existing architecture picture (#120), replayed with its own coordinates. */
export type ArchitectureDiagram = EpisodeDiagram & {spec: Extract<EpisodeDiagram['spec'], {theme: 'architecture'}>};
/** The manifest's diagram, for the renderers of laid-out themes (CompiledEpisodeScene routes architecture diagrams elsewhere). */
export const laidOut = (manifest: VideoManifest) => manifest.diagram as LaidOutDiagram;
export type VideoScene = z.infer<typeof sceneSchema>;

export const getDurationInFrames = (manifest: VideoManifest) =>
  Math.round(manifest.scenes.reduce((total, scene) => total + scene.durationSeconds, 0) * manifest.format.fps);
