// Writer agent: turns a research record into a creative draft, then checks
// it with the same compiler and audits every other episode goes through.
// The model writes only creative fields; identity, artwork URLs, rights and
// sources are filled in from the research so they can't be invented.
import {z} from 'zod';
import {archetypes} from '../archetypes.mjs';
import {episodeDraftSchema} from '../draft-schema.mjs';
import {compileEpisode} from './compiler.mjs';
import {scoreEpisode} from './engagement.mjs';
import {describeAngle} from './angles.mjs';
import {creativeProblems, critiqueDraft} from './creative-critic.mjs';
import {verificationProblems, verifyDraft} from './fact-verifier.mjs';
import {loadShow} from './shows.mjs';
import {TIER_GUIDANCE, TIERS, tierRules} from './source-tiers.mjs';

const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const creativeSchema = z.object({
  title: z.string().min(1).max(120),
  storyPattern: z.string().min(1),
  numberRelevant: z.boolean().default(false),
  premise: z.string().min(1).max(140),
  audiencePromise: z.string().min(1).max(140),
  openLoop: z.string().min(1).max(140),
  payoff: z.string().min(1).max(140),
  targetEmotion: z.enum(['curiosity', 'surprise', 'debate', 'awe']),
  engagementQuestion: z.string().min(1).max(140),
  palette: z.object({background: color, surface: color, primary: color, secondary: color, ink: color}),
  voiceInstructions: z.string().min(1).max(1000),
  scenes: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    beat: z.string().optional(),
    eyebrow: z.string().max(40).optional(),
    headline: z.string().min(1).max(70),
    narration: z.string().min(1).max(260),
    caption: z.string().min(1).max(120),
    facts: z.array(z.string().min(1).max(45)).max(4).optional(),
    accent: color.optional(),
    artwork: z.string().optional(),
  })).min(3).max(12),
});

/** A show's rights notices, in the draft's field names (from shows/<id>.json). */
export const showNotices = (showId) => {
  const {notices} = loadShow(showId);
  return {ownershipNotice: notices.ownership, nonAffiliationNotice: notices.nonAffiliation};
};

/** Every piece of artwork the writer may use, by name. */
export const artworkChoices = (research) => {
  const choices = new Map([[research.name.toLowerCase(), {name: research.name, index: research.index, artworkUrl: research.artworkUrl}]]);
  for (const member of research.evolutionChain) choices.set(member.name.toLowerCase(), {name: member.name, index: member.index, artworkUrl: member.artworkUrl});
  for (const variety of research.varieties) choices.set(variety.name.toLowerCase(), {name: variety.name, index: research.index, artworkUrl: variety.artworkUrl});
  return choices;
};

