// Published-episode performance (#25): analytics/<show>/<id>.json. One file per
// episode per platform; each snapshot is the numbers as they stood at one
// moment (24 h, 7 d…), so growth can be compared between episodes of the same age.
import {z} from 'zod';

const count = z.number().int().min(0);

/** Audience retention: the share of viewers still watching at each point of the video (0 = start, 1 = end). */
export const retentionPointSchema = z.object({at: z.number().min(0).max(1), watching: z.number().min(0).max(10)}).strict();

export const snapshotSchema = z.object({
  capturedAt: z.string().datetime({offset: true}),
  source: z.enum(['manual', 'youtube-analytics']),
  views: count,
  averageViewSeconds: z.number().min(0).optional(),
  averageViewPercent: z.number().min(0).max(1000).optional(),
  likes: count.optional(),
  comments: count.optional(),
  shares: count.optional(),
  subscribersGained: count.optional(),
  retention: z.array(retentionPointSchema).optional(),
}).strict();

export const episodeAnalyticsSchema = z.object({
  schemaVersion: z.literal(1),
  episodeId: z.string().regex(/^[a-z0-9-]+$/),
  platform: z.literal('youtube'),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'Expected an 11-character YouTube video id'),
  url: z.string().url(),
  publishedAt: z.string().datetime({offset: true}).optional(),
  snapshots: z.array(snapshotSchema).default([]),
}).strict();
