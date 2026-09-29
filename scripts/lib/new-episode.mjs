// End-to-end episode creation: research → write → check → save.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getArchetype} from '../archetypes.mjs';
import {findAngle, MIN_ANGLE_SCORE} from './angles.mjs';
import {TIERS} from './source-tiers.mjs';
import {serializeManifest} from './compiler.mjs';
import {researchPokemon} from './pokeapi.mjs';
import {loadReferences, selectReferences} from './references.mjs';
import {directVisuals} from './visual-director.mjs';
import {writeEpisode} from './writer.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const writerStructureBrief = (shape) => {
  if (!shape) return '';
  const archetype = getArchetype(shape);
  const minimumPlan = archetype.beats.flatMap((beat) => Array.from({length: beat.minScenes}, () => beat.id));
  const allowed = archetype.beats.map((beat) => `${beat.id} (${beat.minScenes}-${beat.maxScenes})`).join(', ');
  return `\n\n# Exact structure for this episode\nThe storyPattern is ${shape}. Do not infer the scene structure yourself.\nUse this exact minimum beat sequence, in this order: ${minimumPlan.join(' → ')}.\nSet the \"beat\" field explicitly on EVERY scene. Valid beat ids and ranges: ${allowed}.\nStart with exactly ${minimumPlan.length} scenes following that minimum sequence. Add extra scenes only when they materially improve the story and never exceed a beat's maximum. Never invent a beat id such as \"interaction\" unless it is explicitly listed above.\nvoiceInstructions MUST be a plain JSON string, never an object.\nNarration timing is a hard production constraint, not a suggestion: keep non-hook narration to 8-11 spoken words, and keep the final either/or question to at most 10 spoken words. Prefer short common words. Avoid semicolons, em dashes, parenthetical phrases, and stacked clauses because they speak slowly. Never use 12+ words unless the line is exceptionally short in syllables.\nBefore replying, count the scenes per beat and verify every minimum/maximum above is satisfied. Then count the spoken words in every narration line and shorten any line that could approach the 6.4-second scene ceiling.`;
};

const rankedAngleFallbacks = (angles, limit = 3) => {
  const ranked = angles.rounds
    .flatMap((round) => round.candidates)
    .filter((candidate) => candidate.total !== undefined && candidate.total >= MIN_ANGLE_SCORE)
    .sort((a, b) => b.total - a.total);
  const unique = new Map([[angles.chosen.id, angles.chosen]]);
  for (const candidate of ranked) if (!unique.has(candidate.id)) unique.set(candidate.id, candidate);
  return [...unique.values()].slice(0, limit);
};

/**
 * Create an episode from a National Pokédex number.
 * Research is cached in research/<show>/<id>.json; pass refreshResearch to refetch.
 * `ideate` is the completion for the Angle Generator and Critic (default: the
 * writer's); pass null to let the writer find its own angle. `critique` is the
 * creative critic's (default: the writer's); null skips judging the story.
 * `direct` is the Visual Director's (default: the writer's); null keeps the
 * archetype's shots for every scene.
 */
