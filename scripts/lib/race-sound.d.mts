import type {RaceManifest} from './dex.mjs';

export type RaceCue = {cue: 'stop' | 'win' | 'riser' | 'whoosh' | 'chime'; time: number; end?: number; step?: number; count?: number};

export const RATE: number;
export function counterAt(counter: RaceManifest['counter'], frame: number): number;
export function stopFrame(counter: RaceManifest['counter'], value: number): number;
export function raceCues(manifest: RaceManifest): RaceCue[];
export function renderRaceSfx(manifest: RaceManifest, scoreName: string): Float32Array;
export function writeRaceSfx(options: {root: string; audioId: string; manifest: RaceManifest; scoreName: string}): string;
