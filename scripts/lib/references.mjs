// Curated creative references the writer agent learns from (creative-references/).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';

const defaultDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'creative-references');

export const referenceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  subject: z.string().min(1),
  source: z.string().min(1),
  archetypes: z.array(z.string().min(1)).min(1),
  whyItWorks: z.array(z.string().min(1)).min(1),
  episode: z.object({
    title: z.string().min(1),
    premise: z.string().min(1),
    openLoop: z.string().min(1),
    payoff: z.string().min(1),
    engagementQuestion: z.string().min(1),
    scenes: z.array(z.object({
      role: z.string().min(1),
      headline: z.string().min(1),
      narration: z.string().min(1),
      caption: z.string().min(1),
    }).passthrough()).min(3),
  }).passthrough(),
});

export const loadReferences = (dir = defaultDir) => {
  if (!fs.existsSync(dir)) throw new Error(`Creative references folder not found: ${dir}. The writer learns from curated episodes there; restore creative-references/ from the repository.`);
  return loadReferenceFiles(dir);
};

const loadReferenceFiles = (dir) => fs.readdirSync(dir)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => {
    const result = referenceSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
    if (!result.success) throw new Error(`Invalid creative reference ${file}: ${result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`);
    return result.data;
  });

/**
 * References for a story shape: those demonstrating it, or the whole library
 * when none does (or when the writer chooses the shape itself).
 */
export const selectReferences = (references, storyPattern) => {
  const matching = storyPattern ? references.filter((reference) => reference.archetypes.includes(storyPattern)) : [];
  return matching.length ? matching : references;
};
