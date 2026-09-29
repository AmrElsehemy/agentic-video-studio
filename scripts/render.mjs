import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {findManifest} from './catalog.mjs';
import {voiceStaleReason} from './lib/voice-lock.mjs';

const args = process.argv.slice(2);
const episodeId = args.find((arg) => !arg.startsWith('--')) ?? 'bulbasaur-001';
const requestedVoice = args.find((arg) => arg.startsWith('--voice='))?.split('=')[1] ?? process.env.VOICE_PROVIDER ?? 'auto';
if (!['auto', 'openai', 'local', 'none'].includes(requestedVoice)) throw new Error(`Unsupported voice selection: ${requestedVoice}`);
const {root, manifestPath} = findManifest(episodeId);

const validation = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/validate.ts', episodeId], {cwd: root, stdio: 'inherit'});
if (validation.status !== 0) process.exit(validation.status ?? 1);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const propsPath = path.join(root, 'out', `${episodeId}.props.json`);
const outputPath = path.join(root, 'out', `${episodeId}.mp4`);
fs.mkdirSync(path.dirname(outputPath), {recursive: true});

const sceneExplicitlyReferences = (scene, item) => {
  if (scene.artworkUrl === item.artworkUrl) return true;
  const text = [scene.eyebrow, scene.headline, scene.narration, scene.caption, ...(scene.facts ?? []), scene.primitive ? JSON.stringify(scene.primitive) : '']
    .filter(Boolean).join(' ').toLowerCase();
  return text.includes(item.name.toLowerCase());
};
manifest.related = (manifest.related ?? []).filter((item) => manifest.scenes.some((scene) => sceneExplicitlyReferences(scene, item)));

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
  for (const track of stale) console.error(`✗ ${track.provider} narration is stale: ${track.staleReason}. Regenerate it: ${regenerate(track.provider)}`);
  console.error(`\nRefusing to render ${episodeId} with narration that doesn't match the manifest. Regenerate the track, or render without narration using --voice=none.`);
  process.exit(1);
}
for (const track of stale) console.warn(`⚠ ignoring stale ${track.provider} narration (${track.staleReason}); regenerate with: ${regenerate(track.provider)}`);

if (fresh) {
  manifest.audio.voiceover = fresh.candidate;
  manifest.scenes = manifest.scenes.map((scene) => fresh.timing.scenes?.[scene.id] ? {...scene, durationSeconds: fresh.timing.scenes[scene.id]} : scene);
  console.log(`✓ applied narration timing [${fresh.provider}] from public/generated/${episodeId}-${fresh.provider}-timing.json`);
  console.log(`✓ narration [${fresh.provider}]: public/${fresh.candidate}`);
} else if (requestedVoice !== 'auto' && requestedVoice !== 'none') {
  throw new Error(`${requestedVoice} narration has not been generated for ${episodeId}.`);
} else if (manifest.audio.voice) {
  console.log(`ℹ narration not generated; run: npm run voice:local -- ${episodeId} or npm run voice:openai -- ${episodeId}`);
}

const assets = spawnSync(process.execPath, ['scripts/generate-audio.mjs', episodeId], {cwd: root, stdio: 'inherit'});
if (assets.status !== 0) process.exit(assets.status ?? 1);

manifest.audio.sfx = `generated/${episodeId}-sfx.wav`;
manifest.audio.sfxVolume = 0.82;
console.log(`✓ audio mix: voice=0.94 music=${manifest.audio.musicVolume.toFixed(2)} sfx=${manifest.audio.sfxVolume.toFixed(2)}`);

fs.writeFileSync(propsPath, JSON.stringify({manifest}, null, 2));

const renderArgs = ['remotion', 'render', 'src/index.ts', 'VerticalEpisode', outputPath, `--props=${propsPath}`, '--codec=h264', '--crf=18', '--pixel-format=yuv420p'];
if (process.env.REMOTION_BROWSER_EXECUTABLE) renderArgs.push(`--browser-executable=${process.env.REMOTION_BROWSER_EXECUTABLE}`);

const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', renderArgs, {cwd: root, stdio: 'inherit'});
if (result.status !== 0) process.exit(result.status ?? 1);
const qa = spawnSync(process.execPath, ['scripts/qa.mjs', outputPath, propsPath], {cwd: root, stdio: 'inherit'});
process.exit(qa.status ?? 1);
