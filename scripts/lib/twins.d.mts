type TwinSide = {episodeId: string; paletteMode: 'light' | 'dark'; publishedAt?: string; views?: number; averageViewPercent?: number};
export type TwinPair = {topic: string; original: TwinSide; twin: TwinSide; daysApart?: number};
export declare const twinProblems: (manifest: any, twin: any) => string[];
export declare const twinPairs: (rows: any[]) => TwinPair[];
