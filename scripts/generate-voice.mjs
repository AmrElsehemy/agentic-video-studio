import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {findManifest} from './catalog.mjs';

const args = process.argv.slice(2);
const episodeId = args.find((arg) => !arg.startsWith('--')) ?? 'bulbasaur-001';
const provider = args.find((arg) => arg.startsWith('--provider='))?.split('=')[1] ?? 'openai';
if (!['openai', 'local'].includes(provider)) throw new Error(`Unsupported voice provider: ${provider}`);
const apiKey = process.env.OPENAI_API_KEY;
if (provider === 'openai' && !apiKey) throw new Error('OPENAI_API_KEY is required to generate OpenAI narration.');

const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const config = manifest.audio.voice;
if (!config) throw new Error(`${episodeId} does not define audio.voice.`);

const generatedRoot = path.join(root, 'public', 'generated');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${episodeId}-voice-`));
const sceneTracks = [];
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

try {
  for (const [index, scene] of manifest.scenes.entries()) {
    const rawTrack = path.join(tempRoot, `${String(index).padStart(2, '0')}-${scene.id}-raw.${provider === 'local' ? 'aiff' : 'wav'}`);
    const fittedTrack = path.join(tempRoot, `${String(index).padStart(2, '0')}-${scene.id}.wav`);
    const available = scene.durationSeconds - endPaddingSeconds;
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({model: config.model, voice: config.voice, input: scene.narration, instructions: config.instructions, response_format: 'wav', speed: config.speed}),
      });
      if (!response.ok) throw new Error(`OpenAI speech request failed (${response.status}): ${await response.text()}`);
      fs.writeFileSync(rawTrack, Buffer.from(await response.arrayBuffer()));
    } else {
      if (process.platform !== 'darwin') throw new Error('The free local preview provider currently requires macOS and its built-in `say` command.');
      const localVoice = process.env.LOCAL_TTS_VOICE ?? 'Alex';
      let rate = Number(process.env.LOCAL_TTS_RATE ?? 190);
      let say = spawnSync('say', ['-v', localVoice, '-r', String(rate), '-o', rawTrack, scene.narration], {encoding: 'utf8'});
      if (say.status !== 0) throw new Error(say.stderr || `Could not run macOS say with voice ${localVoice}.`);
      const firstDuration = probeDuration(rawTrack);
      if (firstDuration > available) {
        rate = Math.min(260, Math.ceil(rate * (firstDuration / available) * 1.03));
        say = spawnSync('say', ['-v', localVoice, '-r', String(rate), '-o', rawTrack, scene.narration], {encoding: 'utf8'});
        if (say.status !== 0) throw new Error(say.stderr || `Could not rerun macOS say with voice ${localVoice}.`);
      }
    }

    const spokenDuration = probeDuration(rawTrack);
    const requiredTempo = spokenDuration / available;
    if (requiredTempo > maxAutoFitRatio) {
      throw new Error(`${scene.id} narration is ${spokenDuration.toFixed(2)}s but only ${available.toFixed(2)}s is available. It would require ${requiredTempo.toFixed(2)}x tempo; shorten its narration or increase voice speed.`);
    }

    // TTS encoders quantize duration, so a calculated rate can still miss the
    // scene boundary by a few milliseconds. Apply a tiny deterministic tempo
    // correction instead of rejecting an otherwise valid narration.
    const appliedTempo = requiredTempo > 1 ? requiredTempo * 1.005 : 1;
    const audioFilter = [
      ...(appliedTempo > 1 ? [`atempo=${appliedTempo.toFixed(6)}`] : []),
      `apad=pad_dur=${scene.durationSeconds}`,
    ].join(',');
    const fit = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', rawTrack, '-af', audioFilter, '-t', String(scene.durationSeconds), '-ar', '44100', '-ac', '2', fittedTrack], {encoding: 'utf8'});
    if (fit.status !== 0) throw new Error(fit.stderr || `Could not fit narration for ${scene.id}`);
    sceneTracks.push(fittedTrack);
    const fitLabel = appliedTempo > 1 ? `, auto-fit ${appliedTempo.toFixed(2)}x` : '';
    console.log(`✓ ${scene.id} [${provider}]: ${spokenDuration.toFixed(2)}s / ${scene.durationSeconds.toFixed(2)}s${fitLabel}`);
  }

  fs.mkdirSync(generatedRoot, {recursive: true});
  const configuredOutput = path.join(root, 'public', config.output);
  const outputPath = provider === 'local'
    ? configuredOutput.replace(/\.wav$/i, '-local.wav')
    : configuredOutput;
  const concatList = path.join(tempRoot, 'tracks.txt');
  const assembledTrack = path.join(tempRoot, 'narration-assembled.wav');
  fs.writeFileSync(concatList, sceneTracks.map((track) => `file '${track.replaceAll("'", "'\\''")}'`).join('\n'));
  const concat = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-ar', '44100', '-ac', '2', assembledTrack], {encoding: 'utf8'});
  if (concat.status !== 0) throw new Error(concat.stderr || 'Could not assemble narration track.');

  // macOS voices vary greatly in output gain. Normalize both draft and paid
  // narration to a consistent spoken-word level before Remotion mixes music.
  const normalize = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', assembledTrack, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '2', outputPath], {encoding: 'utf8'});
  if (normalize.status !== 0) throw new Error(normalize.stderr || 'Could not normalize narration track.');
  const peakVolume = probePeakVolume(outputPath);
  if (!Number.isFinite(peakVolume) || peakVolume < -30) throw new Error(`Generated ${provider} narration is silent or inaudible (${peakVolume} dBFS).`);
  console.log(`\n✓ ${provider} narration ready: ${path.relative(root, outputPath)} (${probeDuration(outputPath).toFixed(2)}s, peak ${peakVolume.toFixed(1)} dBFS)`);
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
