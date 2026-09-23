import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {findManifest} from './catalog.mjs';

const args = process.argv.slice(2);
const episodeId = args.find((arg) => !arg.startsWith('--')) ?? 'bulbasaur-001';
const requestedVoice = args.find((arg) => arg.startsWith('--voice='))?.split('=')[1] ?? process.env.VOICE_PROVIDER ?? 'auto';
if (!['auto', 'openai', 'local', 'none'].includes(requestedVoice)) throw new Error(`Unsupported voice selection: ${requestedVoice}`);
const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const propsPath = path.join(root, 'out', `${episodeId}.props.json`);
const outputPath = path.join(root, 'out', `${episodeId}.mp4`);
fs.mkdirSync(path.dirname(outputPath), {recursive: true});

const openAiVoice = manifest.audio.voice?.output;
const localVoice = openAiVoice?.replace(/\.wav$/i, '-local.wav');
const voiceCandidates = requestedVoice === 'openai' ? [openAiVoice] : requestedVoice === 'local' ? [localVoice] : requestedVoice === 'none' ? [] : [openAiVoice, localVoice];
const generatedVoice = voiceCandidates.find((candidate) => candidate && fs.existsSync(path.join(root, 'public', candidate)));
if (generatedVoice) {
  manifest.audio.voiceover = generatedVoice;
  const provider = generatedVoice === localVoice ? 'local' : 'openai';
  const timingPath = path.join(root, 'public', 'generated', `${episodeId}-${provider}-timing.json`);
  if (fs.existsSync(timingPath)) {
    const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
    manifest.scenes = manifest.scenes.map((scene) => timing.scenes?.[scene.id] ? {...scene, durationSeconds: timing.scenes[scene.id]} : scene);
    console.log(`✓ applied narration timing [${provider}] from public/generated/${episodeId}-${provider}-timing.json`);
  }
  console.log(`✓ narration [${provider}]: public/${generatedVoice}`);
} else if (requestedVoice !== 'auto' && requestedVoice !== 'none') {
  throw new Error(`${requestedVoice} narration has not been generated for ${episodeId}.`);
} else if (manifest.audio.voice) {
  console.log(`ℹ narration not generated; run: npm run voice:local -- ${episodeId} or npm run voice:openai -- ${episodeId}`);
}

const assets = spawnSync(process.execPath, ['scripts/generate-audio.mjs', episodeId], {cwd: root, stdio: 'inherit'});
if (assets.status !== 0) process.exit(assets.status ?? 1);

fs.writeFileSync(propsPath, JSON.stringify({manifest}, null, 2));

const renderArgs = ['remotion', 'render', 'src/index.ts', 'VerticalEpisode', outputPath, `--props=${propsPath}`, '--codec=h264', '--crf=18', '--pixel-format=yuv420p'];
if (process.env.REMOTION_BROWSER_EXECUTABLE) renderArgs.push(`--browser-executable=${process.env.REMOTION_BROWSER_EXECUTABLE}`);

const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', renderArgs, {cwd: root, stdio: 'inherit'});
if (result.status !== 0) process.exit(result.status ?? 1);
const qa = spawnSync(process.execPath, ['scripts/qa.mjs', outputPath, propsPath], {cwd: root, stdio: 'inherit'});
process.exit(qa.status ?? 1);
