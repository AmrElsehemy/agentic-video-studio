import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {findManifest} from './catalog.mjs';

const args = process.argv.slice(2);
const episodeId = args.find((arg) => !arg.startsWith('--')) ?? 'bulbasaur-001';
const provider = args.find((arg) => arg.startsWith('--provider='))?.split('=')[1] ?? 'openai';
if (!['openai', 'local'].includes(provider)) throw new Error(`Unsupported voice provider: ${provider}`);

const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const config = manifest.audio.voice;
if (!config) throw new Error(`${episodeId} does not define audio.voice.`);

if (provider === 'openai') {
  console.log(`▶ certifying ${episodeId} before any paid TTS request`);
  const certification = spawnSync(process.execPath, ['scripts/certify-episode.mjs', episodeId, '--fast'], {cwd: root, stdio: 'inherit'});
  if (certification.status !== 0) process.exit(certification.status ?? 1);
}

const apiKey = process.env.OPENAI_API_KEY;
if (provider === 'openai' && !apiKey) throw new Error('OPENAI_API_KEY is required to generate OpenAI narration.');

const generatedRoot = path.join(root, 'public', 'generated');
const cacheRoot = path.join(generatedRoot, 'voice-cache', episodeId, provider);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${episodeId}-voice-`));
const sceneTracks = [];
const timing = {};
const endPaddingSeconds = 0.12;
const maxAutoFitRatio = 1.12;

const probeDuration = (file) => {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], {encoding: 'utf8'});
  if (probe.status !== 0) throw new Error(probe.stderr || `Could not inspect ${file}`);
  return Number(probe.stdout.trim());
};

const probePeakVolume = (file) => {
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], {encoding: 'utf8'});
  const match = probe.stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
  return match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
};

const cacheKey = (scene) => crypto.createHash('sha256').update(JSON.stringify({provider, model: config.model, voice: config.voice, speed: config.speed, instructions: config.instructions, narration: scene.narration})).digest('hex').slice(0, 20);

try {
  fs.mkdirSync(cacheRoot, {recursive: true});

  for (const [index, scene] of manifest.scenes.entries()) {
    const extension = provider === 'local' ? 'aiff' : 'wav';
    const cachedRaw = path.join(cacheRoot, `${String(index).padStart(2, '0')}-${scene.id}-${cacheKey(scene)}.${extension}`);
    const rawTrack = path.join(tempRoot, `${String(index).padStart(2, '0')}-${scene.id}-raw.${extension}`);

    if (fs.existsSync(cachedRaw)) {
      fs.copyFileSync(cachedRaw, rawTrack);
      console.log(`↻ ${scene.id} [${provider}]: reused cached paid/raw narration`);
    } else if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({model: config.model, voice: config.voice, input: scene.narration, instructions: config.instructions, response_format: 'wav', speed: config.speed}),
      });
      if (!response.ok) throw new Error(`OpenAI speech request failed (${response.status}): ${await response.text()}`);
      fs.writeFileSync(rawTrack, Buffer.from(await response.arrayBuffer()));
      fs.copyFileSync(rawTrack, cachedRaw);
    } else {
      if (process.platform !== 'darwin') throw new Error('The free local preview provider currently requires macOS and its built-in `say` command.');
      const localVoice = process.env.LOCAL_TTS_VOICE ?? 'Alex';
      const rate = Number(process.env.LOCAL_TTS_RATE ?? 190);
      const say = spawnSync('say', ['-v', localVoice, '-r', String(rate), '-o', rawTrack, scene.narration], {encoding: 'utf8'});
      if (say.status !== 0) throw new Error(say.stderr || `Could not run macOS say with voice ${localVoice}.`);
      fs.copyFileSync(rawTrack, cachedRaw);
    }

    const spokenDuration = probeDuration(rawTrack);
    const originalAvailable = scene.durationSeconds - endPaddingSeconds;
    const requiredTempo = spokenDuration / originalAvailable;
    const effectiveDuration = requiredTempo > maxAutoFitRatio ? Math.ceil((spokenDuration + endPaddingSeconds + 0.18) * 10) / 10 : scene.durationSeconds;
    const available = effectiveDuration - endPaddingSeconds;
    const appliedTempo = spokenDuration > available ? (spokenDuration / available) * 1.005 : 1;
    const fittedTrack = path.join(tempRoot, `${String(index).padStart(2, '0')}-${scene.id}.wav`);
    const audioFilter = [
      ...(appliedTempo > 1 ? [`atempo=${appliedTempo.toFixed(6)}`] : []),
      `apad=pad_dur=${effectiveDuration}`,
    ].join(',');
    const fit = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', rawTrack, '-af', audioFilter, '-t', String(effectiveDuration), '-ar', '44100', '-ac', '2', fittedTrack], {encoding: 'utf8'});
    if (fit.status !== 0) throw new Error(fit.stderr || `Could not fit narration for ${scene.id}`);
    sceneTracks.push(fittedTrack);
    timing[scene.id] = effectiveDuration;
    const expanded = effectiveDuration > scene.durationSeconds + 0.001 ? `, scene expanded ${scene.durationSeconds.toFixed(2)}→${effectiveDuration.toFixed(2)}s` : '';
    const fitLabel = appliedTempo > 1 ? `, auto-fit ${appliedTempo.toFixed(2)}x` : '';
    console.log(`✓ ${scene.id} [${provider}]: ${spokenDuration.toFixed(2)}s / ${effectiveDuration.toFixed(2)}s${fitLabel}${expanded}`);
  }

  fs.mkdirSync(generatedRoot, {recursive: true});
  const configuredOutput = path.join(root, 'public', config.output);
  const outputPath = provider === 'local' ? configuredOutput.replace(/\.wav$/i, '-local.wav') : configuredOutput;
  const concatList = path.join(tempRoot, 'tracks.txt');
  const assembledTrack = path.join(tempRoot, 'narration-assembled.wav');
  fs.writeFileSync(concatList, sceneTracks.map((track) => `file '${track.replaceAll("'", "'\\''")}'`).join('\n'));
  const concat = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-ar', '44100', '-ac', '2', assembledTrack], {encoding: 'utf8'});
  if (concat.status !== 0) throw new Error(concat.stderr || 'Could not assemble narration track.');

  const normalize = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', assembledTrack, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '2', outputPath], {encoding: 'utf8'});
  if (normalize.status !== 0) throw new Error(normalize.stderr || 'Could not normalize narration track.');
  const timingPath = path.join(generatedRoot, `${episodeId}-${provider}-timing.json`);
  fs.writeFileSync(timingPath, JSON.stringify({episodeId, provider, scenes: timing}, null, 2));
  const peakVolume = probePeakVolume(outputPath);
  if (!Number.isFinite(peakVolume) || peakVolume < -30) throw new Error(`Generated ${provider} narration is silent or inaudible (${peakVolume} dBFS).`);
  console.log(`\n✓ ${provider} narration ready: ${path.relative(root, outputPath)} (${probeDuration(outputPath).toFixed(2)}s, peak ${peakVolume.toFixed(1)} dBFS)`);
  console.log(`✓ render timing ready: ${path.relative(root, timingPath)}`);
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
