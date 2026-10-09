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
export type ResolvedDataset = {label: string; unit?: string; values: {entity: string; value: number}[]};
export declare const mentionedPlaces: (text: string, geo: Geo) => GeoEntity[];
export declare const sceneMentions: (scene: {headline?: string; narration?: string; caption?: string}, places: Map<string, Place>, geo: Geo) => GeoEntity[];
export declare const shotShows: (primitive: GeoMapPrimitive, place: {id: string; bbox: [number, number, number, number]}, boxes: Map<string, [number, number, number, number]>) => boolean;
export declare const builtinDatasets: (places: Map<string, Place>) => Map<string, ResolvedDataset>;
export declare const offFramePlaces: (primitive: GeoMapPrimitive, places: Map<string, any>, boxes: Map<string, [number, number, number, number]>) => any[];
export declare const addNearbyPlaces: (places: Map<string, Place>, subjectId: string, geo: Geo) => Map<string, Place>;
export declare const resolveResearchPlaces: (research: GeoResearch, geo: Geo) => {subjectId: string; places: Map<string, Place>; review: BordersReview[]; datasets: Map<string, ResolvedDataset>};
export declare const shotToPrimitive: (shot: unknown, context: {places: Map<string, Place>; research: GeoResearch; datasets?: Map<string, ResolvedDataset>; showId?: string}) => GeoMapPrimitive;
export declare const defaultShot: (subject: {id: string; name: string}) => GeoMapPrimitive;
export declare const buildGeoDirectorPrompt: (input: {draft: any; research: GeoResearch; places: Map<string, Place>; datasets?: Map<string, ResolvedDataset>; showId?: string}) => {system: string; messages: {role: 'user'; content: string}[]};
export declare const directGeoVisuals: (input: {draft: any; research: unknown; complete?: Complete; showId?: string; geo?: Geo; shotProblems?: (primitive: GeoMapPrimitive) => string[]}) => Promise<{
  draft: any;
  manifest: any;
  assigned: {id: string; why: string}[];
  fallbacks: {id: string; reason: string}[];
  review: BordersReview[];
  variety: {scenes: number; distinct: number; repeats: string[]; problems: string[]};
  unseenMentions: {id: string; places: string[]}[];
  offFrame: {id: string; places: string[]}[];
  modelError?: string;
}>;
