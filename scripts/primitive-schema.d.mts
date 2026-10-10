import type {z} from 'zod';

export type PokemonTypeName = 'Normal' | 'Fire' | 'Water' | 'Grass' | 'Electric' | 'Ice' | 'Fighting' | 'Poison' | 'Ground' | 'Flying' | 'Psychic' | 'Bug' | 'Rock' | 'Ghost' | 'Dragon' | 'Dark' | 'Steel' | 'Fairy';

export type Primitive =
  | {kind: 'counter'; from: number; to: number; label: string}
  | {kind: 'meter'; label: string; from: number; to: number; threshold?: number; thresholdLabel?: string}
  | {kind: 'bars'; unit?: string; bars: {label: string; value: number; from?: number}[]}
  | {kind: 'type-shift'; from: PokemonTypeName[]; to: PokemonTypeName[]}
  | {kind: 'timeline'; steps: {label: string; detail?: string}[]; active?: number}
  | {kind: 'checklist'; items: {label: string; met: boolean}[]}
  | GeoMapPrimitive
  | DiagramPrimitive;
export type GeoEntityId = string;
export type GeoPoint = {lon: number; lat: number};
export type GeoAnchor = GeoEntityId | GeoPoint;
export type GeoCameraKey = {target: 'world' | GeoEntityId | {bbox: [number, number, number, number]}; at: number; padding: number; ease: 'linear' | 'in-out'};
export type GeoHighlight = {entity: GeoEntityId; style: 'fill' | 'outline' | 'trace'; at: number; color?: string};
export type GeoAnnotation =
  | {type: 'label'; anchor: GeoAnchor; text: string; at: number; until?: number}
  | {type: 'marker'; anchor: GeoAnchor; text?: string; at: number; until?: number}
  | {type: 'arrow'; from: GeoAnchor; to: GeoAnchor; text?: string; at: number}
  | {type: 'route'; path: GeoAnchor[]; text?: string; at: number; until?: number; marker: boolean; follow: boolean}
  | {type: 'ring'; center: GeoAnchor; radiusKm: number; text?: string; at: number; until?: number}
  | {type: 'truesize'; entity: GeoEntityId; onto: GeoEntityId; text?: string; at: number; until?: number}
  | {type: 'reconstruction'; entities: GeoEntityId[]; fixed: GeoEntityId; from: number; to: number; at: number; until?: number; text?: string}
  | {type: 'timeline'; steps: {label: string; detail?: string}[]; active: number; at: number}
  | {type: 'photo'; photo: string; at: number; until?: number}
  | {type: 'line'; kind: 'meridian' | 'parallel'; degrees: number; text?: string; at: number; until?: number; reverse: boolean};
export type GeoMapPrimitive = {kind: 'geo-map'; camera: GeoCameraKey[]; highlights: GeoHighlight[]; annotations: GeoAnnotation[]; dataset: 'natural-earth'; cut?: boolean; projection?: 'mercator' | 'equal-earth' | 'albers' | 'azimuthal'; morph?: boolean; flags?: boolean; ambience?: 'sea' | 'wind' | 'city' | 'jungle' | 'desert' | 'ice' | 'space' | 'none'; streets?: {city: string; at: number}; surface?: {kind: 'coast-distance'; at: number} | {kind: 'elevation'; at: number} | {kind: 'flood'; at: number; rise: 1 | 2 | 5 | 10 | 20 | 50}; globe?: boolean; relief?: boolean; data?: GeoData};
export type GeoData = {label: string; unit?: string; values: {entity: GeoEntityId; value: number}[]; at: number; legend: boolean; view: 'map' | 'bars' | 'both' | 'bubbles'};
/** When a diagram action happens (#120): a fraction of the scene, a spoken word, a chain, or the scene's end. */
export type DiagramAnchor = number | {word: string; nth: number} | {after: string; delay: number} | 'scene-end';
type ActionBase = {id?: string; at: DiagramAnchor; dur?: number};
export type DiagramAction =
  | (ActionBase & {do: 'reveal'; target: string; anim: 'draw' | 'pop' | 'fade'})
  | (ActionBase & {do: 'connect'; edge: string})
  | (ActionBase & {do: 'highlight'; target: string; until?: DiagramAnchor})
  | (ActionBase & {do: 'annotate'; target: string; text: string})
  | (ActionBase & {do: 'flow'; step: string; edges: string[]})
  | (ActionBase & {do: 'camera'; focus: 'all' | string[]; padding: number});
export type DiagramPrimitive = {kind: 'diagram'; actions: DiagramAction[]; cut?: boolean};
export type PrimitiveKind = Primitive['kind'];

export declare const GEO_ENTITY_ID: RegExp;
export declare const POKEMON_TYPE_NAMES: PokemonTypeName[];
export declare const primitiveSchema: z.ZodType<Primitive>;
export declare const PRIMITIVE_KINDS: PrimitiveKind[];
export declare const primitiveNumbers: (primitive: Primitive) => number[];
export declare const primitiveText: (primitive: Primitive) => string;
export declare const routeUntil: (route: {at: number; until?: number}) => number;
export declare const FOLLOW_LATEST: number;
export declare const MAX_DATA_PLACES: number;
