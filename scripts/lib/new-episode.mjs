// End-to-end episode creation: research → write → check → save.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serializeManifest} from './compiler.mjs';
import {researchPokemon} from './pokeapi.mjs';
import {loadReferences, selectReferences} from './references.mjs';
import {writeEpisode} from './writer.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

/**
 * Create an episode from a National Pokédex number.
 * Research is cached in research/<show>/<id>.json; pass refreshResearch to refetch.
 */
export const runNewEpisode = async ({number, root = repoRoot, showId = 'pokepulses', fetchJson, complete, verify = complete, storyPattern, refreshResearch = false, overwrite = false, maxAttempts = 3, log = console.log}) => {
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

  const result = await writeEpisode({
    research,
    complete,
    verify,
    directing: fs.readFileSync(path.join(repoRoot, 'DIRECTING.md'), 'utf8'),
    references: selectReferences(loadReferences(), storyPattern),
    storyPattern,
    showId,
    maxAttempts,
    onAttempt: ({attempt, problems, audit}) => {
      if (problems.length === 0) log(`✓ writer: attempt ${attempt} passed every check (engagement ${audit.score}/100)`);
      else log(`✗ writer: attempt ${attempt} rejected (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n${problems.map((problem) => `    - ${problem}`).join('\n')}`);
    },
  });

  writeJson(draftPath, result.draft);
  writeJson(path.join(researchDir, `${research.id}.verification.json`), {episodeId: research.id, checkedAt: new Date().toISOString(), ...result.verification});
  const {claims, uncertain} = result.verification;
  log(`✓ facts: ${claims.filter((claim) => claim.verdict === 'supported').length} supported, ${claims.filter((claim) => claim.verdict === 'no-claim').length} framing, ${uncertain.length} uncertain → research/${showId}/${research.id}.verification.json`);
  if (result.verification.modelError) log(`⚠ facts: the verifier model failed (${result.verification.modelError}); only the rule checks ran.`);
  for (const claim of uncertain) log(`    ? ${claim.where}: "${claim.text}" (${claim.note})`);
  const manifestPath = path.join(root, 'videos', showId, research.id, 'video.json');
  fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
  fs.writeFileSync(manifestPath, serializeManifest(result.manifest));
  const seconds = result.manifest.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  log(`✓ draft: drafts/${showId}/${research.id}.json — "${result.draft.title}" [${result.draft.storyPattern}, ${result.draft.scenes.length} scenes, ${seconds.toFixed(1)}s]`);
  log(`✓ compiled: videos/${showId}/${research.id}/video.json`);
  return {id: research.id, research, ...result};
};
