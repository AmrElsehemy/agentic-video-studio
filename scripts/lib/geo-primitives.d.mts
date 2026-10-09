import type {GeoMapPrimitive} from '../primitive-schema.mjs';
import type {GeoEntity} from './geo-data.mjs';

export type GeoData = {entities: Map<string, GeoEntity>; disputed: Set<string>; manifest: {source: {name: string; version: string; licenseUrl: string; attribution: string}}; streets?: {licenseUrl: string; attribution: string; cities: Record<string, {name: string; center: [number, number]; radiusKm: number; box?: [number, number, number, number]}>}};
export declare const loadGeoData: (root?: string) => GeoData;
export declare const geoReferences: (primitive: GeoMapPrimitive) => [string, string][];
export declare const geoProblems: (primitive: GeoMapPrimitive, data: Pick<GeoData, 'entities' | 'disputed'>) => string[];
export declare const trueSizeProblems: (primitive: any, geo: any) => string[];
export declare const reconstructionProblems: (primitive: any, geo: any) => string[];
export declare const plateRightsAsset: (geo: any) => {kind: string; sourceUrl: string; owner: string; licenseStatus: string; publicReleaseApproved: boolean; notes: string};
export declare const geoRightsAsset: (data: Pick<GeoData, 'manifest'>) => {kind: string; sourceUrl: string; owner: string; licenseStatus: 'public-domain'; publicReleaseApproved: true; notes: string};
export declare const streetsProblems: (primitive: any, geo: any) => string[];
export declare const osmRightsAsset: (geo: any) => {kind: string; sourceUrl: string; owner: string; licenseStatus: string; publicReleaseApproved: boolean; notes: string};
