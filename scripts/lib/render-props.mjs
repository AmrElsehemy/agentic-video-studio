// The props a render actually uses: the compiled manifest plus narration
// timing, the related subjects a scene shows, and the runtime audio mix.
// Shared by the full render and the CI frame check so both see the same frames.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {findManifest} from '../catalog.mjs';
import {snapToBeats} from './beats.mjs';
import {withWordCaptions} from './captions.mjs';
import {voiceStaleReason} from './voice-lock.mjs';

export const VOICES = ['auto', 'openai', 'local', 'none'];

const sceneExplicitlyReferences = (scene, item) => {
  if (scene.artworkUrl === item.artworkUrl) return true;
  const text = [scene.eyebrow, scene.headline, scene.narration, scene.caption, ...(scene.facts ?? []), scene.primitive ? JSON.stringify(scene.primitive) : '']
    .filter(Boolean).join(' ').toLowerCase();
  return text.includes(item.name.toLowerCase());
};

/**
 * PokePulses is a Pokédex-first series: one episode, one visual hero.
 * Narration and data visualizations may mention evolutions, rivals, or other
 * Pokémon, but character artwork must always remain the episode subject.
 * This is enforced at the render boundary so prompts/compiler changes cannot
 * accidentally introduce a cameo.
 */
export const enforceSubjectOnlyArtwork = (manifest) => {
  if (manifest.show?.id !== 'pokepulses' || !manifest.subject?.artworkUrl) return manifest;
  manifest.related = [];
  manifest.scenes = (manifest.scenes ?? []).map((scene) => ({
    ...scene,
    ...(scene.artworkUrl && scene.artworkUrl !== manifest.subject.artworkUrl
      ? {artworkUrl: manifest.subject.artworkUrl}
      : {}),
  }));
  return manifest;
};

/**
 * Build out/<id>.props.json. Throws when the only narration is stale, so a
 * render can never pair a script with audio recorded for an older one.
 * @param {string} episodeId
 * Shows that caption word by word get timed words from the narration track;
 * `captionPreview` estimates them from the text when there is no track.
 * @param {{voice?: string, captionPreview?: boolean, log?: (line: string) => void, warn?: (line: string) => void}} [options]
 */
