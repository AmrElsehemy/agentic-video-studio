// Semantic visual primitives: components that visualise an idea (a count, a
// threshold, a type change) rather than a layout. A scene may carry one; the
// archetype's shot is the fallback. Shared by the draft schema, the compiler
// and the renderer's manifest schema.
import {z} from 'zod';

export const POKEMON_TYPE_NAMES = ['Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];

const label = z.string().min(1).max(28);
const typeName = z.enum(POKEMON_TYPE_NAMES);

export const primitiveSchema = z.discriminatedUnion('kind', [
  // A number climbing to a target: Gimmighoul's 999 coins.
  z.object({kind: z.literal('counter'), from: z.number().min(0).default(0), to: z.number().positive(), label}).strict(),
  // A gauge moving across a threshold, in percent: Darmanitan's HP falling to half.
  z.object({kind: z.literal('meter'), label, from: z.number().min(0).max(100), to: z.number().min(0).max(100), threshold: z.number().min(0).max(100).optional(), thresholdLabel: z.string().min(1).max(24).optional()}).strict(),
  // Values side by side, optionally changing: sizes, weights, a stat swap.
  z.object({kind: z.literal('bars'), unit: z.string().max(8).optional(), bars: z.array(z.object({label: z.string().min(1).max(16), value: z.number().min(0), from: z.number().min(0).optional()}).strict()).min(2).max(4)}).strict(),
  // A type change: Fire becoming Fire/Psychic.
  z.object({kind: z.literal('type-shift'), from: z.array(typeName).min(1).max(2), to: z.array(typeName).min(1).max(2)}).strict(),
  // Ordered steps, e.g. an evolution line; steps named after a Pokémon in the episode show its artwork.
  z.object({kind: z.literal('timeline'), steps: z.array(z.object({label: z.string().min(1).max(20), detail: z.string().min(1).max(24).optional()}).strict()).min(2).max(4), active: z.number().int().min(0).max(3).optional()}).strict(),
  // Requirements ruled in or out: no stone, no trade, 999 coins.
  z.object({kind: z.literal('checklist'), items: z.array(z.object({label: z.string().min(1).max(22), met: z.boolean()}).strict()).min(2).max(4)}).strict(),
]);

export const PRIMITIVE_KINDS = primitiveSchema.options.map((option) => option.shape.kind.value);

/** Every number a primitive states, for checking against the research. */
export const primitiveNumbers = (primitive) => {
  switch (primitive.kind) {
    case 'counter': return [primitive.from, primitive.to];
    case 'meter': return [primitive.from, primitive.to, ...(primitive.threshold === undefined ? [] : [primitive.threshold])];
    case 'bars': return primitive.bars.flatMap((bar) => [bar.value, ...(bar.from === undefined ? [] : [bar.from])]);
    default: return [];
  }
};

/** The primitive's words as plain text, for the fact checks. */
export const primitiveText = (primitive) => {
  switch (primitive.kind) {
    case 'counter': return `${primitive.label}: ${primitive.from} to ${primitive.to}`;
    case 'meter': return `${primitive.label}: ${primitive.from}% to ${primitive.to}%${primitive.threshold === undefined ? '' : `, ${primitive.thresholdLabel ?? 'threshold'} at ${primitive.threshold}%`}`;
    case 'bars': return primitive.bars.map((bar) => `${bar.label} ${bar.from === undefined ? '' : `${bar.from} to `}${bar.value}${primitive.unit ? ` ${primitive.unit}` : ''}`).join(', ');
    case 'type-shift': return `${primitive.from.join('/')} becomes ${primitive.to.join('/')}`;
    case 'timeline': return primitive.steps.map((step) => `${step.label}${step.detail ? ` (${step.detail})` : ''}`).join(' → ');
    case 'checklist': return primitive.items.map((item) => `${item.met ? 'yes' : 'no'}: ${item.label}`).join(', ');
    default: return '';
  }
};
