// Angle Generator + Angle Critic: find the one surprising, specific idea an
// episode is about before anyone writes a script. The generator proposes
// candidate angles grounded in the research; the critic scores them and the
// best one (with its story shape) is handed to the writer.
import {z} from 'zod';
import {archetypes} from '../archetypes.mjs';
import {parseJsonReply, resolvePointer} from './fact-verifier.mjs';

export const CRITERIA = ['uniqueness', 'surprise', 'specificity', 'visual', 'support'];
/** Out of 25 (five criteria scored 1-5). Below this the critic asks for new angles. */
export const MIN_ANGLE_SCORE = 16;
/** Research fields every Pokémon has; an angle resting only on these could be about any Pokémon. */
export const GENERIC_FIELDS = ['types', 'category', 'generation', 'isLegendary', 'isMythical', 'name', 'index', 'number', 'slug', 'stage', 'isSubject', 'evolvesFrom'];
const GENERIC_UNIQUENESS_CAP = 2;

const candidateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  premise: z.string().min(1).max(140),
  hook: z.string().min(1).max(80),
  archetype: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  visualIdea: z.string().min(1).max(140),
});

const scoreSchema = z.object({
  id: z.string(),
  ...Object.fromEntries(CRITERIA.map((criterion) => [criterion, z.number().int().min(1).max(5)])),
  note: z.string().default(''),
});

const lastKey = (pointer) => pointer.match(/([A-Za-z_]\w*)(?:\[\d+\])*$/)?.[1];
/** True when every evidence pointer names a field every Pokémon has. */
export const isGeneric = (evidence) => evidence.every((pointer) => GENERIC_FIELDS.includes(lastKey(pointer)));

const messageOf = (error) => (error instanceof Error ? error.message : String(error));
const listOf = (reply, key) => (Array.isArray(reply) ? reply : Array.isArray(reply?.[key]) ? reply[key] : []);

/**
 * Validate the generator's candidates: known story shape, evidence that exists
 * in the research. Broken pointers are dropped; a candidate left with none is rejected.
 */
