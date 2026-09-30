import type {GeoMapPrimitive} from '../primitive-schema.mjs';
import type {GeoResearch} from '../geo-research-schema.mjs';
import type {GeoEntity} from './geo-data.mjs';

type Geo = {entities: Map<string, GeoEntity>; disputed: Set<string>; manifest: unknown};
type Complete = (prompt: {system: string; messages: {role: string; content: string}[]}) => Promise<string>;
type Place = GeoEntity | {id: string; kind: 'disputed'; name: string};
export type BordersReview = {id: string; name: string; areas: NonNullable<GeoEntity['review']>};

export declare const POINT_SPAN: [number, number];
export declare const textNumbers: (text: string) => number[];
export declare const geoResearchNumbers: (research: GeoResearch) => Set<number>;
export declare const resolveResearchPlaces: (research: GeoResearch, geo: Geo) => {subjectId: string; places: Map<string, Place>; review: BordersReview[]};
export declare const shotToPrimitive: (shot: unknown, context: {places: Map<string, Place>; research: GeoResearch}) => GeoMapPrimitive;
export declare const defaultShot: (subject: {id: string; name: string}) => GeoMapPrimitive;
export declare const buildGeoDirectorPrompt: (input: {draft: any; research: GeoResearch; places: Map<string, Place>}) => {system: string; messages: {role: 'user'; content: string}[]};
export declare const directGeoVisuals: (input: {draft: any; research: unknown; complete?: Complete; showId?: string; geo?: Geo}) => Promise<{
  draft: any;
  manifest: any;
  assigned: {id: string; why: string}[];
  fallbacks: {id: string; reason: string}[];
  review: BordersReview[];
  modelError?: string;
}>;
