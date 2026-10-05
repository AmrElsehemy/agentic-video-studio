export type Alignment = {characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[]};
export type Narrator = {voiceId: string; ownerId: string; name: string; description?: string; accent?: string; gender?: string; age?: string; useCase?: string; previewUrl?: string; uses1y?: number};
type Fetch = (url: string, init?: any) => Promise<{ok: boolean; status: number; json(): Promise<any>; text(): Promise<string>}>;
export declare const DEFAULT_MODEL: string;
export declare const synthesize: (options: {apiKey: string; voiceId: string; text: string; model?: string; outputFormat?: string; voiceSettings?: object; previousText?: string; nextText?: string; fetchImpl?: Fetch}) => Promise<{audio: Buffer; alignment?: Alignment}>;
export declare const charactersToWords: (text: string, alignment?: Alignment) => {text: string; start: number; end: number}[] | undefined;
export declare const findNarrators: (options: {apiKey: string; search?: string; language?: string; pageSize?: number; minNoticeDays?: number; fetchImpl?: Fetch}) => Promise<Narrator[]>;
export declare const addLibraryVoice: (options: {apiKey: string; ownerId: string; voiceId: string; name: string; fetchImpl?: Fetch}) => Promise<string>;
