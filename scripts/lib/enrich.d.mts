export const FIRST_REVEAL: number;
export const retimeReveals: <T extends {highlights: {at: number}[]; annotations: {at: number; until?: number}[]; data?: {at: number}}>(primitive: T) => T;
export const enrichDraft: (draft: any, options: {score: string; ambience: string; entities?: Map<string, any>}) => any;
