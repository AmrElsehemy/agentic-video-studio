// Creative critic: judges whether a draft is a good story, separately from
// the production audit (scoreEpisode), which checks structure the compiler
// and archetype largely guarantee. A structurally perfect draft can still be
// a boring list of facts; this gate catches that and tells the writer how to
// fix it, criterion by criterion, quoting the draft.
import {z} from 'zod';
import {parseJsonReply} from './fact-verifier.mjs';

export const CREATIVE_CRITERIA = {
  hook: 'Hook novelty: does the first line create tension a fan has not heard before?',
  specificity: 'Specificity: is the story about this Pokémon only, built on concrete details rather than generic traits?',
  tension: 'Tension: is there an open question the viewer needs answered?',
  escalation: 'Escalation: does each scene raise the stakes or deepen the idea, rather than list facts?',
  surprise: 'Surprise: is there at least one moment that changes how the viewer sees the Pokémon?',
  variety: 'Variety: does every scene say something new (no scene restating another)?',
  payoff: 'Payoff: does the ending resolve the opening promise with something stronger than a restatement?',
  question: 'Question: is the closing question a genuine split between credible positions?',
};
/** What an explainer (a walkthrough of a system's diagram) is judged on instead: a story too, but one that teaches. */
export const EXPLAINER_CRITERIA = {
  hook: 'Hook: does the first line give a reason to care how this system works (a cost, a puzzle, a promise)?',
  clarity: 'Clarity: could a developer new to the system follow every step, each part named before it is relied on?',
  order: "Order: do the scenes follow the diagram's flows in order, each step building on the last?",
  specificity: "Specificity: is it about this system's own parts and steps rather than generic advice?",
  tension: 'Tension: is there a problem (a slow path, a failure, a trade-off) the walkthrough resolves?',
  variety: 'Variety: does every scene say something new (no scene restating another)?',
  payoff: 'Payoff: does the ending show why the design works, rather than restating it?',
  question: 'Question: is the closing question a genuine choice a developer could argue either way?',
};
const criteriaFor = (kind) => (kind === 'explainer' ? EXPLAINER_CRITERIA : CREATIVE_CRITERIA);

/** Out of 100. A criterion scored 2 or lower also fails the draft. */
export const CREATIVE_PASSING_SCORE = 70;
export const CRITERION_FLOOR = 2;
const CAPPED = 2;

const STOPWORDS = new Set('the a an and or but of to in on at for with its it is are was this that these those from into than then just even more most very your you can has have had be been by as so if when what which who why how every each one'.split(' '));
const contentWords = (text) => new Set((text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? []).filter((word) => word.length > 2 && !STOPWORDS.has(word)));
const overlap = (a, b) => {
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / Math.min(a.size, b.size);
};

/**
 * Deterministic checks that need no model. They cap a criterion (whatever the
 * critic says) when the draft plainly fails it.
 */
export const deterministicCritique = (draft) => {
  const findings = [];
  const middle = draft.scenes.slice(1, -1);
  // "It weighs 110 kg. It is a Fairy type. It stands 2.8 m tall." is a fact list, not a story.
  const statement = new RegExp(`^(it|its|this pok[eé]mon|${draft.subject.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(['’]s)? (is|are|has|have|weighs|stands|measures|was|can|lives|likes|learns|evolves)\\b`, 'i');
  const listed = middle.filter((scene) => statement.test(scene.narration.trim()));
  if (middle.length && listed.length * 2 >= middle.length) {
    findings.push({criterion: 'escalation', quote: listed[0].narration, note: `${listed.length} of ${middle.length} middle scenes read as stat statements ("It is…", "It has…"). Turn them into steps of one argument: each scene should answer "so what?" about the previous one.`});
  }
  const words = draft.scenes.map((scene) => contentWords(scene.narration));
  for (let a = 0; a < draft.scenes.length; a++) {
    for (let b = a + 1; b < draft.scenes.length; b++) {
      if (words[a].size >= 3 && words[b].size >= 3 && overlap(words[a], words[b]) >= 0.75) {
        findings.push({criterion: 'variety', quote: draft.scenes[b].narration, note: `Scene "${draft.scenes[b].id}" repeats scene "${draft.scenes[a].id}". Replace it with a new step in the story.`});
      }
    }
  }
  return findings;
};