export const validateCandidates = (items, research, {storyPattern} = {}) => {
  const candidates = [];
  const rejected = [];
  const seen = new Set();
  for (const item of items) {
    const parsed = candidateSchema.safeParse(item);
    if (!parsed.success) {
      rejected.push({id: item?.id ?? '?', reason: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')});
      continue;
    }
    const candidate = {...parsed.data, archetype: storyPattern || parsed.data.archetype};
    if (seen.has(candidate.id)) {
      rejected.push({id: candidate.id, reason: 'duplicate id'});
      continue;
    }
    if (!(candidate.archetype in archetypes)) {
      rejected.push({id: candidate.id, reason: `unknown story shape "${candidate.archetype}"`});
      continue;
    }
    const evidence = candidate.evidence.filter((pointer) => resolvePointer(research, pointer) !== undefined);
    if (!evidence.length) {
      rejected.push({id: candidate.id, reason: `none of its evidence exists in the research (${candidate.evidence.join(', ')})`});
      continue;
    }
    seen.add(candidate.id);
    candidates.push({...candidate, evidence, generic: isGeneric(evidence)});
  }
  return {candidates, rejected};
};

const describeShapes = () => Object.entries(archetypes).map(([name, archetype]) => `- ${name}: ${archetype.description}`).join('\n');

export const buildGeneratorPrompt = ({research, storyPattern, feedback = [], count = 6}) => ({
  system: `You find angles for PokePulses, a vertical short-form video series about Pokémon. An angle is the one surprising, specific idea a 30-second episode is about.

Great angles are unique to this Pokémon (they would not work for any other), concrete (a number, a rule, a contradiction, a transformation), and grounded in the research. "Gimmighoul needs 999 coins to evolve" is an angle; "Gimmighoul is a Ghost-type Pokémon" is not.

Propose ${count} distinct candidate angles. For each give:
- id: a short lowercase-slug
- premise: the idea in one sentence (max 140 characters)
- hook: the first line a viewer hears (max 80 characters)
- archetype: the story shape that fits it best, one of:
${describeShapes()}
- evidence: pointers into the research JSON the angle rests on, e.g. "pokedexEntries[2].text", "evolutionChain[1].method", "varieties[0].weightKg"
- visualIdea: what the viewer would see that makes the idea visible (max 140 characters)

Use ONLY facts in the research; your own knowledge does not count.${storyPattern ? `\nEvery angle must use the "${storyPattern}" story shape.` : ''}

Reply with a JSON array only: [{"id": ..., "premise": ..., "hook": ..., "archetype": ..., "evidence": [...], "visualIdea": ...}, ...]`,
  messages: [{role: 'user', content: `Research:\n${JSON.stringify(research, null, 2)}${feedback.length ? `\n\nThe previous angles were not strong enough:\n${feedback.map((line) => `- ${line}`).join('\n')}\nPropose new, stronger angles.` : ''}`}],
});

export const buildCriticPrompt = ({research, candidates}) => ({
  system: `You are the creative director of PokePulses, a vertical short-form video series about Pokémon. Score each candidate angle from 1 (poor) to 5 (excellent) on:
- uniqueness: would it only work for this Pokémon? An angle that fits any Pokémon scores 1.
- surprise: would a fan who knows this Pokémon still learn something or be surprised?
- specificity: is it one concrete idea (a number, a rule, a contradiction) rather than a vague theme?
- visual: can the idea be shown on screen, not just said?
- support: do the cited research facts actually back the premise and hook?

Be strict: most angles should not score 5. Then choose the angle the episode should be about.

Reply with a JSON object only: {"scores": [{"id": ..., "uniqueness": 1-5, "surprise": 1-5, "specificity": 1-5, "visual": 1-5, "support": 1-5, "note": "..."}], "choice": "<id>", "request": "what stronger angles would need, if none is good enough"}`,
  messages: [{role: 'user', content: `Research:\n${JSON.stringify(research, null, 2)}\n\nCandidate angles:\n${JSON.stringify(candidates.map(({generic, ...candidate}) => candidate), null, 2)}`}],
});

/**
 * Apply the critic's scores. Angles that rest only on generic fields have
 * their uniqueness capped, whatever the critic said.
 */
export const rankCandidates = (candidates, review) => {
  const scores = new Map();
  for (const item of listOf(review, 'scores')) {
    const parsed = scoreSchema.safeParse(item);
    if (parsed.success) scores.set(parsed.data.id, parsed.data);
  }
  const choice = typeof review?.choice === 'string' ? review.choice : undefined;
  return candidates
    .filter((candidate) => scores.has(candidate.id))
    .map((candidate) => {
      const {id, note, ...raw} = scores.get(candidate.id);
      const adjusted = {...raw, ...(candidate.generic ? {uniqueness: Math.min(raw.uniqueness, GENERIC_UNIQUENESS_CAP)} : {})};
      const total = CRITERIA.reduce((sum, criterion) => sum + adjusted[criterion], 0);
      return {...candidate, scores: adjusted, total, note: candidate.generic && raw.uniqueness > GENERIC_UNIQUENESS_CAP ? `${note} (Uniqueness capped at ${GENERIC_UNIQUENESS_CAP}: its evidence is only fields every Pokémon has.)`.trim() : note};
    })
    // Highest total first; the critic's choice wins a tie.
    .sort((a, b) => b.total - a.total || (b.id === choice) - (a.id === choice));
};

/**
 * Find the episode's angle. `generate` and `critique` are model completions
 * (they may be the same). Runs up to `maxRounds` rounds, asking for new angles
 * when none reaches MIN_ANGLE_SCORE; after the last round the best angle so far
 * is used and marked `belowBar`.
 */
export const findAngle = async ({research, generate, critique = generate, storyPattern, maxRounds = 2, onRound = () => {}}) => {
  const rounds = [];
  let feedback = [];
  for (let round = 1; round <= maxRounds; round++) {
    let candidates = [];
    let rejected = [];
    let error;
    try {
      ({candidates, rejected} = validateCandidates(listOf(parseJsonReply(await generate(buildGeneratorPrompt({research, storyPattern, feedback}))), 'angles'), research, {storyPattern}));
    } catch (caught) {
      error = `The angle generator failed: ${messageOf(caught)}`;
    }
    let ranked = [];
    let request;
    if (candidates.length) {
      try {
        const review = parseJsonReply(await critique(buildCriticPrompt({research, candidates})));
        ranked = rankCandidates(candidates, review);
        request = typeof review?.request === 'string' ? review.request : undefined;
        if (!ranked.length) error = 'The angle critic scored none of the candidates.';
      } catch (caught) {
        error = `The angle critic failed: ${messageOf(caught)}`;
      }
    } else {
      error ??= `No usable angles${rejected.length ? `: ${rejected.map((item) => `${item.id} (${item.reason})`).join('; ')}` : ''}.`;
    }
    const record = {round, candidates: ranked.length ? ranked : candidates, rejected, ...(request ? {request} : {}), ...(error ? {error} : {})};
    rounds.push(record);
    onRound(record);
    if (ranked.length && ranked[0].total >= MIN_ANGLE_SCORE) return {chosen: ranked[0], rounds};
    feedback = [
      ...(error ? [error] : []),
      ...(request ? [request] : []),
      ...ranked.slice(0, 3).map((candidate) => `"${candidate.premise}" scored ${candidate.total}/25${candidate.note ? `: ${candidate.note}` : ''}`),
    ];
  }
  const best = rounds.flatMap((record) => record.candidates.filter((candidate) => candidate.total !== undefined)).sort((a, b) => b.total - a.total)[0];
  if (best) return {chosen: {...best, belowBar: true}, rounds};
  const error = new Error(`Could not find an angle after ${maxRounds} rounds:\n${rounds.map((record) => `- round ${record.round}: ${record.error}`).join('\n')}`);
  error.rounds = rounds;
  throw error;
};

/** The chosen angle as the writer sees it, with each piece of evidence resolved. */
export const describeAngle = (angle, research) => {
  const evidence = angle.evidence.map((pointer) => {
    const value = JSON.stringify(resolvePointer(research, pointer)) ?? '(not in the research)';
    return `- ${pointer}: ${value.length > 200 ? `${value.slice(0, 197)}...` : value}`;
  }).join('\n');
  return `Premise: ${angle.premise}
Hook idea: ${angle.hook}
Story shape: ${angle.archetype}
Visual idea: ${angle.visualIdea}
Built on:
${evidence}`;
};
