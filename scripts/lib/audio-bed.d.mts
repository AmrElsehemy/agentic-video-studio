type AudioManifest = {scenes: {id: string; durationSeconds: number}[]; audio: {bed?: {bpm: number; notes: number[]}}};
export declare const audioPlan: (manifest: AudioManifest) => {duration: number; sceneWindows: {start: number; end: number; energy: number}[]; soundEvents: {sceneId: string; index: number; time: number; cue: string; energy: number}[]};
export declare const writeAudioBed: (options: {root: string; episodeId: string; manifest: AudioManifest; log?: (line: string) => void}) => {musicOutput: string; sfxOutput: string; duration: number};
