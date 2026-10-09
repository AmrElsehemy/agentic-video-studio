export const OSM: {name: string; license: string; licenseUrl: string; attribution: string; overpass: string[]};
export const ROAD_CLASSES: string[];
export const TALL: number;
export const classesFor: (radiusKm: number) => string[];
export const withBuildings: (radiusKm: number) => boolean;
export const boxOf: (center: [number, number], radiusKm: number) => [number, number, number, number];
export const overpassQuery: (center: [number, number], radiusKm: number) => string;
export const compactStreets: (elements: unknown[]) => {roads: [number, number][][][]; rails: [number, number][][]; water: [number, number][][]; rivers: [number, number][][]; coast: [number, number][][]; buildings: [number, number][][]};
