// Walkthrough writer (#128): writes the script of an architecture walkthrough
// from its diagram, and the notes, if any, about the system. The diagram's
// own labels and numbered steps (and the notes) are the only facts it may
// state. A script goes through the same gates as any episode: the compiler,
// the engagement audit and the story critic (judging it as an explainer),
// and is revised until it passes. The Diagram Director (#129) then times the
// picture to the words.
import {z} from 'zod';
import {archetypes} from '../archetypes.mjs';
import {episodeDraftSchema} from '../draft-schema.mjs';
import {archSpecSchema} from '../diagram-arch-schema.mjs';
import {LANDSCAPE_LIMITS} from './compiler.mjs';
import {creativeProblems, critiqueDraft} from './creative-critic.mjs';
import {directDiagram} from './diagram-director.mjs';
import {PASSING_SCORE, scoreEpisode} from './engagement.mjs';
import {textNumbers} from './geo-director.mjs';
import {styleGuideSection} from './shows.mjs';
import {parseReply} from './writer.mjs';

const PATTERN = 'walkthrough';

/** Notes about the system: facts the diagram doesn't show, and where they come from. */
export const notesSchema = z.object({
  facts: z.array(z.string().min(1).max(300)).max(40).default([]),
  sources: z.array(z.object({label: z.string().min(1), url: z.string().url()}).strict()).max(12).default([]),
}).strict();

export const scriptSchema = z.object({
  title: z.string().min(1).max(120),
  premise: z.string().min(1).max(140),
  audiencePromise: z.string().min(1).max(140),
  openLoop: z.string().min(1).max(140),
  payoff: z.string().min(1).max(140),
  targetEmotion: z.enum(['curiosity', 'surprise', 'debate', 'awe']),
  engagementQuestion: z.string().min(1).max(140),
  scenes: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    beat: z.string().optional(),
    eyebrow: z.string().max(40).optional(),
    headline: z.string().min(1).max(70),
    narration: z.string().min(1).max(260),
    caption: z.string().min(1).max(120),
  })).min(4).max(12),
});

const line = (text) => String(text).replace(/\n/g, ' ');

/**
 * Everything the episode may state, in plain words: the parts, the
 * boundaries, the routes between parts, each lane's numbered steps in order,
 * and the notes.
 */
export const sourceText = (spec, notes = {facts: []}) => {
  const nearest = (point) => spec.nodes.map((node) => ({node, d: Math.hypot(node.at[0] - point[0], node.at[1] - point[1])})).sort((a, b) => a.d - b.d)[0]?.node;
  // A part is named by its label's first line; the rest describes it ("Azure Managed Redis" / "Distributed cache").
  const name = (node) => node.label.split('\n')[0];
  const described = (node) => (node.label.includes('\n') ? `${name(node)}: ${line(node.label.split('\n').slice(1).join(' '))}` : name(node));
  const inside = (node) => spec.groups.filter((group) => node.at[0] >= group.box.x && node.at[0] <= group.box.x + group.box.w && node.at[1] >= group.box.y && node.at[1] <= group.box.y + group.box.h);
  const lanes = new Map((spec.legend ?? []).map((entry) => [entry.lane, entry.text]));
  const laneName = (lane) => lanes.get(lane) ?? `${lane} flow`;
  const out = ['Parts (name: what it is):', ...spec.nodes.map((node) => `- ${described(node)}${inside(node).length ? ` (inside ${inside(node).map((group) => group.label ?? 'a boundary').join(', ')})` : ''}`)];
  if (spec.groups.length) out.push('', 'Boundaries:', ...spec.groups.map((group) => `- ${group.label ?? 'an unlabelled boundary'}`));
  out.push('', 'Routes:', ...spec.edges.map((edge) => `- ${name(nearest(edge.points[0]))} → ${name(nearest(edge.points.at(-1)))} (${edge.lane === 'plain' ? 'link' : edge.lane === 'telemetry' ? 'monitoring' : laneName(edge.lane)})`));
  for (const lane of ['read', 'write']) {
    const steps = (spec.steps ?? []).filter((step) => step.lane === lane).sort((a, b) => a.n - b.n);
    if (steps.length) out.push('', `${laneName(lane)} (numbered steps, drawn as badges on the diagram):`, ...steps.map((step) => `${step.n}. ${line(step.text)}`));
  }
  if (spec.labels?.length) out.push('', 'Other text on the diagram:', ...spec.labels.map((label) => `- ${line(label.text)}`));
  if (notes.facts.length) out.push('', 'Notes about the system:', ...notes.facts.map((fact) => `- ${fact}`));
  return out.join('\n');
};