/**
 * The critic for an explainer: the diagram's own text (and any notes) is the
 * only factual source, as the research is for a story.
 */
export const buildExplainerCriticPrompt = ({draft, sources}) => ({
  system: `You are the creative director of ${draft.show?.name ?? 'an explainer series'}: videos that walk through how a software system works while its diagram builds on screen. Production checks (timing, structure) have already passed; judge only whether a developer would watch this to the end, understand the system, and want to argue about it.

Score each criterion from 1 (poor) to 5 (excellent). Be strict: a competent but forgettable draft scores 3.
${Object.entries(EXPLAINER_CRITERIA).map(([key, description]) => `- ${key}: ${description}`).join('\n')}

CRITICAL EVIDENCE RULE: every revision you recommend must be achievable using ONLY what the diagram and the notes below state. Never suggest inventing numbers, products, failure stories or behaviour the sources don't give. You may improve framing, ordering, clarity, contrast, pacing and wording.

For each, quote the exact words from the draft your score is based on, and give one concrete evidence-safe revision, or "" if it scores 5.

Reply with a JSON object only: {${Object.keys(EXPLAINER_CRITERIA).map((key) => `"${key}": {"score": 1-5, "quote": "...", "revision": "..."}`).join(', ')}}`,
  messages: [{role: 'user', content: `Sources (the ONLY factual source for revision advice):\n${sources}\n\nDraft:\n${JSON.stringify({title: draft.title, premise: draft.premise, openLoop: draft.openLoop, payoff: draft.payoff, engagementQuestion: draft.engagementQuestion, scenes: draft.scenes.map(({id, beat, headline, narration}) => ({id, beat, headline, narration}))}, null, 2)}`}],
});

const criterionSchema = z.object({
  score: z.number().int().min(1).max(5),
  quote: z.string().default(''),
  revision: z.string().default(''),
});

export const buildCreativeCriticPrompt = ({draft, research, angle}) => ({
  system: `You are the creative director of PokePulses, a vertical short-form video series about Pokémon. Production checks (timing, shots, structure) have already passed; judge only whether this is a story people would watch to the end and argue about.

Score each criterion from 1 (poor) to 5 (excellent). Be strict: a competent but forgettable draft scores 3.
${Object.entries(CREATIVE_CRITERIA).map(([key, description]) => `- ${key}: ${description}`).join('\n')}

CRITICAL EVIDENCE RULE:
- Every revision you recommend must be achievable using ONLY facts explicitly present in the supplied research.
- Never suggest inventing consequences, motives, strategies, battles, predators, risks, benefits, abilities, learned behavior, or interactions that the research does not state.
- Never suggest strengthening a claim beyond the evidence. For example, "sometimes struck by lightning" cannot become "attracts lightning like a magnet" or "harnesses lightning".
- You may improve framing, ordering, curiosity, contrast, pacing, wording, reveal timing, or ask a non-assertive question grounded in the evidence.
- If the research is too thin to support a stronger factual twist, say so and recommend a stronger presentation of the existing evidence instead of inventing one.
- Treat the chosen angle as a framing constraint, not as independent evidence. If the angle overstates the research, do not reinforce the overstatement.

For each, quote the exact words from the draft your score is based on, and give one concrete evidence-safe revision (what to change and how), or "" if it scores 5.

Reply with a JSON object only: {${Object.keys(CREATIVE_CRITERIA).map((key) => `"${key}": {"score": 1-5, "quote": "...", "revision": "..."}`).join(', ')}}`,
  messages: [{role: 'user', content: `${angle ? `The chosen angle: ${angle.premise}\n\n` : ''}${research ? `Research (the ONLY factual source for revision advice):\n${JSON.stringify({name: research.name, category: research.category, types: research.types, pokedexEntries: research.pokedexEntries, evolutionChain: research.evolutionChain.map(({name, method}) => ({name, method})), varieties: research.varieties.map(({name, types}) => ({name, types}))}, null, 2)}\n\n` : `Subject: ${draft.subject.name}\n\n`}Draft:\n${JSON.stringify({title: draft.title, premise: draft.premise, openLoop: draft.openLoop, payoff: draft.payoff, engagementQuestion: draft.engagementQuestion, scenes: draft.scenes.map(({id, headline, narration, caption}) => ({id, headline, narration, caption}))}, null, 2)}`}],
});

