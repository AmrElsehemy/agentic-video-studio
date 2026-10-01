export declare const YOUTUBE_UPLOAD_SCOPE: string;
export declare const YOUTUBE_MANAGE_SCOPE: string;
export declare const YOUTUBE_ANALYTICS_SCOPE: string;
export declare const loadClient: (root: string) => {client_id: string; client_secret: string};
export declare const saveToken: (root: string, token: Record<string, unknown>) => void;
export declare const refreshAccessToken: (root: string, existing?: Record<string, any>) => Promise<Record<string, any>>;
export declare const getAccessToken: (root: string) => Promise<string>;
export declare const authorizeInteractively: (root: string, options?: {port?: number}) => Promise<Record<string, any>>;
export declare const youtubeMetadata: (manifest: any, options?: {privacy?: 'private' | 'unlisted' | 'public'; publishAt?: string; madeForKids?: boolean; categoryId?: string; alteredContent?: boolean; paidPromotion?: boolean}) => {
  snippet: {title: string; description: string; tags: string[]; categoryId: string; defaultLanguage: string};
  status: {privacyStatus: string; publishAt?: string; selfDeclaredMadeForKids?: boolean; containsSyntheticMedia?: boolean};
  paidProductPlacementDetails?: {hasPaidProductPlacement: boolean};
};
export declare const localDay: (date: Date, timeZone: string) => string;
export declare const zonedInstant: (day: string, time: string, timeZone: string) => Date;
export declare const nextReleaseSlot: (schedule: {time: string; timeZone: string}, taken?: (string | Date)[], options?: {now?: Date; leadMinutes?: number}) => Date;
export declare const listScheduledPublishTimes: (accessToken: string, options?: {now?: Date}) => Promise<string[]>;
export declare const findOrCreatePlaylist: (accessToken: string, title: string) => Promise<{id: string; created: boolean}>;
export declare const addToPlaylist: (accessToken: string, playlistId: string, videoId: string) => Promise<Record<string, any>>;
