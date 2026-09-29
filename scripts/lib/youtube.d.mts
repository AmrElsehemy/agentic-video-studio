export declare const YOUTUBE_UPLOAD_SCOPE: string;
export declare const loadClient: (root: string) => {client_id: string; client_secret: string};
export declare const saveToken: (root: string, token: Record<string, unknown>) => void;
export declare const refreshAccessToken: (root: string, existing?: Record<string, any>) => Promise<Record<string, any>>;
export declare const getAccessToken: (root: string) => Promise<string>;
export declare const authorizeInteractively: (root: string, options?: {port?: number}) => Promise<Record<string, any>>;
export declare const youtubeMetadata: (manifest: any, options?: {privacy?: 'private' | 'unlisted' | 'public'; publishAt?: string; madeForKids?: boolean}) => {
  snippet: {title: string; description: string; tags: string[]; categoryId: string; defaultLanguage: string};
  status: {privacyStatus: string; publishAt?: string; selfDeclaredMadeForKids?: boolean};
};
