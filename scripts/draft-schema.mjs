import {z} from 'zod';
import {archSpecSchema} from './diagram-arch-schema.mjs';
import {diagramSpecSchema} from './diagram-schema.mjs';
import {archetypes} from './archetypes.mjs';
import {primitiveSchema} from './primitive-schema.mjs';
import {fontsSchema, wordmarkSchema} from './show-schema.mjs';
import {relatedSchema, subjectSchema, upgradeLegacySubject} from './subject-schema.mjs';
import {idSchema, paletteSchema, pitchLine, rightsSchema, sceneText, sourcesSchema, TARGET_EMOTIONS, VOICE_PROVIDERS, voiceSettings} from './episode-fields.mjs';
// Any archetype defined in archetypes/<name>.json.
const storyPattern = z.string().regex(/^[a-z0-9-]+$/, 'Expected a lowercase archetype name, e.g. "mystery"').superRefine((name, context) => {
  if (!Object.hasOwn(archetypes, name)) context.addIssue({code: 'custom', message: `Unknown story archetype "${name}". Supported: ${Object.keys(archetypes).join(', ')}`});
});

// Drafts with the old Pokémon-only subject (index, evolutions) are upgraded on read.
export const episodeDraftSchema = z.preprocess(upgradeLegacySubject, z.object({
  id: idSchema,
  title: z.string().min(1).max(120),
  storyPattern,
  numberRelevant: z.boolean().default(false),
  premise: pitchLine,
  audiencePromise: pitchLine,
  openLoop: pitchLine,
  payoff: pitchLine,
  targetEmotion: z.enum(TARGET_EMOTIONS).default('surprise'),
  engagementQuestion: pitchLine,
  targetSecondsBetweenVisualChanges: z.number().positive().max(1.5).optional(),
  // Overrides for the show profile's identity and branding (shows/<id>.json).
  show: z.object({
    id: idSchema.optional(),
    name: z.string().min(1).optional(),
    handle: z.string().startsWith('@').optional(),
    wordmark: wordmarkSchema.optional(),
    fonts: fontsSchema.optional(),
  }).optional(),
  subject: subjectSchema,
  // Other subjects the episode shows: evolutions, forms, rivals. The first is the before/after partner.
  related: z.array(relatedSchema).max(3).optional(),
  palette: paletteSchema.optional(),
  // An architecture diagram that builds up across the episode (#120): what exists; scenes' diagram primitives say what appears when.
  // An existing architecture picture replayed as is (theme "architecture"), or a spec laid out for the episode.
  diagram: z.union([archSpecSchema, diagramSpecSchema]).optional(),
  // 9:16 for Shorts (the default), or 16:9 for architecture walkthroughs and long-form.
  format: z.enum(['vertical', 'landscape']).optional(),
  // A palette named in the show profile's paletteVariants, e.g. "light" (#92).
  paletteVariant: z.string().regex(/^[a-z0-9-]+$/).optional(),
  // The episode this one retells with a different palette, so the two can be compared (#92).
  twinOf: idSchema.optional(),
  musicVolume: z.number().min(0).max(1).optional(),
  voice: z.object({
    // An episode can be read by another provider than its show's (#102), e.g. to try ElevenLabs on new episodes.
    provider: z.enum(VOICE_PROVIDERS).optional(),
    model: voiceSettings.model.optional(),
    // An OpenAI voice name or an ElevenLabs voice id; checked against the provider when compiled.
    voice: z.string().min(1).optional(),
    speed: voiceSettings.speed.optional(),
    instructions: voiceSettings.instructions.optional(),
  }).optional(),
  rights: rightsSchema,
  scenes: z.array(z.object({
    id: idSchema,
    // Optional beat from the archetype; untagged scenes are placed in order.
    beat: z.string().regex(/^[a-z0-9-]+$/).optional(),
    ...sceneText,
    beatEverySeconds: z.number().positive().max(1.5).optional(),
    // A semantic visual (counter, meter, ...) chosen by the Visual Director; the beat's shot is the fallback.
    primitive: primitiveSchema.optional(),
  })).min(3).max(12),
  sources: sourcesSchema,
}));
