export type DexStats = {hp: number; attack: number; defense: number; spAtk: number; spDef: number; speed: number};

export type DexRow = {
  id: number;
  slug: string;
  name: string;
  types: string[];
  pastTypes: {until: string; types: string[]}[];
  stats: DexStats;
  height: number;
  weight: number;
  baseExp: number;
  captureRate: number;
  hatchCounter: number;
  legendary: boolean;
  mythical: boolean;
  baby: boolean;
  evolvesFrom: number | null;
  artworkUrl: string;
};

export type DexTable = {source: string; fetchedAt: string; sha256?: string; pokemon: DexRow[]; [key: string]: unknown};

export type RaceSpec = {region: string; group: string; direction: string; metric: string};

export type ScoredRace = RaceSpec & {id: string; pool: number; winner: string; runnerUp: string; value: number; runnerUpValue: number; score: number; why: string[]};

export type RaceHeadline = {from: number; to: number; kicker?: string; text: string; tone?: 'hero' | 'twist'};

export type RaceManifest = {
  schemaVersion: 1;
  id: string;
  format: 'ranked-race';
  show: string;
  race: RaceSpec & {score: number; why: string[]};
  source: {name: string; fetchedAt: string; sha256: string};
  metric: {id: string; label: string; unit: string; scale: number; decimals: number};
  racers: {id: number; name: string; value: number; total: number; artworkUrl: string; hero: boolean}[];
  order: {initial: number[]; final: number[]; initialLabel: string; finalLabel: string};
  counter: {frame: number; value: number}[];
  timeline: {sortStart: number; sortEnd: number; payoff: number; question: number; end: number};
  headlines: RaceHeadline[];
  question: {prompt: string; options: {id: number; label: string; sub: string}[]};
  music: {score: string};
  caption: string;
};

export const FPS: number;
export const MAX_RACERS: number;
export const MIN_POOL: number;
export const METRICS: Record<string, {label: string; unit: string; battle: boolean; scale?: number; decimals?: number; get: (row: DexRow) => number; ask: {top: string; bottom: string}}>;
export const REGIONS: Record<string, {label: string; has: (row: DexRow) => boolean}>;
export const GROUPS: Record<string, {label: string; has: (row: DexRow, stage: {stage: number; final: boolean}) => boolean}>;
export const RACE_SCORES: {top: string[]; bottom: string[]};
export function pickScore(id: string, direction: string): string;
export function tableChecksum(table: Record<string, unknown>): string;
export function dexRow(pokemon: unknown, species: unknown): DexRow;
export function total(row: DexRow): number;
export function display(metricId: string, value: number): string;
export function stagesIn(rows: DexRow[]): Map<number, {stage: number; final: boolean}>;
export function candidateId(spec: RaceSpec): string;
export function parseCandidateId(id: string): RaceSpec;
export function poolOf(rows: DexRow[], spec: RaceSpec): DexRow[];
export function scoreRace(rows: DexRow[], spec: RaceSpec): ScoredRace | null;
export function allRaces(rows: DexRow[]): ScoredRace[];
export function shortlist<T extends Pick<ScoredRace, 'region' | 'group' | 'direction' | 'metric' | 'winner' | 'score'>>(races: T[], options?: {minScore?: number; perWinner?: number; perGroup?: number}): T[];
export function buildRace(table: DexTable, spec: RaceSpec): RaceManifest;
export function checkRace(table: DexTable, manifest: RaceManifest): string[];
export function raceBeats(manifest: RaceManifest): {id: string; role: string; durationSeconds: number}[];
