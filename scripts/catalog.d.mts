export type DraftEntry = {id: string; showId: string; draftPath: string};
export declare const repoRoot: string;
export declare function listManifests(videosDir?: string): string[];
export declare function findManifest(episodeId: string, videosDir?: string): {root: string; manifestPath: string};
export declare function listDrafts(draftsDir?: string): DraftEntry[];
export declare function findDraft(episodeId: string, draftsDir?: string): DraftEntry | undefined;
export declare function episodeIds(): string[];
export declare function resolveEpisodeId(value: string, ids?: string[]): string;
