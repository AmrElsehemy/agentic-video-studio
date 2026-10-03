// Show profiles (shows/<id>.json): everything that makes a show look and
// sound like itself. The compiler merges a show's defaults under each draft
// and embeds the result in the manifest, so the renderer and audio read
// branding only from the manifest.
import {z} from 'zod';
import {reviewSchema} from './episode-fields.mjs';

/** Fonts the renderer can load (Google Fonts bundled with Remotion). */
export const DISPLAY_FONTS = ['Bebas Neue', 'Anton', 'Oswald', 'Archivo Black', 'Bangers'];
export const BODY_FONTS = ['system', 'Inter', 'Montserrat', 'Poppins'];

const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a six-digit hex color');
const voiceName = z.enum(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);

/** The wordmark in the corner of every scene and on the cover: lead text, then an accent-coloured part. */
export const wordmarkSchema = z.object({lead: z.string().min(1).max(24), accent: z.string().max(24).default('')}).strict();
export const fontsSchema = z.object({display: z.enum(DISPLAY_FONTS), body: z.enum(BODY_FONTS).default('system')}).strict();
/** How scenes caption their narration: one static line, or the words as they are spoken (#86). */
export const captionsSchema = z.object({mode: z.enum(['static', 'words'])}).strict();
/** The generated music bed: tempo and a repeating bass line (Hz). */
export const musicBedSchema = z.object({bpm: z.number().min(60).max(180), notes: z.array(z.number().min(30).max(1000)).min(1).max(16)}).strict();

export const showSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  handle: z.string().startsWith('@'),
  /** One line the agents are told about the show, e.g. "a vertical short-form video series about Pokémon". */
  description: z.string().min(1).max(200),
  wordmark: wordmarkSchema,
  fonts: fontsSchema,
  palette: z.object({background: color, surface: color, primary: color, secondary: color, ink: color}).strict(),
  music: musicBedSchema.extend({volume: z.number().min(0).max(1).default(0.09)}).strict(),
  voice: z.object({voice: voiceName, speed: z.number().min(0.25).max(4), model: z.string().min(1).default('gpt-4o-mini-tts'), instructions: z.string().min(1).max(1000)}).strict(),
  notices: z.object({ownership: z.string().min(1), nonAffiliation: z.string().min(1)}).strict(),
  /** What an upload carries: hashtags at the end of the description, and the video's tags. */
  publishing: z.object({
    hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u, 'A hashtag is # and one word, e.g. "#Geography"')).min(1).max(5),
    tags: z.array(z.string().min(1).max(40)).min(1).max(20),
  }).strict().optional(),
  /** Rules for the show's subjects, e.g. PokePulses identifiers are Pokédex numbers like "#001". */
  subjects: z.object({
    identifierLabel: z.string().min(1).max(40),
    identifierPattern: z.string().min(1).refine((pattern) => { try { new RegExp(pattern); return true; } catch { return false; } }, 'Expected a valid regular expression'),
  }).strict().optional(),
  /**
   * A recorded legal review allowing the show's subject artwork to be published
   * without a licence. New episodes copy it into rights.artworkReview and mark
   * their artwork 'permission-required' and approved; each episode still needs
   * its own release approval.
   */
  artworkClearance: reviewSchema.optional(),
  /** Caption style; without it scenes show one static caption line. */
  captions: captionsSchema.optional(),
  /** Story shapes (archetypes/<name>.json) this show uses. */
  archetypes: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
}).strict();
