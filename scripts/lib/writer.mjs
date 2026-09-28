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
import {DEFAULT_TIERS, TIER_GUIDANCE, TIERS} from './source-tiers.mjs';

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

export const POKEPULSES_NOTICES = {
  ownershipNotice: 'Pokémon and Pokémon character names are trademarks of Nintendo. Pokémon artwork and related intellectual property are © Pokémon / Nintendo / Creatures / GAME FREAK. All rights belong to their respective owners.',
  nonAffiliationNotice: 'PokePulses is an unofficial fan-made educational project and is not affiliated with, endorsed by, or sponsored by The Pokémon Company, Nintendo, Creatures Inc., or GAME FREAK inc.',
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

  // Later evolutions first (the renderer's before/after uses the first),
  // then earlier stages, then alternate forms.
  const subjectStage = research.evolutionChain.find((member) => member.isSubject)?.stage ?? 1;
  const others = research.evolutionChain.filter((member) => !member.isSubject);
  const related = [
    ...others.filter((member) => member.stage > subjectStage),
    ...others.filter((member) => member.stage <= subjectStage),
    ...research.varieties.map((variety) => ({...variety, index: research.index})),
  ].slice(0, 3).map(({name, index, artworkUrl}) => ({name, index, artworkUrl}));

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
    subject: {name: research.name, index: research.index, category: research.category, artworkUrl: research.artworkUrl},
    evolutions: related,
    palette: creative.palette,
    voice: {voice: 'marin', speed: 1.08, instructions: creative.voiceInstructions},
    rights: {
      releaseStatus: 'internal-prototype',
      publicReleaseApproved: false,
      ...POKEPULSES_NOTICES,
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
title, storyPattern, numberRelevant (boolean), premise, audiencePromise, openLoop, payoff, targetEmotion ("curiosity" | "surprise" | "debate" | "awe"), engagementQuestion, palette {background, surface, primary, secondary, ink as #rrggbb}, voiceInstructions, scenes[] {id (lowercase-slug), beat (optional), eyebrow (optional, max 40 chars), headline (max 70 chars), narration, caption (max 120 chars), facts (optional, up to 4 short labels, max 45 chars each), accent (optional #rrggbb), artwork (one of: ${artworkNames})}.

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
${TIERS.map((tier) => `- ${tier} (${(research.tiers ?? DEFAULT_TIERS)[tier].join(', ')}): ${TIER_GUIDANCE[tier]}`).join('\n')}

# Hard limits
- Use ONLY facts from the research. Never invent events, dates, numbers, moves or lore. Any number you state must appear in the research, or be a simple count of its types, evolution stages or forms.
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

/**
 * Write an episode draft, revising until it passes every gate or attempts run out.
 * `complete({system, messages})` returns the model's reply text; injected so
 * tests can script replies.
 */
/**
 * `verify` checks factual claims (a model completion for the Fact Verifier);
 * without it only the verifier's deterministic rules run. `critique` is the
 * creative critic's completion; without it the story isn't judged.
 * Gates run in order: production (schema, compiler, audit, numbers), facts, creative.
 */
export const writeEpisode = async ({research, complete, verify, critique, directing, references = [], storyPattern, angle, showId = 'pokepulses', maxAttempts = 3, onAttempt = () => {}}) => {
  const {system, user} = buildWriterPrompt({research, directing, references, storyPattern, angle});
  const shape = storyPattern || angle?.archetype;
  const messages = [{role: 'user', content: user}];
  let problems = [];
  let lastCreative;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await complete({system, messages});
    messages.push({role: 'assistant', content: reply});
    let result;
    try {
      const creative = creativeSchema.safeParse(parseReply(reply));
      if (!creative.success) {
        problems = creative.error.issues.map((issue) => `${issue.path.join('.') || 'reply'}: ${issue.message}`);
      } else {
        const assembled = assembleDraft(creative.data, research, {showId});
        result = evaluateDraft(assembled.draft, research, {showId});
        problems = [...assembled.problems, ...result.problems];
        if (shape && creative.data.storyPattern !== shape) problems.unshift(`storyPattern is "${creative.data.storyPattern}", but this episode must use "${shape}".`);
        if (problems.length === 0) {
          // Only drafts that pass every production gate are fact-checked.
          const verification = await verifyDraft({draft: assembled.draft, research, complete: verify});
          problems = verificationProblems(verification);
          if (problems.length === 0) {
            // Only true drafts are judged as stories.
            const review = await critiqueDraft({draft: assembled.draft, research, angle, complete: critique});
            problems = creativeProblems(review);
            if (problems.length === 0) {
              onAttempt({attempt, problems, audit: result.audit, verification, creative: review});
              return {draft: assembled.draft, manifest: result.manifest, audit: result.audit, verification, creative: review, attempts: attempt};
            }
            lastCreative = review;
          }
        }
      }
    } catch (error) {
      problems = [`Could not read the reply as JSON: ${error.message}`];
    }
    onAttempt({attempt, problems, audit: result?.audit, creative: lastCreative});
    lastCreative = undefined;
    messages.push({role: 'user', content: `The draft was rejected. Fix every problem below and reply with the complete corrected JSON object only.\n${problems.map((problem, index) => `${index + 1}. ${problem}`).join('\n')}`});
  }
  const error = new Error(`The writer could not produce a draft that passes every check after ${maxAttempts} attempts:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  error.problems = problems;
  throw error;
};
