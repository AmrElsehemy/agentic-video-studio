import type {EpisodeAnalytics, RetentionPoint, Snapshot} from '../analytics-schema.mjs';

export type EpisodeFeatures = {storyPattern: string; hookHeadline: string; hookSeconds: number; totalSeconds: number; scenes: number; primitives: number; auditScore: number; paletteMode: 'light' | 'dark'};
export type ReportRow = EpisodeFeatures & {
  episodeId: string;
  show: string;
  url: string;
  topic: string;
  publishedAt?: string;
  /** Estimated dollars to make the episode, from its production log (#89). */
  cost?: number;
  snapshot?: {capturedAt: string; views: number; averageViewPercent?: number; averageViewSeconds?: number; hookHold?: number; engagementRate?: number; costPerThousandViews?: number};
};
export declare const analyticsPath: (root: string, showId: string, episodeId: string) => string;
export declare const youtubeVideoId: (value: string) => string;
export declare const readAnalytics: (file: string) => EpisodeAnalytics | undefined;
export declare const writeAnalytics: (file: string, record: EpisodeAnalytics) => void;
export declare const linkVideo: (existing: EpisodeAnalytics | undefined, options: {episodeId: string; video: string; publishedAt?: string}) => EpisodeAnalytics;
export declare const addSnapshot: (record: EpisodeAnalytics, snapshot: Partial<Snapshot> & {capturedAt: string; source: Snapshot['source']; views: number}) => EpisodeAnalytics;
export declare const fetchYouTubeSnapshot: (options: {videoId: string; accessToken: string; startDate: string; now?: Date; fetchImpl?: typeof fetch}) => Promise<Snapshot>;
export declare const watchingAt: (retention: RetentionPoint[] | undefined, at: number) => number | undefined;
export declare const episodeFeatures: (manifest: any) => EpisodeFeatures;
export declare const correlation: (xs: number[], ys: number[]) => number | undefined;
export declare const MIN_EPISODES_FOR_TRENDS: number;
export declare const costPerThousandViews: (cost: number | null | undefined, views: number | undefined) => number | undefined;
export type PaletteGroup = {episodes: number; measured: number; averageViewPercent?: number; views?: number; confounders: {episodeId: string; topic: string; publishedAt?: string}[]};
export declare const byPaletteMode: (rows: ReportRow[]) => Record<'dark' | 'light', PaletteGroup>;
export declare const buildReport: (entries: {manifest: any; analytics: EpisodeAnalytics; cost?: number | null}[]) => {rows: ReportRow[]; measured: number; trends?: Record<string, number | undefined>; byPalette: Record<'dark' | 'light', PaletteGroup>};