/** Every number the sources state, plus step numbers. */
const sourceNumbers = (spec, notes) => new Set([
  ...textNumbers(sourceText(spec, notes)),
  ...(spec.steps ?? []).map((step) => step.n),
]);

/** Numbers the script states that no source does. */
export const unsupportedNumbers = (draft, spec, notes) => {
  const allowed = sourceNumbers(spec, notes);
  const problems = [];
  for (const scene of draft.scenes) {
    for (const field of ['headline', 'narration', 'caption']) {
      for (const number of textNumbers(scene[field] ?? '')) {
        if (!allowed.has(number)) problems.push(`scene "${scene.id}" ${field} states ${number}, which neither the diagram nor the notes give: "${scene[field]}"`);
      }
    }
  }
  return problems;
};

const beatsText = () => archetypes[PATTERN].beats.map((beat) => `${beat.id} (${beat.minScenes === beat.maxScenes ? beat.minScenes : `${beat.minScenes}-${beat.maxScenes}`} scenes)`).join(' → ');

export const buildWalkthroughPrompt = ({draft, notes = {facts: []}, showId = draft.show?.id}) => {
  const spec = draft.diagram;
  const steps = (spec.steps ?? []).length;
  const system = `You are the head writer of ${draft.show?.name ?? 'an explainer series'}, videos that walk through how a software system works while its diagram builds on screen, element by element, as the narrator names it. Write the script for one walkthrough of the diagram below.

# Story shape
Beats, in order: ${beatsText()}. Set each scene's "beat" to its beat id.
- hook: one line that makes a developer want to know how this works: a cost, a puzzle or a promise drawn from the diagram.
- setup: the parts, named in the order a request meets them.
${steps ? `- flow: follow each numbered flow in order, one to three steps a scene, and cover every step. Tell it as the journey of one request: what happens at each step, and why that part is there.` : '- flow: follow the arrows through the system, one or two parts a scene, saying what each does and why.'}
- wrap (optional): what the design buys, or what it costs.
- verdict: a genuine either/or question a developer could argue.
Write 7-11 scenes in all (never more than 12).

# What makes it good
- Tension: open on a problem the design solves (e.g. every request hitting the database), and let each scene show how the next part answers it.
- Never read the diagram out: no "step one", "travels from X to Y", or label lists. The badges appear on screen as you speak; say what happens and why.
- Each scene says something new. The ending shows why the design works, not a summary.

# Hard limits
- State ONLY what the diagram and the notes give. Never invent products, numbers, latencies, failure stories or behaviour. Any number you state must appear in them. You may say what a well-known kind of part generally does (a cache keeps recent answers close; a queue lets work happen later) without adding claims about this system.
- Name each part by its name (before the colon) the first time it appears, e.g. "the ${(spec.nodes[0]?.label ?? 'API').split('\n')[0]}": the picture draws each element on the word that names it. After that, a short form is fine ("the cache").
- Hook narration: at most 10 words. Every other scene: 12-24 words (never more), spoken naturally, one idea a scene. Long product names count: use them once, then a short form. Each scene is at most ${LANDSCAPE_LIMITS.scene} seconds, the episode at most ${LANDSCAPE_LIMITS.total}; aim for 60-120 seconds in all.
- headline: at most 6 words, in capitals. caption: a short line, at most 8 words. eyebrow: the beat in a few words (e.g. "READ FLOW").
- The last scene's narration asks the either/or question (with "?" and "or").
- Write for the ear: short sentences, no lists, no jargon the diagram doesn't use.

# Output
Reply with a single JSON object only: {"title", "premise", "audiencePromise", "openLoop", "payoff" (each at most 140 characters; title at most 120), "targetEmotion" ("curiosity" | "surprise" | "debate" | "awe"), "engagementQuestion", "scenes": [{"id" (lowercase-slug), "beat", "eyebrow", "headline", "narration", "caption"}]}${showId ? styleGuideSection(showId) : ''}`;
  const user = `The diagram${draft.title ? ` (working title: "${draft.title}")` : ''}:\n${sourceText(spec, notes)}\n\nWrite the walkthrough.`;
  return {system, user};
};

/**
 * The episode a script makes: the base draft (diagram, rights, show, format)
 * with the script's fields and scenes. Each scene starts on the whole picture;
 * the director replaces that.
 */
export const assembleWalkthrough = (script, draft, notes = {facts: [], sources: []}) => ({
  ...draft,
  title: script.title,
  storyPattern: PATTERN,
  numberRelevant: false,
  premise: script.premise,
  audiencePromise: script.audiencePromise,
  openLoop: script.openLoop,
  payoff: script.payoff,
  targetEmotion: script.targetEmotion,
  engagementQuestion: script.engagementQuestion,
  format: 'landscape',
  scenes: script.scenes.map((scene) => ({...scene, primitive: {kind: 'diagram', actions: [{do: 'camera', focus: 'all', at: 0}]}})),
  ...(notes.sources.length ? {sources: notes.sources} : {}),
});

