import type {Feature, FeatureCollection, MultiPolygon} from 'geojson';

export const CELL: number;
export const WIDTH: number;
export const HEIGHT: number;
export const LEVELS_KM: number[];
export const SEA_SEEDS: [number, number][];
export const haversineKm: (lon1: number, lat1: number, lon2: number, lat2: number) => number;
export const landMask: (countries: FeatureCollection) => Uint8Array;
export const openSea: (mask: Uint8Array) => Uint8Array;
export const distanceGrid: (sea: Uint8Array) => Float32Array;
export const coastDistanceKm: (grid: Float32Array, point: [number, number]) => number;
export const bandPolygons: (distance: Float32Array) => (Feature<MultiPolygon, {km: number}>)[];
export const farthest: (distance: Float32Array, box?: [number, number, number, number]) => {km: number; lon: number; lat: number};
