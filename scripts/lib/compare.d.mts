export const MIN_GROUP: number;
export function viewsAtAge(history: {capturedAt: string; videos: Record<string, {views: number}>}[], videoId: string, publishedAt: string, ageDays: number): number | undefined;
export function compareByTag(rows: {episodeId: string; videoId: string; publishedAt: string; views: number; likes: number; tags: string[]}[], options?: {now?: Date; minAgeDays?: number; history?: {capturedAt: string; videos: Record<string, {views: number}>}[]; matchAge?: number}): {
  episodes: number;
  metric: string;
  groups: {tag: string; with: {n: number; medianRate?: number; medianLikeRate?: number; episodes: string[]}; without: {n: number; medianRate?: number; medianLikeRate?: number; episodes: string[]}; readable: boolean; ratio?: number}[];
};
export function appendHistory<T extends {capturedAt: string}>(history: T[], entry: T): T[];
