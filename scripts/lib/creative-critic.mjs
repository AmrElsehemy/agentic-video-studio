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

const criterionSchema = z.object({
  score: z.number().int().min(1).max(5),
  quote: z.string().default(''),
  revision: z.string().default(''),
});

export const buildCreativeCriticPrompt = ({draft, research, angle}) => ({
  system: `You are the creative director of PokePulses, a vertical short-form video series about Pokémon. Production checks (timing, shots, structure) have already passed; judge only whether this is a story people would watch to the end and argue about.

Score each criterion from 1 (poor) to 5 (excellent). Be strict: a competent but forgettable draft scores 3.
${Object.entries(CREATIVE_CRITERIA).map(([key, description]) => `- ${key}: ${description}`).join('\n')}

For each, quote the exact words from the draft your score is based on, and give one concrete revision (what to change and how), or "" if it scores 5.

Reply with a JSON object only: {${Object.keys(CREATIVE_CRITERIA).map((key) => `"${key}": {"score": 1-5, "quote": "...", "revision": "..."}`).join(', ')}}`,
  messages: [{role: 'user', content: `${angle ? `The chosen angle: ${angle.premise}\n\n` : ''}${research ? `Research (for judging specificity):\n${JSON.stringify({name: research.name, category: research.category, types: research.types, pokedexEntries: research.pokedexEntries, evolutionChain: research.evolutionChain.map(({name, method}) => ({name, method})), varieties: research.varieties.map(({name, types}) => ({name, types}))}, null, 2)}\n\n` : `Subject: ${draft.subject.name}\n\n`}Draft:\n${JSON.stringify({title: draft.title, premise: draft.premise, openLoop: draft.openLoop, payoff: draft.payoff, engagementQuestion: draft.engagementQuestion, scenes: draft.scenes.map(({id, headline, narration, caption}) => ({id, headline, narration, caption}))}, null, 2)}`}],
});

/**
 * Critique a draft. Without `complete` the model half is skipped and the
 * draft is not judged (reported as `skipped`); a model failure is reported
 * as `modelError` rather than blocking the episode.
 */
export const critiqueDraft = async ({draft, research, angle, complete}) => {
  const findings = deterministicCritique(draft);
  if (!complete) return {skipped: true, passed: true, findings};
  let reply;
  try {
    reply = parseJsonReply(await complete(buildCreativeCriticPrompt({draft, research, angle})));
  } catch (error) {
    return {skipped: true, passed: true, findings, modelError: error instanceof Error ? error.message : String(error)};
  }
  const criteria = Object.keys(CREATIVE_CRITERIA).map((criterion) => {
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

/** Writer feedback: every criterion below 4, weakest first, with its quote and revision. */
export const creativeProblems = (review) => {
  if (review.passed || !review.criteria) return [];
  return [...review.criteria]
    .filter((item) => item.score < 4)
    .sort((a, b) => a.score - b.score)
    .map((item) => `Creative ${item.criterion} scored ${item.score}/5${item.quote ? ` ("${item.quote}")` : ''}: ${item.revision || CREATIVE_CRITERIA[item.criterion]}`)
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
