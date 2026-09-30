// The episode's subject, independent of Pokémon: a name, a category, an
// optional artwork (map-driven episodes have none), an optional identifier (a Pokédex number, a model code) and free
// attributes, plus related subjects with how they relate. Show profiles add
// their own rules (e.g. PokePulses identifiers look like "#001").
import {z} from 'zod';

export const RELATIONS = ['evolves-to', 'evolves-from', 'form', 'related'];

const identifier = z.string().min(1).max(12);

export const subjectSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  artworkUrl: z.string().url().optional(),
  /** A short code shown on screen when the story is about it, e.g. "#001". */
  identifier: identifier.optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
}).strict();

export const relatedSchema = z.object({
  name: z.string().min(1),
  relation: z.enum(RELATIONS),
  artworkUrl: z.string().url(),
  identifier: identifier.optional(),
}).strict();

/**
 * Drafts written before subjects were generic used `subject.index` and an
 * `evolutions` list. Convert them: the index becomes the identifier, a
 * related entry named after the subject ("Darmanitan Zen") is a form, the
 * rest are evolutions.
 */
export const upgradeLegacySubject = (draft) => {
  if (!draft || typeof draft !== 'object' || !draft.subject || typeof draft.subject !== 'object') return draft;
  const {index, ...subject} = draft.subject;
  const {evolutions, ...rest} = draft;
  const upgraded = {...rest, subject: {...subject, ...(index !== undefined && subject.identifier === undefined ? {identifier: index} : {})}};
  if (Array.isArray(evolutions) && rest.related === undefined) {
    const base = String(subject.name ?? '').toLowerCase();
    upgraded.related = evolutions.map(({index: relatedIndex, ...entry}) => ({
      ...entry,
      relation: String(entry.name ?? '').toLowerCase().startsWith(base) ? 'form' : 'evolves-to',
      ...(relatedIndex !== undefined ? {identifier: relatedIndex} : {}),
    }));
  }
  return upgraded;
};
