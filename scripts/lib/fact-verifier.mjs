// Fact Verifier: grounds every factual statement in a draft in the research.
// Each piece of text gets a verdict (supported / unsupported / uncertain, or
// no-claim for pure framing) with evidence pointers into the research JSON,
// e.g. "types[0]" or "pokedexEntries[1].text".
import {z} from 'zod';

export const VERDICTS = ['supported', 'unsupported', 'uncertain', 'no-claim'];
export const POKEMON_TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];

/** Every piece of draft text that could state a fact, with where it lives. */
export const extractClaims = (draft) => [
  ['title', draft.title],
  ['premise', draft.premise],
  ['audiencePromise', draft.audiencePromise],
  ['openLoop', draft.openLoop],
  ['payoff', draft.payoff],
  ...draft.scenes.flatMap((scene) => [
    [`scenes.${scene.id}.headline`, scene.headline],
    [`scenes.${scene.id}.narration`, scene.narration],
    [`scenes.${scene.id}.caption`, scene.caption],
    ...(scene.eyebrow ? [[`scenes.${scene.id}.eyebrow`, scene.eyebrow]] : []),
    ...(scene.facts ?? []).map((fact, index) => [`scenes.${scene.id}.facts[${index}]`, fact]),
  ]),
].filter(([, text]) => text && text.trim()).map(([where, text], index) => ({id: `c${index + 1}`, where, text}));

/** Extract a JSON array or object from a model reply that may include prose or fences. */
export const parseJsonReply = (text) => {
  const start = text.search(/[[{]/);
  if (start === -1) throw new Error('The verifier reply did not contain JSON.');
  const close = text[start] === '[' ? ']' : '}';
  const end = text.lastIndexOf(close);
  if (end <= start) throw new Error('The verifier reply did not contain complete JSON.');
  return JSON.parse(text.slice(start, end + 1));
};

/** Resolve an evidence pointer such as "evolutionChain[1].method" in the research. */
export const resolvePointer = (research, pointer) => {
  const tokens = [...pointer.matchAll(/([A-Za-z_][\w]*)|\[(\d+)\]/g)].map((match) => (match[1] ?? Number(match[2])));
  if (!tokens.length) return undefined;
  let value = research;
  for (const token of tokens) {
    if (value === null || typeof value !== 'object' || !(token in value)) return undefined;
    value = value[token];
  }
  return value;
};

const researchText = (research) => JSON.stringify(research, (key, value) => (key === 'artworkUrl' || key === 'url' ? undefined : value)).toLowerCase();

/**
 * Deterministic checks that need no model. A Pokémon type named in the text
 * must appear somewhere in the research (the subject's, its evolutions' or
 * forms' types, or Pokédex text); "Mew is a Steel Pokémon" is rejected.
 */
export const deterministicCheck = (claim, research) => {
  const known = researchText(research);
  const words = claim.text.toLowerCase().match(/[a-z]+/g) ?? [];
  const unknownTypes = [...new Set(words.filter((word) => POKEMON_TYPES.includes(word) && !new RegExp(`\\b${word}\\b`).test(known)))];
  if (!unknownTypes.length) return undefined;
  const typeName = (word) => word.charAt(0).toUpperCase() + word.slice(1);
  return {
    verdict: 'unsupported',
    evidence: ['types'],
    note: `Names the ${unknownTypes.map(typeName).join(' and ')} type, which appears nowhere in the research (${research.name} is ${research.types.join('/')}).`,
  };
};

const verdictSchema = z.object({
  id: z.string(),
  verdict: z.enum(VERDICTS),
  evidence: z.array(z.string()).default([]),
  note: z.string().default(''),
});

export const buildVerifierPrompt = ({research, claims}) => ({
  system: `You are a meticulous fact checker for a Pokémon video series. For each piece of text, decide whether every factual statement in it is supported by the research JSON, and nothing else. Your own knowledge does not count as evidence.

Verdicts:
- "supported": every factual statement is backed by the research. Give evidence pointers into the research JSON, e.g. "types[0]", "pokedexEntries[1].text", "evolutionChain[1].method", "varieties[0].weightKg".
- "unsupported": at least one statement contradicts the research or has no basis in it. Say which, in the note.
- "uncertain": plausibly true but only loosely or partially backed (for example a paraphrase that stretches a Pokédex entry). Explain in the note.
- "no-claim": no factual statement (a question, a hook phrase, framing, an opinion clearly presented as one).

Reply with a JSON array only: [{"id": "c1", "verdict": "supported", "evidence": ["types[0]"], "note": ""}, ...], one entry per id.`,
  messages: [{role: 'user', content: `Research:\n${JSON.stringify(research, null, 2)}\n\nText to check:\n${JSON.stringify(claims, null, 2)}`}],
});

/**
 * Verify a draft. `complete` is optional: without it only the deterministic
 * checks run and everything else is reported as uncertain.
 */
export const verifyDraft = async ({draft, research, complete}) => {
  const claims = extractClaims(draft);
  const modelVerdicts = new Map();
  if (complete) {
    const reply = parseJsonReply(await complete(buildVerifierPrompt({research, claims})));
    const list = Array.isArray(reply) ? reply : reply.claims ?? reply.verdicts ?? [];
    for (const item of list) {
      const parsed = verdictSchema.safeParse(item);
      if (parsed.success) modelVerdicts.set(parsed.data.id, parsed.data);
    }
  }

  const results = claims.map((claim) => {
    const deterministic = deterministicCheck(claim, research);
    if (deterministic) return {...claim, ...deterministic, checkedBy: 'rules'};
    const verdict = modelVerdicts.get(claim.id);
    if (!verdict) return {...claim, verdict: 'uncertain', evidence: [], note: complete ? 'The verifier returned no verdict for this text.' : 'Not checked: no verifier model configured.', checkedBy: complete ? 'model' : 'none'};
    // A "supported" verdict must point at evidence that exists.
    const broken = verdict.evidence.filter((pointer) => resolvePointer(research, pointer) === undefined);
    if (verdict.verdict === 'supported' && (broken.length || !verdict.evidence.length)) {
      return {...claim, ...verdict, verdict: 'uncertain', note: `Marked supported, but ${verdict.evidence.length ? `the evidence ${broken.join(', ')} does not exist in the research` : 'no evidence was given'}.`, checkedBy: 'model'};
    }
    return {...claim, ...verdict, checkedBy: 'model'};
  });

  return {
    claims: results,
    unsupported: results.filter((result) => result.verdict === 'unsupported'),
    uncertain: results.filter((result) => result.verdict === 'uncertain'),
  };
};

/** Writer feedback for claims that failed verification. */
export const verificationProblems = (report) => report.unsupported.map((claim) => `${claim.where} says "${claim.text}", which the research does not support: ${claim.note || 'no evidence found'} Rewrite it using only researched facts.`);
