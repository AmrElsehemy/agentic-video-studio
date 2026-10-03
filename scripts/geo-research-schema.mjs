// Research for a geography episode: sourced claims, the places the map may
// show (by name, resolved to map ids by scripts/lib/geo-resolver.mjs), and
// named points (cities, peaks, dig sites) with their source. A point that
// isn't surveyed is marked approximate, and must be labelled so on screen.
import {z} from 'zod';
import {MAX_DATA_PLACES} from './primitive-schema.mjs';
import {TIERS} from './lib/source-tiers.mjs';

const key = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase words joined by hyphens');

export const geoClaimSchema = z.object({
  id: key,
  text: z.string().min(10),
  tier: z.enum(TIERS),
  sources: z.array(key).min(1),
  note: z.string().optional(),
}).strict();

export const geoPlaceSchema = z.object({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  source: key,
  approximate: z.boolean().optional(),
  note: z.string().optional(),
}).strict();

/**
 * A sourced dataset (#91): one value per place, by name ("Botswana": 513), for a data map.
 * Values must come from the cited source; the map shows them as they are.
 */
export const geoDatasetSchema = z.object({
  label: z.string().min(1).max(28),
  unit: z.string().min(1).max(8).optional(),
  source: key,
  note: z.string().optional(),
  // The same bounds as a data map's places, so a dataset that can't be drawn fails here, not in the director.
  values: z.record(z.string().min(1), z.number()).refine((values) => Object.keys(values).length >= 2, 'a dataset needs at least two places')
    .refine((values) => Object.keys(values).length <= MAX_DATA_PLACES, `a dataset can have at most ${MAX_DATA_PLACES} places (a data map shades at most that many)`),
}).strict();

export const geoResearchSchema = z.object({
  schemaVersion: z.literal(1),
  id: key,
  /** The place the episode is about, by name ("Georgia"). */
  subject: z.string().min(1),
  kind: z.enum(['curated', 'generated']),
  note: z.string().optional(),
  /** Other places the map may show, by name ("Black Sea", "South Africa"). */
  regions: z.array(z.string().min(1)).default([]),
  claims: z.array(geoClaimSchema).min(1),
  places: z.record(key, geoPlaceSchema).default({}),
  datasets: z.record(key, geoDatasetSchema).default({}),
  sources: z.record(key, z.object({label: z.string().min(1), url: z.string().url()}).strict()),
}).strict().superRefine((research, context) => {
  const cite = (source, path) => {
    if (!research.sources[source]) context.addIssue({code: 'custom', path, message: `cites "${source}", which isn't in sources`});
  };
  research.claims.forEach((claim, index) => claim.sources.forEach((source, at) => cite(source, ['claims', index, 'sources', at])));
  Object.entries(research.places).forEach(([name, place]) => cite(place.source, ['places', name, 'source']));
  Object.entries(research.datasets).forEach(([name, dataset]) => cite(dataset.source, ['datasets', name, 'source']));
});
