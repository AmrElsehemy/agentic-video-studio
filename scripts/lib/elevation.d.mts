import type {Feature, MultiPolygon} from 'geojson';

export const ETOPO: {name: string; publisher: string; doi: string; license: string; url: string};
export const STEP: number;
export const CELL: number;
export const WIDTH: number;
export const HEIGHT: number;
export const ELEVATION_LEVELS: number[];
export const FLOOD_LEVELS: number[];
export const parseDods: (buffer: Buffer) => Float32Array;
export const simplify: (points: [number, number][], tolerance: number) => [number, number][];
export const floodFrom: (grid: ArrayLike<number>, level: number, seeds?: [number, number][]) => Uint8Array;
export const elevationBands: (grid: ArrayLike<number>) => Feature<MultiPolygon, {metres: number}>[];
export const floodBands: (grid: ArrayLike<number>) => Feature<MultiPolygon, {metres: number}>[];
export const elevationAt: (grid: ArrayLike<number>, point: [number, number]) => number;
export const cellAreaKm2: (row: number) => number;
