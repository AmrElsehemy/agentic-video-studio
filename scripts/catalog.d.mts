export function findManifest(episodeId: string): {
  root: string;
  manifestPath: string;
};
export function episodeIds(): string[];
export function resolveEpisodeId(value: string, ids?: string[]): string;
