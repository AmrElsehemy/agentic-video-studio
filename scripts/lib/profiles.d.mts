export declare const EARTH_KM: number;
export declare const CELLS_PER_DEGREE: number;
export declare const MAX_CELLS: number;
export declare const PROFILE_SOURCE: {name: string; publisher: string; url: string; doi: string; license: string};
export declare const densify: (stops: [number, number][], stepKm?: number) => {points: [number, number][]; distances: number[]};
export type CellWindow = {row0: number; row1: number; col0: number; col1: number; columns: number; rows: number};
export declare const windowOf: (points: [number, number][]) => CellWindow;
export declare const heightAt: (grid: ArrayLike<number>, window: CellWindow, point: [number, number]) => number;
export declare const sampleProfile: (grid: ArrayLike<number>, window: CellWindow, dense: {points: [number, number][]; distances: number[]}, samples: number) => {distanceKm: number[]; elevationM: number[]; points: [number, number][]};
