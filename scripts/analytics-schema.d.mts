import type {z} from 'zod';

export type RetentionPoint = {at: number; watching: number};
export type Snapshot = {
  capturedAt: string;
  source: 'manual' | 'youtube-analytics';
  views: number;
  averageViewSeconds?: number;
  averageViewPercent?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  subscribersGained?: number;
  retention?: RetentionPoint[];
};
export type EpisodeAnalytics = {schemaVersion: 1; episodeId: string; platform: 'youtube'; videoId: string; url: string; publishedAt?: string; snapshots: Snapshot[]};
export declare const retentionPointSchema: z.ZodType<RetentionPoint>;
export declare const snapshotSchema: z.ZodType<Snapshot, unknown>;
export declare const episodeAnalyticsSchema: z.ZodType<EpisodeAnalytics, unknown>;
