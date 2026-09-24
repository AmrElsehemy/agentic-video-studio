import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getArchetype} from './archetypes.mjs';

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
const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
if (draft.id !== episodeId) throw new Error(`Draft ID ${draft.id} does not match requested ID ${episodeId}.`);
if (!Array.isArray(draft.scenes) || draft.scenes.length !== 6) throw new Error(`${episodeId} must define exactly 6 creative scenes for the current short-form compiler.`);

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

const trim = (value, max, field) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  if (value.length > max) throw new Error(`${field} is ${value.length} characters; max is ${max}. Fix the creative draft instead of truncating it.`);
  return value;
};

const scenes = draft.scenes.map((scene, index) => ({
  id: trim(scene.id, 60, `scenes[${index}].id`),
  durationSeconds: safeDuration(trim(scene.narration, 260, `scenes[${index}].narration`)),
  role: archetype.sceneRoles[index],
  shot: archetype.shots[index],
  subjectFocus: archetype.subjectFocus[index],
  beatEverySeconds: scene.beatEverySeconds ?? archetype.defaultBeat,
  ...(scene.eyebrow ? {eyebrow: trim(scene.eyebrow, 40, `scenes[${index}].eyebrow`)} : {}),
  headline: trim(scene.headline, 70, `scenes[${index}].headline`),
  narration: scene.narration,
  caption: trim(scene.caption, 120, `scenes[${index}].caption`),
  visual: archetype.visuals[index],
  ...(scene.accent ? {accent: scene.accent} : {}),
  ...(scene.facts ? {facts: scene.facts} : {}),
}));

const total = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
if (total > 45) throw new Error(`${episodeId} compiles to ${total.toFixed(1)}s. Shorten narration in the draft; compiler target is <=45s.`);

const manifest = {
  schemaVersion: 1,
  id: episodeId,
  show: draft.show ?? {id: showId, name: showId === 'pokepulses' ? 'PokePulses' : showId, handle: `@${showId}`},
  title: trim(draft.title, 120, 'title'),
  direction: {
    storyPattern: draft.storyPattern,
    premise: trim(draft.premise, 140, 'premise'),
    audiencePromise: trim(draft.audiencePromise, 140, 'audiencePromise'),
    openLoop: trim(draft.openLoop, 140, 'openLoop'),
    payoff: trim(draft.payoff, 140, 'payoff'),
    targetEmotion: draft.targetEmotion ?? 'surprise',
    engagementQuestion: trim(draft.engagementQuestion, 140, 'engagementQuestion'),
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
