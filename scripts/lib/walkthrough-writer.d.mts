type Complete = (prompt: {system: string; messages: {role: string; content: string}[]}) => Promise<string>;
export type Notes = {facts?: string[]; sources?: {label: string; url: string}[]};

export declare const notesSchema: import('zod').ZodType<{facts: string[]; sources: {label: string; url: string}[]}>;
export declare const scriptSchema: import('zod').ZodTypeAny;
export declare const sourceText: (spec: any, notes?: {facts: string[]}) => string;
export declare const unsupportedNumbers: (draft: {scenes: {id: string; headline?: string; narration?: string; caption?: string}[]}, spec: any, notes: {facts: string[]}) => string[];
export declare const buildWalkthroughPrompt: (input: {draft: any; notes?: {facts: string[]}; showId?: string}) => {system: string; user: string};
export declare const assembleWalkthrough: (script: any, draft: any, notes?: {facts: string[]; sources: {label: string; url: string}[]}) => any;
export declare const evaluateWalkthrough: (draft: any, context: {notes: {facts: string[]}; showId?: string}) => Promise<{problems: string[]; draft?: any; manifest?: any; audit?: any}>;
export declare const writeWalkthrough: (input: {draft: any; notes?: Notes; complete: Complete; critique?: Complete; direct?: Complete; showId?: string; maxAttempts?: number; onAttempt?: (attempt: any) => void}) => Promise<{
  draft: any;
  manifest: any;
  audit: {score: number; passed: boolean; checks: {label: string; passed: boolean; points: number}[]};
  review: {passed: boolean; score?: number; skipped?: boolean; criteria?: any[]};
  direction: {assigned: {id: string; why: string}[]; fallbacks: {id: string; reason: string}[]; modelError?: string};
  belowBar?: true;
}>;