export const prepareRenderProps = (episodeId, {voice: requestedVoice = 'auto', captionPreview = false, log = console.log, warn = console.warn} = {}) => {
  if (!VOICES.includes(requestedVoice)) throw new Error(`Unsupported voice selection: ${requestedVoice}`);
  const {root, manifestPath} = findManifest(episodeId);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const propsPath = path.join(root, 'out', `${episodeId}.props.json`);
  fs.mkdirSync(path.dirname(propsPath), {recursive: true});

  if (manifest.show?.id === 'pokepulses') {
    enforceSubjectOnlyArtwork(manifest);
  } else {
    manifest.related = (manifest.related ?? []).filter((item) => manifest.scenes.some((scene) => sceneExplicitlyReferences(scene, item)));
  }

  const openAiVoice = manifest.audio.voice?.output;
  const localVoice = openAiVoice?.replace(/\.wav$/i, '-local.wav');
  const providerFor = (candidate) => candidate === localVoice ? 'local' : 'openai';
  const timingPathFor = (provider) => path.join(root, 'public', 'generated', `${episodeId}-${provider}-timing.json`);
  const readTiming = (provider) => fs.existsSync(timingPathFor(provider)) ? JSON.parse(fs.readFileSync(timingPathFor(provider), 'utf8')) : null;

  const voiceCandidates = requestedVoice === 'openai' ? [openAiVoice] : requestedVoice === 'local' ? [localVoice] : requestedVoice === 'none' ? [] : [openAiVoice, localVoice];
  const existing = voiceCandidates
    .filter((candidate) => candidate && fs.existsSync(path.join(root, 'public', candidate)))
    .map((candidate) => {
      const provider = providerFor(candidate);
      const timing = readTiming(provider);
      return {candidate, provider, timing, staleReason: voiceStaleReason(manifest, provider, timing)};
    });
  const fresh = existing.find((track) => !track.staleReason);
  const stale = existing.filter((track) => track.staleReason);
  const regenerate = (provider) => `npm run voice:${provider} -- ${episodeId}`;

  if (!fresh && stale.length > 0) {
    const reasons = stale.map((track) => `✗ ${track.provider} narration is stale: ${track.staleReason}. Regenerate it: ${regenerate(track.provider)}`);
    throw new Error(`${reasons.join('\n')}\n\nRefusing to render ${episodeId} with narration that doesn't match the manifest. Regenerate the track, or render without narration using --voice=none.`);
  }
  for (const track of stale) warn(`⚠ ignoring stale ${track.provider} narration (${track.staleReason}); regenerate with: ${regenerate(track.provider)}`);

  if (fresh) {
    manifest.audio.voiceover = fresh.candidate;
    manifest.scenes = manifest.scenes.map((scene) => fresh.timing.scenes?.[scene.id] ? {...scene, durationSeconds: fresh.timing.scenes[scene.id]} : scene);
    log(`✓ applied narration timing [${fresh.provider}] from public/generated/${episodeId}-${fresh.provider}-timing.json`);
    log(`✓ narration [${fresh.provider}]: public/${fresh.candidate}`);
  } else if (requestedVoice !== 'auto' && requestedVoice !== 'none') {
    throw new Error(`${requestedVoice} narration has not been generated for ${episodeId}.`);
  } else if (manifest.audio.voice) {
    log(`ℹ narration not generated; run: npm run voice:local -- ${episodeId} or npm run voice:openai -- ${episodeId}`);
  }

  // Map reveals land on the music's beats (#87), now that every scene has its final length.
  Object.assign(manifest, snapToBeats(manifest));

  // Word-synced captions (#86) follow the narration; a render without it keeps the static caption.
  if (manifest.show?.captions?.mode === 'words' && (fresh || captionPreview)) {
    Object.assign(manifest, withWordCaptions(manifest, fresh?.timing.speech));
    log(`✓ word captions: ${fresh?.timing.speech ? 'measured speech timing' : 'estimated from the text (preview)'}`);
  }

  const assets = spawnSync(process.execPath, ['scripts/generate-audio.mjs', episodeId], {cwd: root, stdio: 'inherit'});
  if (assets.status !== 0) throw new Error(`Generating the audio bed and sound effects for ${episodeId} failed.`);

  // Runtime-only mix overrides: keep compiled manifests stable while making the
  // rendered short clearly audible on phone speakers.
  manifest.audio.musicVolume = 0.18;
  manifest.audio.sfx = `generated/${episodeId}-sfx.wav`;
  manifest.audio.sfxVolume = 0.82;
  log(`✓ audio mix: voice=0.94 music=${manifest.audio.musicVolume.toFixed(2)} sfx=${manifest.audio.sfxVolume.toFixed(2)}`);

  fs.writeFileSync(propsPath, JSON.stringify({manifest}, null, 2));
  return {root, manifest, propsPath};
};

/**
 * The frames the video critic and contact sheet look at: one per scene, 60%
 * of the way in, once the scene's entrance animation has settled.
 * @returns {{index: number, seconds: number, frame: number}[]}
 */
export const reviewFrames = (manifest) => {
  let start = 0;
  return manifest.scenes.map((scene, index) => {
    const seconds = start + scene.durationSeconds * 0.6;
    start += scene.durationSeconds;
    return {index, seconds, frame: Math.floor(seconds * manifest.format.fps)};
  });
};

/** Where the frame check writes an episode's review frames. */
export const framePath = (root, episodeId, index) => path.join(root, 'out', `${episodeId}-frames`, `${String(index).padStart(2, '0')}.png`);