export const runNewEpisode = async ({number, root = repoRoot, showId = 'pokepulses', fetchJson, complete, verify = complete, ideate = complete, critique = complete, direct = complete, storyPattern, refreshResearch = false, overwrite = false, maxAttempts = 3, log = console.log}) => {
  const researchDir = path.join(root, 'research', showId);
  const matches = fs.existsSync(researchDir)
    ? fs.readdirSync(researchDir).filter((file) => file.endsWith(`-${String(number).padStart(3, '0')}.json`)).sort()
    : [];
  if (matches.length > 1 && !refreshResearch) throw new Error(`Several research files match #${number} in research/${showId}/: ${matches.join(', ')}. Remove the wrong ones or pass --refresh-research.`);
  const cached = matches[0];

  let research;
  if (cached && !refreshResearch) {
    research = JSON.parse(fs.readFileSync(path.join(researchDir, cached), 'utf8'));
    log(`↻ research: reused research/${showId}/${cached}`);
  } else {
    research = await researchPokemon(number, {fetchJson});
    writeJson(path.join(researchDir, `${research.id}.json`), research);
    log(`✓ research: ${research.name} ${research.index} (${research.pokedexEntries.length} Pokédex entries, ${research.evolutionChain.length} in evolution line, ${research.varieties.length} other forms) → research/${showId}/${research.id}.json`);
  }

  const draftPath = path.join(root, 'drafts', showId, `${research.id}.json`);
  if (fs.existsSync(draftPath) && !overwrite) throw new Error(`drafts/${showId}/${research.id}.json already exists. Pass --overwrite to replace it.`);

  let angle;
  let angles;
  let angleCandidates = [undefined];
  const anglePath = path.join(researchDir, `${research.id}.angles.json`);
  if (ideate) {
    angles = await findAngle({
      research,
      generate: ideate,
      storyPattern,
      onRound: ({round, candidates, rejected, error}) => {
        const scored = candidates.filter((candidate) => candidate.total !== undefined);
        log(`${scored.length ? '✓' : '✗'} angles: round ${round}, ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}${rejected.length ? ` (${rejected.length} rejected)` : ''}${error ? ` — ${error}` : ''}`);
        for (const candidate of scored.slice(0, 3)) log(`    ${candidate.total}/25 ${candidate.id} [${candidate.archetype}]: ${candidate.premise}`);
      },
    });
    angle = angles.chosen;
    angleCandidates = rankedAngleFallbacks(angles);
    writeJson(anglePath, {episodeId: research.id, createdAt: new Date().toISOString(), chosen: angle, rounds: angles.rounds});
    log(`${angle.belowBar ? '⚠' : '✓'} angle: "${angle.premise}" [${angle.archetype}, ${angle.total}/25${angle.belowBar ? ', below the bar; the best found' : ''}] → research/${showId}/${research.id}.angles.json`);
  }

  let result;
  let writerError;
  const attemptedAngles = [];
  for (const [index, candidate] of angleCandidates.entries()) {
    angle = candidate;
    if (candidate) {
      attemptedAngles.push(candidate.id);
      if (index > 0) log(`↻ angle fallback ${index + 1}/${angleCandidates.length}: "${candidate.premise}" [${candidate.archetype}, ${candidate.total}/25]`);
    }
    const shape = storyPattern || candidate?.archetype;
    const directing = `${fs.readFileSync(path.join(repoRoot, 'DIRECTING.md'), 'utf8')}${writerStructureBrief(shape)}`;
    try {
      result = await writeEpisode({
        research,
        complete,
        verify,
        critique,
        directing,
        references: selectReferences(loadReferences(), shape),
        storyPattern,
        angle: candidate,
        showId,
        maxAttempts,
        onAttempt: ({attempt, problems, audit, creative}) => {
          const story = creative && !creative.skipped ? `, creative ${creative.score}/100` : '';
          if (problems.length === 0) log(`✓ writer: attempt ${attempt} passed every check (production ${audit.score}/100${story})`);
          else log(`✗ writer: attempt ${attempt} rejected (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n${problems.map((problem) => `    - ${problem}`).join('\n')}`);
        },
      });
      writerError = undefined;
      break;
    } catch (error) {
      writerError = error;
      const next = angleCandidates[index + 1];
      if (!next) break;
      log(`⚠ angle "${candidate?.premise ?? '(writer-chosen)'}" exhausted ${maxAttempts} writer attempts; trying the next strong angle.`);
    }
  }
  if (!result) throw writerError;

  if (angles && angle) {
    writeJson(anglePath, {
      episodeId: research.id,
      createdAt: new Date().toISOString(),
      chosen: angle,
      rounds: angles.rounds,
      ...(angle.id !== angles.chosen.id ? {initialChoice: angles.chosen, attemptedAngles} : {}),
    });
  }

  const visuals = await directVisuals({draft: result.draft, research, angle, complete: direct, showId});
  if (visuals.modelError) log(`⚠ visuals: the visual director failed (${visuals.modelError}); every scene keeps its archetype shot.`);
  else if (direct) log(`✓ visuals: ${visuals.assigned.length ? visuals.assigned.map((item) => `${item.id} → ${item.kind}`).join(', ') : 'no primitives; archetype shots throughout'}${visuals.rejected.length ? ` (${visuals.rejected.length} rejected)` : ''}`);
  for (const item of visuals.rejected) log(`    ✗ ${item.id}: ${item.reason}`);
  result.draft = visuals.draft;
  result.manifest = visuals.manifest;

  writeJson(draftPath, result.draft);
  writeJson(path.join(researchDir, `${research.id}.verification.json`), {episodeId: research.id, checkedAt: new Date().toISOString(), ...result.verification});
  const {claims, uncertain} = result.verification;
  const supported = claims.filter((claim) => claim.verdict === 'supported');
  const byTier = TIERS.map((tier) => [tier, supported.filter((claim) => claim.tier === tier).length]).filter(([, count]) => count);
  log(`✓ facts: ${supported.length} supported${byTier.length ? ` (${byTier.map(([tier, count]) => `${count} ${tier}`).join(', ')})` : ''}, ${claims.filter((claim) => claim.verdict === 'no-claim').length} framing, ${uncertain.length} uncertain → research/${showId}/${research.id}.verification.json`);
  if (result.verification.modelError) log(`⚠ facts: the verifier model failed (${result.verification.modelError}); only the rule checks ran.`);
  for (const claim of uncertain) log(`    ? ${claim.where}: "${claim.text}" (${claim.note})`);
  if (result.creative.skipped) {
    log(`⚠ creative: not judged${result.creative.modelError ? ` (the critic model failed: ${result.creative.modelError})` : ' (no critic model)'}.`);
  } else {
    writeJson(path.join(researchDir, `${research.id}.creative.json`), {episodeId: research.id, checkedAt: new Date().toISOString(), ...result.creative});
    const weakest = [...result.creative.criteria].sort((a, b) => a.score - b.score).slice(0, 2);
    log(`✓ creative: ${result.creative.score}/100 (weakest: ${weakest.map((item) => `${item.criterion} ${item.score}/5`).join(', ')}) → research/${showId}/${research.id}.creative.json`);
  }
  const manifestPath = path.join(root, 'videos', showId, research.id, 'video.json');
  fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
  fs.writeFileSync(manifestPath, serializeManifest(result.manifest));
  const seconds = result.manifest.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  log(`✓ draft: drafts/${showId}/${research.id}.json — "${result.draft.title}" [${result.draft.storyPattern}, ${result.draft.scenes.length} scenes, ${seconds.toFixed(1)}s]`);
  log(`✓ compiled: videos/${showId}/${research.id}/video.json`);
  return {id: research.id, research, angle, visuals: {assigned: visuals.assigned, rejected: visuals.rejected, ...(visuals.modelError ? {modelError: visuals.modelError} : {})}, ...result};
};
