import {isDeepStrictEqual} from 'node:util';
import {getArchetype, planScenes} from '../archetypes.mjs';
import {episodeDraftSchema} from '../draft-schema.mjs';
import {geoProblems, geoRightsAsset, loadGeoData} from './geo-primitives.mjs';
import {loadShow} from './shows.mjs';
import {COMPILE_FILL, END_PADDING, estimatedSpeech} from './speech.mjs';

export {estimatedSpeech} from './speech.mjs';

export const DEFAULT_SPEED = 1.08;
export const MIN_SCENE = 3.8;
export const MAX_SCENE = 6.4;
export const MAX_TOTAL = 45;

export const safeDuration = (text, speed) => {
  const required = estimatedSpeech(text, speed) / COMPILE_FILL + END_PADDING;
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
/** The draft's own palette, else the show's variant it names, else the show's palette. */
const episodePalette = (draft, show) => {
  if (draft.palette && draft.paletteVariant) throw new Error(`${draft.id} sets both a palette and paletteVariant "${draft.paletteVariant}"; keep one.`);
  if (!draft.paletteVariant) return draft.palette ?? show.palette;
  const variant = show.paletteVariants?.[draft.paletteVariant];
  if (!variant) throw new Error(`${draft.id} asks for the "${draft.paletteVariant}" palette, which shows/${show.id}.json doesn't define. Defined: ${Object.keys(show.paletteVariants ?? {}).join(', ') || 'none'}.`);
  return variant;
};

export const compileEpisode = (rawDraft, {showId, show = loadShow(showId), geo}) => {
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

  // A subject without artwork (e.g. a country, told with maps) needs every scene to bring its own visual:
  // a map, or artwork of its own. Other primitives and the archetype's shots draw the subject's artwork.
  if (!draft.subject.artworkUrl) {
    const bare = draft.scenes.filter((scene) => !scene.artworkUrl && scene.primitive?.kind !== 'geo-map').map((scene) => scene.id);
    if (bare.length) throw new Error(`${episodeId}'s subject has no artwork, so every scene needs a geo-map primitive or its own artworkUrl. Missing: ${bare.join(', ')}.`);
  }

  // Map scenes must name places that exist in the pinned map data (public/geo/).
  const geoScenes = draft.scenes.filter((scene) => scene.primitive?.kind === 'geo-map');
  const geoData = geoScenes.length ? geo ?? loadGeoData() : undefined;
  const geoErrors = geoScenes.flatMap((scene) => geoProblems(scene.primitive, geoData).map((problem) => `scene "${scene.id}" ${problem}`));
  if (geoErrors.length) throw new Error(`${episodeId} has map scenes that refer to unknown places:\n${geoErrors.map((error) => `- ${error}`).join('\n')}`);

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
      ...(show.captions ? {captions: show.captions} : {}),
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
    palette: episodePalette(draft, show),
    ...(draft.twinOf ? {twinOf: draft.twinOf} : {}),
    audio: {
      music: `generated/${episodeId}-bed.wav`,
      musicVolume: draft.musicVolume ?? show.music.volume,
      bed: {bpm: show.music.bpm, notes: show.music.notes},
      voice: {
        provider: show.voice.provider ?? 'openai',
        model: draft.voice?.model ?? show.voice.model,
        voice: draft.voice?.voice ?? show.voice.voice,
        instructions: draft.voice?.instructions ?? show.voice.instructions,
        speed,
        // A twin (#92) plays its original's narration, so the two differ only in palette.
        output: `generated/${draft.twinOf ?? episodeId}-voice.wav`,
      },
    },
    // Map scenes credit the map data they draw.
    rights: geoData && !draft.rights.assets.some((asset) => asset.kind === 'map-data')
      ? {...draft.rights, assets: [...draft.rights.assets, geoRightsAsset(geoData)]}
      : draft.rights,
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
