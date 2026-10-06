export type ActionTime = {start: number; end: number; until?: number};
export declare const DEFAULT_DUR: Record<string, number>;
export declare const WORD_LEAD: number;
export declare const NOTEBOOK_DUR: Record<string, number>;
export declare const actionDur: (action: {do: string; anim?: string; dur?: number}, theme?: string) => number;
export declare const resolveActions: (actions: unknown[], options: {words: {text: string; start: number; end: number}[]; duration: number; theme?: string}) => ActionTime[];
export declare const withDiagramTimes: <M>(manifest: M, speech?: Record<string, unknown>) => M;