/**
 * Critique a draft (`kind` "explainer" judges a walkthrough against `sources`,
 * the diagram's text and notes). Without `complete` the model half is skipped and the
 * draft is not judged (reported as `skipped`); a model failure is reported
 * as `modelError` rather than blocking the episode.
 */
export const critiqueDraft = async ({draft, research, angle, complete, kind = 'story', sources = ''}) => {
  const findings = deterministicCritique(draft);
  if (!complete) return {skipped: true, passed: true, findings};
  let reply;
  try {
    reply = parseJsonReply(await complete(kind === 'explainer' ? buildExplainerCriticPrompt({draft, sources}) : buildCreativeCriticPrompt({draft, research, angle})));
  } catch (error) {
    return {skipped: true, passed: true, findings, modelError: error instanceof Error ? error.message : String(error)};
  }
  const criteria = Object.keys(criteriaFor(kind)).map((criterion) => {
    const parsed = criterionSchema.safeParse(reply?.[criterion]);
    // A missing or malformed criterion counts as unproven: middling, with a note.
    const judged = parsed.success ? parsed.data : {score: 3, quote: '', revision: 'The critic gave no usable score for this criterion.'};
    const finding = findings.find((item) => item.criterion === criterion);
    if (finding && judged.score > CAPPED) return {criterion, score: CAPPED, quote: finding.quote, revision: finding.note, capped: true};
    return {criterion, ...judged};
  });
  const score = Math.round(criteria.reduce((sum, item) => sum + item.score, 0) / (criteria.length * 5) * 100);
  const failing = criteria.filter((item) => item.score <= CRITERION_FLOOR);
  return {score, passed: score >= CREATIVE_PASSING_SCORE && !failing.length, criteria, findings};
};

/**
 * Writer feedback keeps deterministic, code-generated guidance (which cannot
 * hallucinate facts) but deliberately excludes the model critic's free-form
 * revision text. The writer revises model-scored weaknesses using the original
 * research already present in its conversation.
 */
export const creativeProblems = (review) => {
  if (review.passed || !review.criteria) return [];
  return [...review.criteria]
    .filter((item) => item.score < 4)
    .sort((a, b) => a.score - b.score)
    .map((item) => {
      const prefix = `Creative ${item.criterion} scored ${item.score}/5${item.quote ? ` ("${item.quote}")` : ''}`;
      if (item.capped && item.revision) return `${prefix}: ${item.revision}`;
      return `${prefix}. Improve ${{...CREATIVE_CRITERIA, ...EXPLAINER_CRITERIA}[item.criterion]} Use only facts already present in the research; do not add a new factual claim to solve this.`;
    })
    .concat(`Creative score ${review.score}/100 (needs ${CREATIVE_PASSING_SCORE}, and no criterion at ${CRITERION_FLOOR} or below).`);
};

/**
 * Check the critic against known quality: every curated reference should
 * pass, and each baseline (a draft known to be weaker) should score below the
 * weakest reference. `stories` are {label, story, research?, expect: 'pass' | 'lower'}.
 */
export const calibrateCritic = async ({stories, complete}) => {
  const rows = [];
  for (const {label, story, research, expect} of stories) rows.push({label, expect, review: await critiqueDraft({draft: story, research, complete})});
  const judged = rows.filter((row) => !row.review.skipped);
  const referenceScores = judged.filter((row) => row.expect === 'pass').map((row) => row.review.score);
  const floor = referenceScores.length ? Math.min(...referenceScores) : Infinity;
  const results = rows.map((row) => ({
    ...row,
    ok: row.review.skipped ? false : row.expect === 'pass' ? row.review.passed : row.review.score < floor,
  }));
  return {rows: results, calibrated: results.every((row) => row.ok)};
};

/** A curated reference (creative-references/) in the shape the critic reads. */
export const referenceStory = (reference) => ({
  ...reference.episode,
  subject: {name: reference.subject},
  scenes: reference.episode.scenes.map((scene, index) => ({id: `${scene.role}-${index + 1}`, ...scene})),
});