/**
 * Check a script's episode: the draft schema, the compiler (with the
 * director's fallback, which needs no model), unsupported numbers, and the
 * engagement audit. Returns the problems, and the directed draft and manifest.
 */
export const evaluateWalkthrough = async (draft, {notes, showId}) => {
  const parsed = episodeDraftSchema.safeParse(draft);
  if (!parsed.success) return {problems: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'draft'}: ${issue.message}`)};
  let directed;
  try {
    directed = await directDiagram({draft, showId});
  } catch (error) {
    return {problems: [error instanceof Error ? error.message : String(error)]};
  }
  const problems = unsupportedNumbers(draft, draft.diagram, notes);
  const audit = scoreEpisode(directed.manifest);
  if (!audit.passed) problems.push(`Production audit scored ${audit.score}/100 (needs ${PASSING_SCORE}). Failed checks: ${audit.checks.filter((check) => !check.passed).map((check) => check.label).join(', ')}.`);
  return {problems, draft: directed.draft, manifest: directed.manifest, audit};
};

/**
 * Write a walkthrough. `draft` carries the diagram (e.g. the importer's
 * starter draft); `notes` ({facts, sources}) add what the diagram doesn't
 * show. `complete` writes, `critique` judges the story, `direct` times the
 * picture (each optional but `complete`). Each rejected script is revised
 * with its problems; once the attempts run out, the best script that passes
 * production is returned, flagged `belowBar` if the critic never passed it.
 */
export const writeWalkthrough = async ({draft, notes: rawNotes = {}, complete, critique, direct, showId = draft.show?.id, maxAttempts = 3, onAttempt = () => {}}) => {
  if (draft.diagram?.theme !== 'architecture') throw new Error(`${draft.id} has no architecture diagram to walk through (import one with npm run diagram:import).`);
  archSpecSchema.parse(draft.diagram);
  const notes = notesSchema.parse(rawNotes);
  const {system, user} = buildWalkthroughPrompt({draft, notes, showId});
  const brief = {role: 'user', content: user};
  let messages = [brief];
  let best;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await complete({system, messages});
    let problems;
    let candidate;
    try {
      const script = scriptSchema.safeParse(parseReply(reply));
      if (!script.success) problems = script.error.issues.map((issue) => `${issue.path.join('.') || 'reply'}: ${issue.message}`);
      else {
        const episode = assembleWalkthrough(script.data, draft, notes);
        const result = await evaluateWalkthrough(episode, {notes, showId});
        problems = result.problems;
        if (!problems.length) {
          const review = await critiqueDraft({draft: {...episode, subject: episode.subject ?? {name: episode.title}}, complete: critique, kind: 'explainer', sources: sourceText(draft.diagram, notes)});
          // The critic's own suggestions help here: its only sources are the diagram and the notes, which the writer has too.
          problems = review.passed ? [] : [...creativeProblems(review), ...(review.criteria ?? []).filter((item) => item.score < 4 && item.revision).map((item) => `Critic's suggestion for ${item.criterion}: ${item.revision}`)];
          candidate = {episode, script: script.data, review, audit: result.audit, storyPassed: review.passed};
          if (!best || (review.score ?? 0) > (best.review.score ?? 0) || (review.passed && !best.storyPassed)) best = candidate;
        }
      }
    } catch (error) {
      problems = [`Could not read the reply as JSON: ${error instanceof Error ? error.message : String(error)}`];
    }
    onAttempt({attempt, problems, review: candidate?.review, audit: candidate?.audit});
    if (candidate?.storyPassed) { best = candidate; break; }
    messages = [brief, {role: 'assistant', content: reply}, {role: 'user', content: `The script was rejected. Fix every problem below and reply with the complete corrected JSON object only. Keep what already works, and keep every scene within its word limit (a suggested line may need shortening).\n${problems.map((problem, index) => `${index + 1}. ${problem}`).join('\n')}`}];
  }
  if (!best) throw new Error(`The writer could not produce a walkthrough that passes production after ${maxAttempts} attempts.`);
  // The script is settled: time the picture to its words.
  const directed = await directDiagram({draft: best.episode, complete: direct, showId});
  return {
    draft: directed.draft, manifest: directed.manifest, audit: scoreEpisode(directed.manifest), review: best.review,
    direction: {assigned: directed.assigned, fallbacks: directed.fallbacks, ...(directed.modelError ? {modelError: directed.modelError} : {})},
    ...(best.storyPassed ? {} : {belowBar: true}),
  };
};
