import type {GeoEntity} from './geo-data.mjs';

export type PlaceResolution =
  | {status: 'resolved'; id: string; entity: GeoEntity; review?: GeoEntity['review']}
  | {status: 'ambiguous'; candidates: {id: string; name: string}[]}
  | {status: 'unknown'; suggestions: {id: string; name: string}[]};
export declare const placeKey: (name: string) => string;
export declare const buildPlaceIndex: (entities: Map<string, GeoEntity>) => Map<string, string[]>;
export declare const resolvePlace: (name: string, options: {entities: Map<string, GeoEntity>; index?: Map<string, string[]>}) => PlaceResolution;
export declare const resolvePlaces: (names: string[], geo: {entities: Map<string, GeoEntity>}) => {resolved: Map<string, Extract<PlaceResolution, {status: 'resolved'}>>; problems: string[]};
