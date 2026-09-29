export type SoundCue = 'impact' | 'whoosh' | 'riser' | 'reveal' | 'chime';
export type SoundScene = {id?: string; beat?: string; role?: string; durationSeconds?: number};
export type SoundEvent = {sceneId?: string; index: number; time: number; cue: SoundCue; energy: number};
export declare const cueForScene: (scene?: SoundScene) => SoundCue;
export declare const sceneEnergy: (scene?: SoundScene) => number;
export declare const planSoundEvents: (scenes?: Required<Pick<SoundScene, 'durationSeconds'>>[] & SoundScene[]) => SoundEvent[];
