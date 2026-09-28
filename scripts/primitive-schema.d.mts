import type {z} from 'zod';

export type PokemonTypeName = 'Normal' | 'Fire' | 'Water' | 'Grass' | 'Electric' | 'Ice' | 'Fighting' | 'Poison' | 'Ground' | 'Flying' | 'Psychic' | 'Bug' | 'Rock' | 'Ghost' | 'Dragon' | 'Dark' | 'Steel' | 'Fairy';

export type Primitive =
  | {kind: 'counter'; from: number; to: number; label: string}
  | {kind: 'meter'; label: string; from: number; to: number; threshold?: number; thresholdLabel?: string}
  | {kind: 'bars'; unit?: string; bars: {label: string; value: number; from?: number}[]}
  | {kind: 'type-shift'; from: PokemonTypeName[]; to: PokemonTypeName[]}
  | {kind: 'timeline'; steps: {label: string; detail?: string}[]; active?: number}
  | {kind: 'checklist'; items: {label: string; met: boolean}[]};
export type PrimitiveKind = Primitive['kind'];

export declare const POKEMON_TYPE_NAMES: PokemonTypeName[];
export declare const primitiveSchema: z.ZodType<Primitive>;
export declare const PRIMITIVE_KINDS: PrimitiveKind[];
export declare const primitiveNumbers: (primitive: Primitive) => number[];
export declare const primitiveText: (primitive: Primitive) => string;