/** Numbers found in the research, which are the only numbers an episode may state. */
export const researchNumbers = (research) => {
  const text = JSON.stringify(research, (key, value) => (key === 'artworkUrl' || key === 'url' ? undefined : value));
  const numbers = new Set((text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
  // Counts the writer can derive directly from the record.
  for (const count of [research.evolutionChain.length, research.types.length, research.varieties.length + 1, 1]) numbers.add(count);
  return numbers;
};

const numbersIn = (text) => (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((token) => Number(token.replace(/,/g, '')));

/** Reject any number the research doesn't contain. */
export const factCheck = (draft, research) => {
  const allowed = researchNumbers(research);
  const problems = [];
  const fields = [
    ['title', draft.title], ['premise', draft.premise], ['audiencePromise', draft.audiencePromise], ['openLoop', draft.openLoop],
    ['payoff', draft.payoff], ['engagementQuestion', draft.engagementQuestion], ['voiceInstructions', draft.voice?.instructions ?? ''],
    ...draft.scenes.flatMap((scene) => [
      [`scene "${scene.id}" narration`, scene.narration], [`scene "${scene.id}" headline`, scene.headline],
      [`scene "${scene.id}" caption`, scene.caption], [`scene "${scene.id}" eyebrow`, scene.eyebrow ?? ''],
      ...(scene.facts ?? []).map((fact) => [`scene "${scene.id}" fact`, fact]),
    ]),
  ];
  for (const [where, text] of fields) {
    for (const number of numbersIn(text)) {
      if (!allowed.has(number)) problems.push(`${where} states the number ${number}, which is not in the research. Use only numbers from the research, or say it without a number.`);
    }
  }
  return problems;
};

/** Build a full draft from the writer's creative fields plus researched facts. */
export const assembleDraft = (creative, research, {showId = 'pokepulses'} = {}) => {
  const choices = artworkChoices(research);
  const problems = [];
  const used = new Map();
  const scenes = creative.scenes.map((scene) => {
    const {artwork, ...rest} = scene;
    const choice = choices.get((artwork ?? research.name).toLowerCase());
    if (!choice) problems.push(`scene "${scene.id}" uses artwork "${artwork}", which doesn't exist. Choose one of: ${[...choices.values()].map((item) => item.name).join(', ')}.`);
    const picked = choice ?? choices.get(research.name.toLowerCase());
    used.set(picked.artworkUrl, picked);
    return {...rest, artworkUrl: picked.artworkUrl};
  });

  // The renderer's before/after and VS partner is the first related subject,
  // so order them: later evolutions (the final stage first), then earlier
  // stages (the nearest first), then same-stage branches, then alternate forms.
  const subjectStage = research.evolutionChain.find((member) => member.isSubject)?.stage ?? 1;
  const others = research.evolutionChain.filter((member) => !member.isSubject);
  const byStageDescending = (a, b) => b.stage - a.stage;
  const related = [
    ...others.filter((member) => member.stage > subjectStage).sort(byStageDescending).map((member) => ({...member, relation: 'evolves-to'})),
    ...others.filter((member) => member.stage < subjectStage).sort(byStageDescending).map((member) => ({...member, relation: 'evolves-from'})),
    ...others.filter((member) => member.stage === subjectStage).map((member) => ({...member, relation: 'related'})),
    ...research.varieties.map((variety) => ({...variety, index: research.index, relation: 'form'})),
  ].slice(0, 3).map(({name, relation, index, artworkUrl}) => ({name, relation, artworkUrl, identifier: index}));

  const draft = {
    id: research.id,
    title: creative.title,
    storyPattern: creative.storyPattern,
    numberRelevant: creative.numberRelevant,
    premise: creative.premise,
    audiencePromise: creative.audiencePromise,
    openLoop: creative.openLoop,
    payoff: creative.payoff,
    targetEmotion: creative.targetEmotion,
    engagementQuestion: creative.engagementQuestion,
    subject: {name: research.name, category: research.category, artworkUrl: research.artworkUrl, identifier: research.index},
    related,
    palette: creative.palette,
    // Voice and speed come from the show profile; the writer sets the delivery.
    voice: {instructions: creative.voiceInstructions},
    rights: {
      releaseStatus: 'internal-prototype',
      publicReleaseApproved: false,
      ...showNotices(showId),
      assets: [...used.values()].map((item) => ({
        kind: `${item.name} official artwork mirror`,
        sourceUrl: item.artworkUrl,
        owner: 'The Pokémon Company / Nintendo / Creatures / GAME FREAK',
        licenseStatus: 'unverified',
        publicReleaseApproved: false,
        notes: 'Internal prototype only pending legal review or replacement.',
      })),
    },
    scenes,
    sources: research.sources,
  };
  return {draft, problems, showId};
};

/** Run a draft through every gate. Returns the problems found (empty when it passes). */
export const evaluateDraft = (draft, research, {showId = 'pokepulses'} = {}) => {
  const parsed = episodeDraftSchema.safeParse(draft);
  if (!parsed.success) return {problems: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'draft'}: ${issue.message}`)};
  let manifest;
  try {
    ({manifest} = compileEpisode(draft, {showId}));
  } catch (error) {
    return {problems: [error.message]};
  }
  const problems = factCheck(draft, research);
  const audit = scoreEpisode(manifest);
  if (!audit.passed) problems.push(`Production audit scored ${audit.score}/100 (needs 80). Failed checks: ${audit.checks.filter((check) => !check.passed).map((check) => check.label).join(', ')}.`);
  return {problems, manifest, audit};
};

const describeArchetypes = () => Object.entries(archetypes).map(([name, archetype]) => {
  const beats = archetype.beats.map((beat) => `${beat.id} (${beat.minScenes === beat.maxScenes ? beat.minScenes : `${beat.minScenes}-${beat.maxScenes}`})`).join(' → ');
  return `- ${name}: ${archetype.description} Beats: ${beats}`;
}).join('\n');

/** The writer's instructions: the directing contract, the format and hard limits. */
export const buildWriterPrompt = ({research, directing, references = [], storyPattern, angle}) => {
  const shape = storyPattern || angle?.archetype;
  const artworkNames = [...artworkChoices(research).values()].map((item) => item.name).join(', ');
  const system = `You are the head writer of PokePulses, a vertical short-form video series about Pokémon. You turn researched facts into one tight, surprising story.

${directing}

# Output
Reply with a single JSON object and nothing else, with exactly these fields:
title (max 120 chars), storyPattern, numberRelevant (boolean), premise, audiencePromise, openLoop, payoff (each max 140 chars), targetEmotion ("curiosity" | "surprise" | "debate" | "awe"), engagementQuestion (max 140 chars), palette {background, surface, primary, secondary, ink as #rrggbb}, voiceInstructions, scenes[] {id (lowercase-slug), beat (optional), eyebrow (optional, max 40 chars), headline (max 70 chars), narration, caption (max 120 chars), facts (optional, up to 4 short labels, max 45 chars each), accent (optional #rrggbb), artwork (one of: ${artworkNames})}.

# Story shapes (storyPattern)
${describeArchetypes()}
Scenes fill beats in order, each beat taking its minimum number of scenes. To give a beat an extra scene, set "beat" on that scene to the beat's id. Beats must stay in order.${shape ? `\nUse storyPattern "${shape}".` : '\nPick the story shape that makes the strongest story for this Pokémon.'}
${angle ? `
# The angle
The creative director chose this angle. Build the whole episode around this one idea: the hook states it, every beat escalates it, the payoff resolves it. Don't drift into unrelated facts.
${describeAngle(angle, research)}
` : ''}
# Source tiers
Research fields differ in how safely they can be stated:
${TIERS.map((tier) => `- ${tier} (${tierRules(research)[tier].join(', ')}): ${TIER_GUIDANCE[tier]}`).join('\n')}

# Hard limits
- Use ONLY facts from the research. Never invent events, dates, numbers, moves or lore. Any number you state must appear in the research, or be a simple count of its types, evolution stages or forms.
- Paraphrase freely and punchily, but never make a fact stronger than the research: if it says a Pokémon "stops moving", don't upgrade that to "is paralysed" or "dies".
- Hook scene (first): narration at most 9 words; headline at most 8 words. It must create tension in the first second.
- Other scenes: narration 9-14 words, spoken naturally, one idea per scene. Numbers and punctuation take longer to say, so use fewer words in lines that contain them.
- Aim for 6-8 scenes and 24-45 seconds in total.
- Last scene: a genuine either/or question to the viewer (use "?" and "or"/"which").
- Pokédex numbers only appear if numberRelevant is true, and only when the number is part of the story.
- Palette: dark background and surface, high-contrast ink, accents that fit the Pokémon's colors.
- voiceInstructions: tone and pacing for the narrator. Never ask it to imitate a known person or character.`;

  const referenceText = references.map((reference) => `## ${reference.subject} (${reference.archetypes.join(', ')})
Why it works:
${reference.whyItWorks.map((note) => `- ${note}`).join('\n')}
Episode:
${JSON.stringify(reference.episode, null, 2)}`).join('\n\n');
  const referenceIntro = references.length
    ? `Reference episodes: curated winners from this series. Learn the craft (one sharp idea, concrete specifics, escalating reveals, an earned payoff, a real either/or question). Never copy their content, structure word-for-word or phrasing.\n\n${referenceText}\n\n`
    : '';
  const user = `Research:\n${JSON.stringify(research, null, 2)}\n\n${referenceIntro}Write the episode.`;
  return {system, user};
};

/** Extract the JSON object from a model reply. */
export const parseReply = (text) => {
  const unfenced = text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The reply did not contain a JSON object.');
  return JSON.parse(unfenced.slice(start, end + 1));
};

/** Most unsupported lines a story-approved draft may have and still be repaired line by line. */
export const REPAIRABLE_LINES = 4;

/** Location of a line in a creative reply: "payoff", "scenes.<id>.caption", "scenes.<id>.facts[1]". */
const LINE = /^(?:(title|premise|audiencePromise|openLoop|payoff|engagementQuestion)|scenes\.([a-z0-9-]+)\.(eyebrow|headline|narration|caption|facts)(?:\[(\d+)\])?)$/;

/**
 * Replace single lines of a creative reply, e.g. {"scenes.hook.caption": "..."}.
 * An empty replacement drops a facts label. Returns the patched copy and any
 * locations that couldn't be applied.
 */
export const patchLines = (creative, patches) => {
  const patched = structuredClone(creative);
  const unknown = [];
  const dropped = new Map();
  for (const [where, text] of Object.entries(patches ?? {})) {
    const match = typeof text === 'string' ? where.match(LINE) : null;
    const scene = match?.[2] ? patched.scenes.find((item) => item.id === match[2]) : undefined;
    if (!match || (match[2] && !scene)) {
      unknown.push(where);
    } else if (match[1]) {
      patched[match[1]] = text;
    } else if (match[3] === 'facts') {
      const index = Number(match[4]);
      if (!Array.isArray(scene.facts) || match[4] === undefined || index >= scene.facts.length) unknown.push(where);
      else if (text.trim()) scene.facts[index] = text;
      else dropped.set(scene, [...(dropped.get(scene) ?? []), index]);
    } else {
      scene[match[3]] = text;
    }
  }
  for (const [scene, indexes] of dropped) scene.facts = scene.facts.filter((_, index) => !indexes.includes(index));
  return {creative: patched, unknown};
};

const repairRequest = (problems) => `The story is settled. Only these lines are not supported by the research:
${problems.map((problem, index) => `${index + 1}. ${problem}`).join('\n')}

Rewrite only these lines, keeping their role in the story, using only researched facts (a faithful, punchy paraphrase is fine; never a stronger claim). To drop a facts label, use "". Reply with a JSON object only, mapping each location to its new text, e.g. {"scenes.hook.caption": "..."}.`;

/** Better attempts sort first: passes production, story approved, fewest fact problems, highest story score. */
const rank = (attempt) => [attempt.production ? 1 : 0, attempt.storyPassed ? 1 : 0, -(attempt.factProblems ?? 99), attempt.score ?? -1];
const better = (a, b) => {
  if (!b) return true;
  const [x, y] = [rank(a), rank(b)];
  for (let index = 0; index < x.length; index++) if (x[index] !== y[index]) return x[index] > y[index];
  return false;
};

/**
 * Write an episode draft. `complete({system, messages})` returns the model's
 * reply text; injected so tests can script replies.
 *
 * `verify` checks factual claims (a model completion for the Fact Verifier);
 * without it only the verifier's deterministic rules run. `critique` is the
 * creative critic's completion; without it the story isn't judged.
 *
 * Production (schema, compiler, audit, numbers) and facts are hard gates. The
 * story is judged alongside facts, but a model's taste score is noisy and
 * revising towards it doesn't converge, so it gets `storyRevisions` full
 * revisions; after that the best-scoring draft whose facts pass (or can be
 * repaired) is accepted and flagged `belowBar` for a person to review.
 * `strictStory` restores the story as a hard gate. When the story is settled
 * and only a few lines are unsupported, the writer rewrites just those lines
 * and they are patched in. Every writer call counts as an attempt; on failure
 * the error carries the best attempt (`error.best`).
 */
export const writeEpisode = async ({research, complete, verify, critique, directing, references = [], storyPattern, angle, showId = 'pokepulses', maxAttempts = 3, storyRevisions = 1, strictStory = false, onAttempt = () => {}}) => {
  const {system, user} = buildWriterPrompt({research, directing, references, storyPattern, angle});
  const shape = storyPattern || angle?.archetype;
  const brief = {role: 'user', content: user};
  // Each revision sends only the brief, the latest draft and its problems, not
  // the whole history: earlier drafts cost tokens on every call and add nothing.
  let messages = [brief];
  const revise = (draft, feedback) => {
    messages = [brief, {role: 'assistant', content: draft}, {role: 'user', content: feedback}];
  };
  const accept = (candidate, attempt, repaired) => ({
    draft: candidate.draft, manifest: candidate.manifest, audit: candidate.audit, verification: candidate.verification, creative: candidate.review, attempts: attempt,
    ...(candidate.storyPassed ? {} : {belowBar: true}),
    ...(repaired ? {repaired} : {}),
  });
  let problems = [];
  let best;
  // Every draft the critic judged, for picking the best once story revisions run out.
  const judged = [];
  // Every draft that passed production.
  const drafts = [];
  // The story's final verdict ({review, storyPassed}) once it is settled.
  let verdict;
  // Set while repairing single lines of a draft whose story is settled.
  let approved;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await complete({system, messages});
    let creativeData;
    let result;
    let verification;
    let review = approved?.review;
    let repaired;
    // The draft the next revision starts from (the settled one, once the story is settled).
    let carryFrom = reply;
    try {
      const parsed = parseReply(reply);
      // A model may answer a repair request with a whole draft: judge it as one.
      if (approved && creativeSchema.safeParse(parsed).success) {
        approved = undefined;
        review = undefined;
      }
      if (approved) {
        const {creative: patched, unknown} = patchLines(approved.creative, parsed);
        creativeData = patched;
        repaired = Object.keys(parsed).filter((where) => !unknown.includes(where));
        problems = unknown.map((where) => `"${where}" is not a line of the draft. Use the locations exactly as listed.`);
      } else {
        const creative = creativeSchema.safeParse(parsed);
        if (creative.success) creativeData = creative.data;
        problems = creative.success ? [] : creative.error.issues.map((issue) => `${issue.path.join('.') || 'reply'}: ${issue.message}`);
      }
      if (creativeData && !problems.length) {
        const assembled = assembleDraft(creativeData, research, {showId});
        result = evaluateDraft(assembled.draft, research, {showId});
        problems = [...assembled.problems, ...result.problems];
        if (shape && creativeData.storyPattern !== shape) problems.unshift(`storyPattern is "${creativeData.storyPattern}", but this episode must use "${shape}".`);
        if (problems.length === 0) {
          // Facts and story are judged together; a repaired draft keeps its story review.
          verification = await verifyDraft({draft: assembled.draft, research, complete: verify});
          const factProblems = verificationProblems(verification);
          // The story stays open to revision until it passes or (unless strict) its revisions are used up;
          // after that, drafts inherit the settled verdict instead of being judged again.
          const storyOpen = !verdict && (strictStory || judged.length <= storyRevisions);
          if (storyOpen) review = await critiqueDraft({draft: assembled.draft, research, angle, complete: critique});
          else review = verdict?.review ?? review;
          const storyProblems = storyOpen ? creativeProblems(review) : [];
          const candidate = {
            draft: assembled.draft, creative: creativeData, manifest: result.manifest, audit: result.audit, verification, review,
            production: true, storyPassed: storyOpen ? storyProblems.length === 0 : Boolean(verdict?.storyPassed), factProblems: factProblems.length, factList: factProblems, score: review?.score,
          };
          if (storyOpen) judged.push(candidate);
          drafts.push(candidate);
          let settled = candidate;
          if (storyOpen && (candidate.storyPassed || (!strictStory && judged.length > storyRevisions))) {
            // Settling now: carry on from the best-scoring judged draft that can still pass on facts.
            if (!candidate.storyPassed) settled = [...judged].filter((item) => item.factProblems <= REPAIRABLE_LINES).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.factProblems - b.factProblems)[0] ?? candidate;
            verdict = {review: settled.review, storyPassed: settled.storyPassed};
          }
          const storySettled = Boolean(verdict);
          if (storySettled) carryFrom = JSON.stringify(settled.creative);
          problems = [...factProblems, ...(storySettled ? [] : storyProblems)];
          candidate.problems = problems;
          if (better(candidate, best)) best = candidate;
          if (storySettled && settled.factProblems === 0) {
            onAttempt({attempt, problems: [], audit: settled.audit, verification: settled.verification, creative: settled.review, repaired, belowBar: !settled.storyPassed});
            return accept(settled, attempt, repaired);
          }
          if (storySettled && settled.factProblems <= REPAIRABLE_LINES) {
            approved = {creative: settled.creative, review: settled.review};
            onAttempt({attempt, problems, audit: settled.audit, verification: settled.verification, creative: settled.review, repaired, repairing: settled.factList});
            revise(JSON.stringify(settled.creative), repairRequest(settled.factList));
            continue;
          }
        }
      }
    } catch (error) {
      problems = [`Could not read the reply as JSON: ${error.message}`];
    }
    if (!best && creativeData && result?.problems) best = {creative: creativeData, production: false, problems};
    onAttempt({attempt, problems, audit: result?.audit, verification, creative: approved ? undefined : review, repaired});
    if (approved) {
      // The repair broke something: go back to full revisions from the settled draft.
      revise(JSON.stringify(approved.creative), `That repair didn't pass. Reply with the complete corrected JSON object only, starting from your draft above and fixing every problem below.\n${problems.map((problem, index) => `${index + 1}. ${problem}`).join('\n')}`);
      approved = undefined;
      continue;
    }
    revise(carryFrom, `The draft was rejected. Fix every problem below and reply with the complete corrected JSON object only. Keep what already works: change only what these problems need.\n${problems.map((problem, index) => `${index + 1}. ${problem}`).join('\n')}`);
  }
  // Out of attempts: a draft whose facts pass is still worth keeping, flagged for review.
  const factClean = drafts.filter((item) => item.factProblems === 0).sort((a, b) => Number(b.storyPassed) - Number(a.storyPassed) || (b.score ?? 0) - (a.score ?? 0))[0];
  if (factClean && !strictStory) return accept(factClean, maxAttempts);
  const error = new Error(`The writer could not produce a draft that passes every check after ${maxAttempts} attempts:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  error.problems = problems;
  error.attempts = maxAttempts;
  error.best = best;
  throw error;
};
