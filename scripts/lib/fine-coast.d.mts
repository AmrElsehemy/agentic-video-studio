export declare const FINE_COAST: {
  name: string; version: string; license: string; licenseUrl: string; sourceUrl: string; sha256: string; attribution: string; tile: number; margin: number;
  levels: Record<'h' | 'f', {folder: string; file: string; tolerance: number; decimals: number; maxSpan: number}>;
};
export declare const simplify: (points: number[][], tolerance: number) => number[][];
export declare const clipRect: (ring: number[][], box: [number, number, number, number]) => number[][];
export declare const tileKey: (lon: number, lat: number, size?: number) => string;
export declare const sliceRing: (ring: number[][], options?: {size?: number; margin?: number}) => Map<string, number[][][]>;
export declare const flatten: (ring: number[][], decimals: number) => number[];
export declare const buildTiles: (polygons: {rings: number[][][]}[], options: {tolerance: number; decimals: number; size?: number; margin?: number}) => Map<string, number[][]>;
