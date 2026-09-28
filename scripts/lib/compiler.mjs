import {isDeepStrictEqual} from 'node:util';
import {getArchetype, planScenes} from '../archetypes.mjs';
import {episodeDraftSchema} from '../draft-schema.mjs';
import {loadShow} from './shows.mjs';

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
 * Compile a creative draft into a video manifest, merging the show profile
 * (shows/<id>.json) under the draft's own values. Deterministic: the same
 * draft and profile always give the same manifest. Pass `show` to use a
 * profile that isn't on disk. Throws on an invalid draft or a draft that
 * violates production limits.
 */
export const compileEpisode = (rawDraft, {showId, show = loadShow(showId)}) => {
  if (show.id !== showId) throw new Error(`compileEpisode was asked for the ${showId} show but given the ${show.id} profile.`);
  const draft = episodeDraftSchema.parse(rawDraft);
  const episodeId = draft.id;
  if (draft.show?.id && draft.show.id !== show.id) throw new Error(`${episodeId} sets show id "${draft.show.id}" but is compiled for the ${show.id} show.`);
  if (!show.archetypes.includes(draft.storyPattern)) throw new Error(`${show.name} doesn't use the "${draft.storyPattern}" story shape. Allowed in shows/${show.id}.json: ${show.archetypes.join(', ')}.`);
  const archetype = getArchetype(draft.storyPattern);
  const speed = draft.voice?.speed ?? show.voice.speed;

  const related = draft.related ?? [];
  if (show.subjects) {
    const pattern = new RegExp(show.subjects.identifierPattern);
    for (const item of [draft.subject, ...related]) {
      if (item.identifier !== undefined && !pattern.test(item.identifier)) throw new Error(`${item.name}'s identifier "${item.identifier}" isn't a valid ${show.subjects.identifierLabel} for ${show.name} (expected ${show.subjects.identifierPattern}).`);
    }
  }
  // Identifiers (e.g. Pokédex numbers) stay off screen unless the story is about them.
  const numberRelevant = draft.numberRelevant ?? false;
  const identifiers = new Set([draft.subject.identifier, ...related.map((item) => item.identifier)].filter(Boolean));
  const cleanFacts = (facts = []) => facts.filter((fact) => numberRelevant || !identifiers.has(fact));

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
      ...(scene.primitive ? {primitive: scene.primitive} : {}),
    };
  });

  // Durations are whole tenths of a second; sum them as integers so float
  // rounding can't push the total across the limit.
  const totalTenths = scenes.reduce((sum, scene) => sum + Math.round(scene.durationSeconds * 10), 0);
  const totalSeconds = totalTenths / 10;
  if (totalTenths > MAX_TOTAL * 10) throw new Error(`${episodeId} compiles to ${totalSeconds.toFixed(1)}s. Shorten narration in the draft; compiler target is <=${MAX_TOTAL}s.`);

  const manifest = {
    schemaVersion: 2,
    id: episodeId,
    show: {
      id: show.id,
      name: draft.show?.name ?? show.name,
      handle: draft.show?.handle ?? show.handle,
      wordmark: draft.show?.wordmark ?? show.wordmark,
      fonts: draft.show?.fonts ?? show.fonts,
    },
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
    related,
    format: {width: 1080, height: 1920, fps: 30},
    palette: draft.palette ?? show.palette,
    audio: {
      music: `generated/${episodeId}-bed.wav`,
      musicVolume: draft.musicVolume ?? show.music.volume,
      bed: {bpm: show.music.bpm, notes: show.music.notes},
      voice: {
        provider: 'openai',
        model: draft.voice?.model ?? show.voice.model,
        voice: draft.voice?.voice ?? show.voice.voice,
        instructions: draft.voice?.instructions ?? show.voice.instructions,
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
