export declare const selectEpisodes: (options: {changedFiles: string[]; catalog: string[]; golden: string[]; full?: boolean}) => {episodes: string[]; frames: string[]; reason: string};
export declare const MAX_SHARDS: number;
export declare const toShards: (episodes: string[], maxShards?: number) => string[];
