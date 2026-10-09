export type SoundCue = 'impact' | 'whoosh' | 'riser' | 'reveal' | 'chime' | 'pop' | 'swell' | 'trace' | 'sweep' | 'tick' | 'rise' | 'travel';
export type SoundScene = {id?: string; beat?: string; role?: string; durationSeconds?: number; primitive?: {kind?: string; [key: string]: any}};
export type SoundEvent = {sceneId?: string; index: number; time: number; cue: SoundCue; energy: number};
export declare const cueForScene: (scene?: SoundScene) => SoundCue;
export declare const sceneEnergy: (scene?: SoundScene) => number;
export declare const planSoundEvents: (scenes?: Required<Pick<SoundScene, 'durationSeconds'>>[] & SoundScene[]) => SoundEvent[];
export declare const MAP_CUE_SPACING: number;
export declare const MAP_CUES_PER_SCENE: number;
export declare const planMapSoundEvents: (scenes?: Required<Pick<SoundScene, 'durationSeconds'>>[] & SoundScene[]) => SoundEvent[];
