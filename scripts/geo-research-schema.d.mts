import type {z} from 'zod';

export declare const geoClaimSchema: z.ZodType<{id: string; text: string; tier: 'official' | 'trusted_secondary' | 'community'; sources: string[]; note?: string}>;
export declare const geoPlaceSchema: z.ZodType<GeoPlace>;
export type GeoPlace = {lon: number; lat: number; source: string; approximate?: boolean; note?: string};
export type GeoResearch = {
  schemaVersion: 1;
  id: string;
  subject: string;
  kind: 'curated' | 'generated';
  note?: string;
  regions: string[];
  claims: {id: string; text: string; tier: 'official' | 'trusted_secondary' | 'community'; sources: string[]; note?: string}[];
  places: Record<string, GeoPlace>;
  sources: Record<string, {label: string; url: string}>;
};
export declare const geoResearchSchema: z.ZodType<GeoResearch, unknown>;
