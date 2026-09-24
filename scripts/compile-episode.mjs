import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getArchetype} from './archetypes.mjs';
import {episodeDraftSchema} from './draft-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const episodeId = args.find((arg) => !arg.startsWith('--'));
const checkOnly = args.includes('--check');
if (!episodeId) throw new Error('Usage: npm run episode:compile -- <episode-id> [--check]');

const findDraft = () => {
  const draftsRoot = path.join(root, 'drafts');
  if (!fs.existsSync(draftsRoot)) throw new Error('No drafts directory exists.');
  for (const show of fs.readdirSync(draftsRoot, {withFileTypes: true})) {
    if (!show.isDirectory()) continue;
    const candidate = path.join(draftsRoot, show.name, `${episodeId}.json`);
    if (fs.existsSync(candidate)) return {draftPath: candidate, showId: show.name};
  }
  throw new Error(`Unknown episode draft: ${episodeId}`);
};

const {draftPath, showId} = findDraft();
const draft = episodeDraftSchema.parse(JSON.parse(fs.readFileSync(draftPath, 'utf8')));
if (draft.id !== episodeId) throw new Error(`Draft ID ${draft.id} does not match requested ID ${episodeId}.`);

const archetype = getArchetype(draft.storyPattern);
const speed = draft.voice?.speed ?? 1.08;
const BASE_WPM = 145;
const SAFE_RATIO = 0.86;
const END_PADDING = 0.12;
const MIN_SCENE = 3.8;
const MAX_SCENE = 6.4;

const words = (text) => text.trim().split(/\s+/).filter(Boolean).length;
const punctuation = (text) => ((text.match(/[,;:]/g) ?? []).length * 0.10) + ((text.match(/[.!?]/g) ?? []).length * 0.16) + ((text.match(/[—–-]/g) ?? []).length * 0.08);
const numbers = (text) => (text.match(/\b\d[\d,]*\b/g) ?? []).length * 0.18;
const estimatedSpeech = (text) => (words(text) / BASE_WPM) * 60 / speed + punctuation(text) + numbers(text);
const safeDuration = (text) => {
  const required = estimatedSpeech(text) / SAFE_RATIO + END_PADDING;
  if (required > MAX_SCENE) throw new Error(`Narration needs ${required.toFixed(2)}s but compiler max scene is ${MAX_SCENE}s. Shorten: "${text}"`);
  return Math.max(MIN_SCENE, Math.ceil(required * 10) / 10);
};

const scenes = draft.scenes.map((scene, index) => ({
  id: scene.id,
  durationSeconds: safeDuration(scene.narration),
  role: archetype.sceneRoles[index],
  shot: archetype.shots[index],
  subjectFocus: archetype.subjectFocus[index],
  beatEverySeconds: scene.beatEverySeconds ?? archetype.defaultBeat,
  ...(scene.eyebrow ? {eyebrow: scene.eyebrow} : {}),
  headline: scene.headline,
  narration: scene.narration,
  caption: scene.caption,
  visual: archetype.visuals[index],
  ...(scene.artworkUrl ? {artworkUrl: scene.artworkUrl} : {}),
  ...(scene.accent ? {accent: scene.accent} : {}),
  ...(scene.facts ? {facts: scene.facts} : {}),
}));

const total = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
if (total > 45) throw new Error(`${episodeId} compiles to ${total.toFixed(1)}s. Shorten narration in the draft; compiler target is <=45s.`);

const manifest = {
  schemaVersion: 1,
  id: episodeId,
  show: draft.show ?? {id: showId, name: showId === 'pokepulses' ? 'PokePulses' : showId, handle: `@${showId}`},
  title: draft.title,
  direction: {
    engineVersion: 2,
    storyPattern: draft.storyPattern,
    premise: draft.premise,
    audiencePromise: draft.audiencePromise,
    openLoop: draft.openLoop,
    payoff: draft.payoff,
    targetEmotion: draft.targetEmotion,
    engagementQuestion: draft.engagementQuestion,
    targetSecondsBetweenVisualChanges: draft.targetSecondsBetweenVisualChanges ?? archetype.defaultBeat,
  },
  subject: draft.subject,
  evolutions: draft.evolutions ?? [],
  format: {width: 1080, height: 1920, fps: 30},
  palette: draft.palette ?? {background: '#07111f', surface: '#10233b', primary: '#69d7ff', secondary: '#a875ff', ink: '#f7fbff'},
  audio: {
    music: `generated/${episodeId}-bed.wav`,
    musicVolume: draft.musicVolume ?? 0.09,
    voice: {
      provider: 'openai',
      model: draft.voice?.model ?? 'gpt-4o-mini-tts',
      voice: draft.voice?.voice ?? 'marin',
      instructions: draft.voice?.instructions ?? 'Energetic, natural short-form narrator. Sound like a knowledgeable fan sharing a surprising discovery with a friend. Crisp, playful, and never rushed. Never imitate a known person or character.',
      speed,
      output: `generated/${episodeId}-voice.wav`,
    },
  },
  rights: draft.rights,
  scenes,
  sources: draft.sources,
};

const outputDir = path.join(root, 'videos', showId, episodeId);
const outputPath = path.join(outputDir, 'video.json');
const compiled = `${JSON.stringify(manifest, null, 2)}\n`;

if (checkOnly) {
  if (!fs.existsSync(outputPath)) throw new Error(`${episodeId} has a draft but no compiled video.json. Run: npm run episode:compile -- ${episodeId}`);
  const current = fs.readFileSync(outputPath, 'utf8');
  if (current !== compiled) throw new Error(`${episodeId} compiled manifest is stale or hand-edited. Run: npm run episode:compile -- ${episodeId}`);
  console.log(`✓ compiled artifact matches draft: ${episodeId} (${total.toFixed(1)}s)`);
} else {
  fs.mkdirSync(outputDir, {recursive: true});
  fs.writeFileSync(outputPath, compiled);
  console.log(`✓ compiled ${episodeId}: ${draft.storyPattern} → ${path.relative(root, outputPath)} (${total.toFixed(1)}s)`);
  console.log('Next: npm run episode:check -- ' + episodeId);
}
