import {z} from 'zod';

const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a six-digit hex color');
const storyPattern = z.enum(['profile', 'mechanic', 'transformation', 'mystery', 'comparison']);

export const episodeDraftSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(120),
  storyPattern,
  premise: z.string().min(1).max(140),
  audiencePromise: z.string().min(1).max(140),
  openLoop: z.string().min(1).max(140),
  payoff: z.string().min(1).max(140),
  targetEmotion: z.enum(['curiosity', 'surprise', 'debate', 'awe']).default('surprise'),
  engagementQuestion: z.string().min(1).max(140),
  targetSecondsBetweenVisualChanges: z.number().positive().max(1.5).optional(),
  show: z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    handle: z.string().startsWith('@'),
  }).optional(),
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
  })).max(3).optional(),
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
    eyebrow: z.string().max(40).optional(),
    headline: z.string().min(1).max(70),
    narration: z.string().min(1).max(260),
    caption: z.string().min(1).max(120),
    facts: z.array(z.string().min(1).max(45)).max(4).optional(),
    accent: color.optional(),
    beatEverySeconds: z.number().positive().max(1.5).optional(),
  })).length(6),
  sources: z.array(z.object({label: z.string().min(1), url: z.string().url()})).min(1),
});
