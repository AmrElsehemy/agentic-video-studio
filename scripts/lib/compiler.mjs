import {isDeepStrictEqual} from 'node:util';
import {getArchetype, planScenes} from '../archetypes.mjs';
import {episodeDraftSchema} from '../draft-schema.mjs';

export const DEFAULT_SPEED = 1.08;
export const BASE_WPM = 145;
export const SAFE_RATIO = 0.86;
export const END_PADDING = 0.12;
export const MIN_SCENE = 3.8;
export const MAX_SCENE = 6.4;
export const MAX_TOTAL = 45;

const words = (text) => text.trim().split(/\s+/).filter(Boolean).length;
const punctuation = (text) => ((text.match(/[,;:]/g) ?? []).length * 0.10) + ((text.match(/[.!?]/g) ?? []).length * 0.16) + ((text.match(/[—–-]/g) ?? []).length * 0.08);
const numbers = (text) => (text.match(/\b\d[\d,]*\b/g) ?? []).length * 0.18;

export const estimatedSpeech = (text, speed) => (words(text) / BASE_WPM) * 60 / speed + punctuation(text) + numbers(text);

export const safeDuration = (text, speed) => {
  const required = estimatedSpeech(text, speed) / SAFE_RATIO + END_PADDING;
  if (required > MAX_SCENE) throw new Error(`Narration needs ${required.toFixed(2)}s but compiler max scene is ${MAX_SCENE}s. Shorten: "${text}"`);
  return Math.max(MIN_SCENE, Math.ceil(required * 10) / 10);
};

/**
 * Compile a creative draft into a video manifest. Pure: no file system access.
 * Throws on an invalid draft or a draft that violates production limits.
 */
export const compileEpisode = (rawDraft, {showId}) => {
  const draft = episodeDraftSchema.parse(rawDraft);
  const episodeId = draft.id;
  const archetype = getArchetype(draft.storyPattern);
  const speed = draft.voice?.speed ?? DEFAULT_SPEED;

  const numberRelevant = draft.numberRelevant ?? false;
  const indexTokens = new Set([draft.subject.index, ...(draft.evolutions ?? []).map((evolution) => evolution.index)]);
  const cleanFacts = (facts = []) => facts.filter((fact) => numberRelevant || !indexTokens.has(fact));

  const plan = planScenes(archetype, draft.scenes);
  const scenes = draft.scenes.map((scene, index) => {
    const {beat, role, shot, visual, subjectFocus, maxSeconds} = plan[index];
    const durationSeconds = safeDuration(scene.narration, speed);
    if (maxSeconds && durationSeconds > maxSeconds) throw new Error(`Scene "${scene.id}" (${beat}) needs ${durationSeconds.toFixed(1)}s but the ${draft.storyPattern} ${beat} beat allows at most ${maxSeconds}s. Shorten: "${scene.narration}"`);
    return {
      id: scene.id,
      durationSeconds,
      beat,
      role,
      shot,
      subjectFocus,
      beatEverySeconds: scene.beatEverySeconds ?? archetype.defaultBeat,
      ...(scene.eyebrow ? {eyebrow: scene.eyebrow} : {}),
      headline: scene.headline,
      narration: scene.narration,
      caption: scene.caption,
      visual,
      ...(scene.artworkUrl ? {artworkUrl: scene.artworkUrl} : {}),
      ...(scene.accent ? {accent: scene.accent} : {}),
      ...(scene.facts ? {facts: cleanFacts(scene.facts)} : {}),
    };
  });

  // Durations are whole tenths of a second; sum them as integers so float
  // rounding can't push the total across the limit.
  const totalTenths = scenes.reduce((sum, scene) => sum + Math.round(scene.durationSeconds * 10), 0);
  const totalSeconds = totalTenths / 10;
  if (totalTenths > MAX_TOTAL * 10) throw new Error(`${episodeId} compiles to ${totalSeconds.toFixed(1)}s. Shorten narration in the draft; compiler target is <=${MAX_TOTAL}s.`);

  const manifest = {
    schemaVersion: 1,
    id: episodeId,
    show: draft.show ?? {id: showId, name: showId === 'pokepulses' ? 'PokePulses' : showId, handle: `@${showId}`},
    title: draft.title,
    direction: {
      engineVersion: 2,
      storyPattern: draft.storyPattern,
      numberRelevant,
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

  return {manifest, totalSeconds};
};

export const serializeManifest = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

/** Path of the first difference between two JSON values, or null when they are equal. */
export const firstDifference = (expected, actual, at = '$') => {
  if (isDeepStrictEqual(expected, actual)) return null;
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object' && Array.isArray(expected) === Array.isArray(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])];
    for (const key of keys) {
      const path = Array.isArray(expected) ? `${at}[${key}]` : `${at}.${key}`;
      const difference = firstDifference(expected[key], actual[key], path);
      if (difference) return difference;
    }
  }
  return at;
};

/**
 * Compare a committed manifest with fresh compiler output by content, so
 * formatting-only differences don't count as drift.
 */
export const manifestDrift = (manifest, committedJson) => firstDifference(JSON.parse(serializeManifest(manifest)), JSON.parse(committedJson));
