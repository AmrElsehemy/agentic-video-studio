import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';

// Story archetypes live as data in archetypes/<name>.json. Each is an ordered
// list of beats; a beat is a story step that may span a range of scenes.
const archetypesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'archetypes');

const shot = z.enum(['mystery', 'wide', 'macro', 'tracking', 'comparison', 'impact', 'interaction']);
const visual = z.enum(['hook', 'gauntlet', 'advantage', 'race', 'tradeoff', 'cta']);
const subjectFocus = z.enum(['absent', 'hidden', 'secondary', 'primary']);

const beatSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  role: z.enum(['hook', 'evidence', 'escalation', 'twist', 'payoff', 'interaction']),
  minScenes: z.number().int().min(0),
  maxScenes: z.number().int().min(1),
  // Repeated scenes within a beat cycle through these lists.
  shots: z.array(shot).min(1),
  visuals: z.array(visual).min(1),
  subjectFocus: z.array(subjectFocus).min(1),
  maxSeconds: z.number().positive().optional(),
}).refine((beat) => beat.maxScenes >= beat.minScenes, {message: 'maxScenes must be >= minScenes'});

export const archetypeSchema = z.object({
  description: z.string().min(1),
  defaultBeat: z.number().positive().max(1.5),
  beats: z.array(beatSchema).min(2),
}).superRefine((archetype, context) => {
  const ids = archetype.beats.map((beat) => beat.id);
  if (new Set(ids).size !== ids.length) context.addIssue({code: 'custom', message: 'Beat ids must be unique'});
  if (archetype.beats[0].role !== 'hook') context.addIssue({code: 'custom', message: 'The first beat must have role "hook"'});
  if (archetype.beats.at(-1).role !== 'interaction') context.addIssue({code: 'custom', message: 'The last beat must have role "interaction"'});
});

const loadArchetypes = () => {
  const loaded = {};
  for (const file of fs.readdirSync(archetypesDir).filter((name) => name.endsWith('.json')).sort()) {
    const name = file.replace(/\.json$/, '');
    const result = archetypeSchema.safeParse(JSON.parse(fs.readFileSync(path.join(archetypesDir, file), 'utf8')));
    if (!result.success) throw new Error(`Invalid archetype archetypes/${file}: ${result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`).join('; ')}`);
    loaded[name] = result.data;
  }
  return loaded;
};

export const archetypes = loadArchetypes();

export const getArchetype = (name) => {
  const archetype = archetypes[name];
  if (!archetype) throw new Error(`Unknown story archetype: ${name}. Supported: ${Object.keys(archetypes).join(', ')}`);
  return archetype;
};

const cycle = (list, occurrence) => list[occurrence % list.length];

/**
 * Assign each draft scene to a beat. An untagged scene stays in the current
 * beat until that beat's minimum is met, then moves to the next required beat.
 * A scene tagged with `beat` may repeat the current beat or jump forward over
 * beats whose minimum is zero.
 */
export const planScenes = (archetype, scenes) => {
  const {beats} = archetype;
  const counts = beats.map(() => 0);
  let current = -1;
  const describe = (index) => `scene ${index + 1} ("${scenes[index].id}")`;

  const plan = scenes.map((scene, index) => {
    let target;
    if (scene.beat) {
      target = beats.findIndex((beat) => beat.id === scene.beat);
      if (target === -1) throw new Error(`${describe(index)} uses unknown beat "${scene.beat}". Beats: ${beats.map((beat) => beat.id).join(', ')}`);
      if (target < current) throw new Error(`${describe(index)} goes back to beat "${scene.beat}" after "${beats[current].id}"; beats must stay in order: ${beats.map((beat) => beat.id).join(' → ')}`);
    } else {
      target = current >= 0 && counts[current] < beats[current].minScenes ? current : current + 1;
      // Untagged scenes pass over optional beats; tag a scene to use one.
      while (target !== current && target < beats.length - 1 && beats[target].minScenes === 0) target += 1;
      if (target >= beats.length) throw new Error(`${describe(index)} has no beat left; the story already reached "${beats.at(-1).id}". Remove the scene or tag an earlier scene with a repeatable beat.`);
    }
    for (let skipped = current + 1; skipped < target; skipped++) {
      if (beats[skipped].minScenes > 0) throw new Error(`${describe(index)} skips beat "${beats[skipped].id}", which needs at least ${beats[skipped].minScenes} scene(s).`);
    }
    if (target !== current && current >= 0 && counts[current] < beats[current].minScenes) {
      throw new Error(`Beat "${beats[current].id}" needs at least ${beats[current].minScenes} scene(s) but has ${counts[current]}.`);
    }
    const beat = beats[target];
    const occurrence = counts[target];
    if (occurrence >= beat.maxScenes) throw new Error(`Beat "${beat.id}" allows at most ${beat.maxScenes} scene(s); ${describe(index)} would be number ${occurrence + 1}.`);
    counts[target] += 1;
    current = target;
    return {
      beat: beat.id,
      role: beat.role,
      shot: cycle(beat.shots, occurrence),
      visual: cycle(beat.visuals, occurrence),
      subjectFocus: cycle(beat.subjectFocus, occurrence),
      maxSeconds: beat.maxSeconds,
    };
  });

  for (const [index, beat] of beats.entries()) {
    if (counts[index] < beat.minScenes) throw new Error(`Beat "${beat.id}" needs at least ${beat.minScenes} scene(s) but has ${counts[index]}. Story order: ${beats.map((item) => `${item.id} (${item.minScenes}–${item.maxScenes})`).join(' → ')}`);
  }
  return plan;
};
