import {z} from 'zod';
import {archetypes} from './archetypes.mjs';
import {primitiveSchema} from './primitive-schema.mjs';
import {fontsSchema, wordmarkSchema} from './show-schema.mjs';
import {relatedSchema, subjectSchema, upgradeLegacySubject} from './subject-schema.mjs';

const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a six-digit hex color');
// Any archetype defined in archetypes/<name>.json.
const storyPattern = z.string().regex(/^[a-z0-9-]+$/, 'Expected a lowercase archetype name, e.g. "mystery"').superRefine((name, context) => {
  if (!Object.hasOwn(archetypes, name)) context.addIssue({code: 'custom', message: `Unknown story archetype "${name}". Supported: ${Object.keys(archetypes).join(', ')}`});
});

// Drafts with the old Pokémon-only subject (index, evolutions) are upgraded on read.
export const episodeDraftSchema = z.preprocess(upgradeLegacySubject, z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(120),
  storyPattern,
  numberRelevant: z.boolean().default(false),
  premise: z.string().min(1).max(140),
  audiencePromise: z.string().min(1).max(140),
  openLoop: z.string().min(1).max(140),
  payoff: z.string().min(1).max(140),
  targetEmotion: z.enum(['curiosity', 'surprise', 'debate', 'awe']).default('surprise'),
  engagementQuestion: z.string().min(1).max(140),
  targetSecondsBetweenVisualChanges: z.number().positive().max(1.5).optional(),
  // Overrides for the show profile's identity and branding (shows/<id>.json).
  show: z.object({
    id: z.string().regex(/^[a-z0-9-]+$/).optional(),
    name: z.string().min(1).optional(),
    handle: z.string().startsWith('@').optional(),
    wordmark: wordmarkSchema.optional(),
    fonts: fontsSchema.optional(),
  }).optional(),
  subject: subjectSchema,
  // Other subjects the episode shows: evolutions, forms, rivals. The first is the before/after partner.
  related: z.array(relatedSchema).max(3).optional(),
  palette: z.object({background: color, surface: color, primary: color, secondary: color, ink: color}).optional(),
  musicVolume: z.number().min(0).max(1).optional(),
  voice: z.object({
    model: z.string().min(1).optional(),
    voice: z.enum(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']).optional(),
    speed: z.number().min(0.25).max(4).optional(),
    instructions: z.string().min(1).max(1000).optional(),
  }).optional(),
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
  scenes: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    // Optional beat from the archetype; untagged scenes are placed in order.
    beat: z.string().regex(/^[a-z0-9-]+$/).optional(),
    eyebrow: z.string().max(40).optional(),
    headline: z.string().min(1).max(70),
    narration: z.string().min(1).max(260),
    caption: z.string().min(1).max(120),
    artworkUrl: z.string().url().optional(),
    facts: z.array(z.string().min(1).max(45)).max(4).optional(),
    accent: color.optional(),
    beatEverySeconds: z.number().positive().max(1.5).optional(),
    // A semantic visual (counter, meter, ...) chosen by the Visual Director; the beat's shot is the fallback.
    primitive: primitiveSchema.optional(),
  })).min(3).max(12),
  sources: z.array(z.object({label: z.string().min(1), url: z.string().url()})).min(1),
}));
