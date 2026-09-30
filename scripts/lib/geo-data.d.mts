export type Geometry = {type: 'Polygon'; coordinates: number[][][]} | {type: 'MultiPolygon'; coordinates: number[][][][]};
export type BBox = [number, number, number, number];
export type GeoEntity = {id: string; kind: string; name: string; iso3?: string | null; wikidata?: string | null; bbox: BBox; crossesAntimeridian?: true; label?: [number, number]; layer: 'countries' | 'water'; review?: {disputed: string; name: string; note: string | null}[]};
type Feature = {type: 'Feature'; id?: string; properties: Record<string, unknown>; geometry: Geometry};
type Collection = {type: 'FeatureCollection'; features: Feature[]};

export declare const NATURAL_EARTH: {name: string; version: string; license: string; licenseUrl: string; attribution: string; baseUrl: string; layers: Record<'countries' | 'water' | 'disputed', {file: string; sha256: string}>};
export declare const sha256: (data: string | Uint8Array) => string;
export declare const roundGeometry: (geometry: Geometry, decimals: number) => Geometry;
export declare const bboxOf: (geometry: Geometry) => BBox;
export declare const crossesAntimeridian: (bbox: BBox) => boolean;
export declare const slug: (text: string) => string;
export declare const slimCountries: (source: Collection) => Collection;
export declare const slimWater: (source: Collection) => Collection;
export declare const slimDisputed: (source: Collection) => Collection;
export declare const buildEntities: (layers: {countries: Collection; water: Collection; disputed: Collection}) => GeoEntity[];
export declare const serialize: (value: unknown) => string;
