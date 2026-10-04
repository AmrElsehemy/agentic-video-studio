// Visual Director: reads a finished draft and gives the scenes whose idea can
// be shown (a count, a threshold, a type change, a stat swap...) a semantic
// visual primitive with its data. Scenes it leaves alone keep the archetype's
// shot. Every number and type a primitive states must be in the research.
import {POKEMON_TYPE_NAMES, primitiveNumbers, primitiveSchema} from '../primitive-schema.mjs';
import {styleGuideSection} from './shows.mjs';
import {compileEpisode} from './compiler.mjs';
import {parseJsonReply} from './fact-verifier.mjs';
import {researchNumbers} from './writer.mjs';

export const PRIMITIVE_GUIDE = [
  ['counter', 'a number climbing to a target', '{"kind": "counter", "from": 0, "to": 999, "label": "GIMMIGHOUL COINS"}'],
  ['meter', 'a gauge in percent crossing a threshold', '{"kind": "meter", "label": "HP", "from": 100, "to": 50, "threshold": 50, "thresholdLabel": "ZEN MODE"}'],
  ['bars', 'two to four values side by side, optionally changing from a previous value (sizes, weights, a stat swap)', '{"kind": "bars", "unit": "KG", "bars": [{"label": "ZACIAN", "value": 110}, {"label": "CROWNED", "value": 355}]}'],
  ['type-shift', 'a change of type', '{"kind": "type-shift", "from": ["Fire"], "to": ["Fire", "Psychic"]}'],
  ['timeline', 'two to four ordered steps, e.g. an evolution line; a step labelled with a Pokémon\'s name shows its artwork', '{"kind": "timeline", "steps": [{"label": "Gimmighoul", "detail": "999 COINS"}, {"label": "Gholdengo"}], "active": 1}'],
  ['checklist', 'two to four requirements ruled out (met: false) or in (met: true)', '{"kind": "checklist", "items": [{"label": "TRADE", "met": false}, {"label": "999 COINS", "met": true}]}'],
];

/** Research text for checking named types, lowercase. */
const researchTypes = (research) => new Set([
  ...research.types,
  ...research.evolutionChain.flatMap((member) => member.types),
  ...research.varieties.flatMap((variety) => variety.types),
].map((type) => type.toLowerCase()));

/**
 * Check a primitive against the research: every number it states must be
 * researched (a meter's 0 and 100 bounds are always allowed), and every type
 * must belong to the subject, its evolutions or its forms. Returns the problems.
 */
export const checkPrimitive = (primitive, research) => {
  const allowed = researchNumbers(research);
  const problems = [];
  const bounds = primitive.kind === 'meter' ? [0, 100] : primitive.kind === 'counter' ? [0] : [];
  for (const number of primitiveNumbers(primitive)) {
    if (!allowed.has(number) && !bounds.includes(number)) problems.push(`states ${number}, which is not in the research`);
  }
  if (primitive.kind === 'type-shift') {
    const known = researchTypes(research);
    for (const type of [...primitive.from, ...primitive.to]) {
      if (!known.has(type.toLowerCase())) problems.push(`names the ${type} type, which ${research.name}'s line never has`);
    }
  }
  return problems;
};

export const buildDirectorPrompt = ({draft, manifest, research, angle, showId = 'pokepulses'}) => ({
  system: `You are the visual director of PokePulses, a vertical short-form video series about Pokémon. Each scene already has a default shot (artwork, headline and fact cards). Your job: find the scenes whose idea can be SHOWN, not just said, and give each one a visual primitive with its data.

Primitives:
${PRIMITIVE_GUIDE.map(([kind, use, example]) => `- ${kind}: ${use}. Example: ${example}`).join('\n')}

Rules:
- Choose a primitive for the meaning of the scene: a scene about a count gets a counter, a scene about a threshold gets a meter. If no primitive fits a scene, leave it out; the default shot is fine.
- Usually 1 to 3 scenes per episode. Never the last scene (the viewer's choice keeps its verdict layout).
- Every number and type in a primitive must come from the research. Types are one of: ${POKEMON_TYPE_NAMES.join(', ')}.
- Labels are short and uppercase-friendly (max 28 characters; timeline labels 20, bar labels 16, checklist items 22).

Reply with a JSON object only: {"scenes": [{"id": "<scene id>", "primitive": {...}, "why": "one sentence"}]}${styleGuideSection(showId)}`,
  messages: [{role: 'user', content: `${angle ? `The episode's angle: ${angle.premise}\n\n` : ''}Research:\n${JSON.stringify(research, (key, value) => (key === 'artworkUrl' || key === 'sources' ? undefined : value), 2)}\n\nScenes:\n${JSON.stringify(manifest.scenes.map((scene) => ({id: scene.id, role: scene.role, defaultShot: scene.shot, headline: scene.headline, narration: scene.narration, facts: scene.facts ?? []})), null, 2)}\n\nSubjects in this episode (for timeline labels): ${[draft.subject.name, ...(draft.related ?? []).map((item) => `${item.name} (${item.relation})`)].join(', ')}`}],
});

/**
 * Direct the visuals of a draft that has passed every gate. Returns the draft
 * with primitives on the chosen scenes (recompiled), plus what was assigned
 * and rejected. Without a model, or when the model fails, the draft is
 * returned unchanged.
 */
export const directVisuals = async ({draft, research, angle, complete, showId = 'pokepulses'}) => {
  const {manifest} = compileEpisode(draft, {showId});
  if (!complete) return {draft, manifest, assigned: [], rejected: []};
  let reply;
  try {
    reply = parseJsonReply(await complete(buildDirectorPrompt({draft, manifest, research, angle, showId})));
  } catch (error) {
    return {draft, manifest, assigned: [], rejected: [], modelError: error instanceof Error ? error.message : String(error)};
  }
  const items = Array.isArray(reply) ? reply : Array.isArray(reply?.scenes) ? reply.scenes : [];
  const lastId = draft.scenes.at(-1).id;
  const assigned = [];
  const rejected = [];
  const chosen = new Map();
  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id : '?';
    const reject = (reason) => rejected.push({id, reason});
    if (!draft.scenes.some((scene) => scene.id === id)) { reject('no such scene'); continue; }
    if (id === lastId) { reject('the last scene keeps its verdict layout'); continue; }
    if (chosen.has(id)) { reject('the reply names this scene more than once; the first valid primitive is kept'); continue; }
    const parsed = primitiveSchema.safeParse(item.primitive);
    if (!parsed.success) { reject(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'primitive'}: ${issue.message}`).join('; ')); continue; }
    const problems = checkPrimitive(parsed.data, research);
    if (problems.length) { reject(`${parsed.data.kind} ${problems.join('; ')}`); continue; }
    chosen.set(id, parsed.data);
    assigned.push({id, kind: parsed.data.kind, why: typeof item.why === 'string' ? item.why : ''});
  }
  if (!chosen.size) return {draft, manifest, assigned, rejected};
  const directed = {...draft, scenes: draft.scenes.map((scene) => (chosen.has(scene.id) ? {...scene, primitive: chosen.get(scene.id)} : scene))};
  return {draft: directed, manifest: compileEpisode(directed, {showId}).manifest, assigned, rejected};
};
