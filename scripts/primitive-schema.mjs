// Semantic visual primitives: components that visualise an idea (a count, a
// threshold, a type change) rather than a layout. A scene may carry one; the
// archetype's shot is the fallback. Shared by the draft schema, the compiler
// and the renderer's manifest schema.
import {z} from 'zod';

export const POKEMON_TYPE_NAMES = ['Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];

const label = z.string().min(1).max(28);
const typeName = z.enum(POKEMON_TYPE_NAMES);

// GeoMotion: places are referenced by a stable id from the geo entity registry
// (public/geo/entities.json), never by hand-drawn outlines; points may use
// longitude/latitude. Times are fractions of the scene (0 = start, 1 = end),
// so choreography follows the scene's narration timing.
export const GEO_ENTITY_ID = /^(country|water|disputed):[A-Za-z0-9-]+$/;
const geoEntity = z.string().regex(GEO_ENTITY_ID, 'Use a geo entity id such as "country:GEO" or "water:black-sea"');
const point = z.object({lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90)}).strict();
const anchor = z.union([geoEntity, point]);
const bbox = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const moment = z.number().min(0).max(1);
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);
const cameraKey = z.object({
  // "world", a registry id, or an explicit box [west, south, east, north] (west > east crosses the antimeridian).
  target: z.union([z.literal('world'), geoEntity, z.object({bbox}).strict()]),
  at: moment,
  // Margin around the target, as a fraction of the frame.
  padding: z.number().min(0).max(.4).default(.15),
  ease: z.enum(['linear', 'in-out']).default('in-out'),
}).strict();
const geoAnnotation = z.discriminatedUnion('type', [
  z.object({type: z.literal('label'), anchor, text: label, at: moment.default(0)}).strict(),
  z.object({type: z.literal('marker'), anchor, text: label.optional(), at: moment.default(0)}).strict(),
  z.object({type: z.literal('arrow'), from: anchor, to: anchor, text: label.optional(), at: moment.default(0)}).strict(),
]);

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
  // A map: the camera flies between framings while places light up and labels, markers and arrows appear.
  z.object({
    kind: z.literal('geo-map'),
    camera: z.array(cameraKey).min(1).max(4),
    highlights: z.array(z.object({entity: geoEntity, style: z.enum(['fill', 'outline', 'trace']).default('fill'), at: moment.default(0), color: hexColor.optional()}).strict()).max(4).default([]),
    annotations: z.array(geoAnnotation).max(4).default([]),
    // The pinned map dataset the ids refer to (see docs/geomotion-data.md).
    dataset: z.literal('natural-earth').default('natural-earth'),
    // A map scene that follows another continues its camera (one unbroken flight);
    // cut: true starts this scene's camera fresh instead.
    cut: z.boolean().optional(),
  }).strict(),
]).superRefine((primitive, context) => {
  if (primitive.kind === 'geo-map') {
    // Keyframes start at the beginning of the scene and move forward in time.
    if (primitive.camera[0].at !== 0) context.addIssue({code: 'custom', path: ['camera', 0, 'at'], message: 'The first camera keyframe must be at 0 (the start of the scene)'});
    primitive.camera.forEach((key, index) => {
      if (index > 0 && key.at <= primitive.camera[index - 1].at) context.addIssue({code: 'custom', path: ['camera', index, 'at'], message: `Camera keyframes must move forward in time: ${key.at} follows ${primitive.camera[index - 1].at}`});
      if (typeof key.target === 'object' && key.target.bbox[1] >= key.target.bbox[3]) context.addIssue({code: 'custom', path: ['camera', index, 'target', 'bbox'], message: 'A box must have south below north'});
    });
    return;
  }
  if (primitive.kind !== 'meter') return;
  // A meter must move, and its threshold must be one it actually crosses.
  if (primitive.from === primitive.to) context.addIssue({code: 'custom', path: ['to'], message: 'A meter must move: from and to are equal'});
  if (primitive.thresholdLabel !== undefined && primitive.threshold === undefined) context.addIssue({code: 'custom', path: ['thresholdLabel'], message: 'thresholdLabel needs a threshold'});
  if (primitive.threshold !== undefined && (primitive.threshold < Math.min(primitive.from, primitive.to) || primitive.threshold > Math.max(primitive.from, primitive.to))) {
    context.addIssue({code: 'custom', path: ['threshold'], message: `threshold ${primitive.threshold} is never crossed between ${primitive.from} and ${primitive.to}`});
  }
});

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
    // Only the words on screen are claims; the places come from the map data.
    case 'geo-map': return primitive.annotations.map((annotation) => annotation.text).filter(Boolean).join(', ');
    default: return '';
  }
};
