import type {z} from 'zod';

export type PokemonTypeName = 'Normal' | 'Fire' | 'Water' | 'Grass' | 'Electric' | 'Ice' | 'Fighting' | 'Poison' | 'Ground' | 'Flying' | 'Psychic' | 'Bug' | 'Rock' | 'Ghost' | 'Dragon' | 'Dark' | 'Steel' | 'Fairy';

export type Primitive =
  | {kind: 'counter'; from: number; to: number; label: string}
  | {kind: 'meter'; label: string; from: number; to: number; threshold?: number; thresholdLabel?: string}
  | {kind: 'bars'; unit?: string; bars: {label: string; value: number; from?: number}[]}
  | {kind: 'type-shift'; from: PokemonTypeName[]; to: PokemonTypeName[]}
  | {kind: 'timeline'; steps: {label: string; detail?: string}[]; active?: number}
  | {kind: 'checklist'; items: {label: string; met: boolean}[]}
  | GeoMapPrimitive;
export type GeoEntityId = string;
export type GeoPoint = {lon: number; lat: number};
export type GeoAnchor = GeoEntityId | GeoPoint;
export type GeoCameraKey = {target: 'world' | GeoEntityId | {bbox: [number, number, number, number]}; at: number; padding: number; ease: 'linear' | 'in-out'};
export type GeoHighlight = {entity: GeoEntityId; style: 'fill' | 'outline' | 'trace'; at: number; color?: string};
export type GeoAnnotation =
  | {type: 'label'; anchor: GeoAnchor; text: string; at: number}
  | {type: 'marker'; anchor: GeoAnchor; text?: string; at: number}
  | {type: 'arrow'; from: GeoAnchor; to: GeoAnchor; text?: string; at: number}
  | {type: 'route'; path: GeoAnchor[]; text?: string; at: number; until?: number; marker: boolean; follow: boolean};
export type GeoMapPrimitive = {kind: 'geo-map'; camera: GeoCameraKey[]; highlights: GeoHighlight[]; annotations: GeoAnnotation[]; dataset: 'natural-earth'; cut?: boolean};
export type PrimitiveKind = Primitive['kind'];

export declare const GEO_ENTITY_ID: RegExp;
export declare const POKEMON_TYPE_NAMES: PokemonTypeName[];
export declare const primitiveSchema: z.ZodType<Primitive>;
export declare const PRIMITIVE_KINDS: PrimitiveKind[];
export declare const primitiveNumbers: (primitive: Primitive) => number[];
export declare const primitiveText: (primitive: Primitive) => string;
export declare const routeUntil: (route: {at: number; until?: number}) => number;
export declare const FOLLOW_LATEST: number;
