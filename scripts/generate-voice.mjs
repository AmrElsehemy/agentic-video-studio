import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {findManifest} from './catalog.mjs';

const episodeId = process.argv[2] ?? 'bulbasaur-001';
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY is required to generate narration.');

const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const config = manifest.audio.voice;
if (!config) throw new Error(`${episodeId} does not define audio.voice.`);
if (config.provider !== 'openai') throw new Error(`Unsupported voice provider: ${config.provider}`);

const generatedRoot = path.join(root, 'public', 'generated');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${episodeId}-voice-`));
const sceneTracks = [];

const probeDuration = (file) => {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], {encoding: 'utf8'});
  if (probe.status !== 0) throw new Error(probe.stderr || `Could not inspect ${file}`);
  return Number(probe.stdout.trim());
};

try {
  for (const [index, scene] of manifest.scenes.entries()) {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: config.model,
        voice: config.voice,
        input: scene.narration,
        instructions: config.instructions,
        response_format: 'wav',
        speed: config.speed,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI speech request failed (${response.status}): ${await response.text()}`);

    const rawTrack = path.join(tempRoot, `${String(index).padStart(2, '0')}-${scene.id}-raw.wav`);
    const fittedTrack = path.join(tempRoot, `${String(index).padStart(2, '0')}-${scene.id}.wav`);
    fs.writeFileSync(rawTrack, Buffer.from(await response.arrayBuffer()));
    const spokenDuration = probeDuration(rawTrack);
    const available = scene.durationSeconds - 0.12;
    if (spokenDuration > available) {
      throw new Error(`${scene.id} narration is ${spokenDuration.toFixed(2)}s but only ${available.toFixed(2)}s is available. Shorten its narration or increase voice speed.`);
    }

    const fit = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', rawTrack, '-af', `apad=pad_dur=${scene.durationSeconds}`, '-t', String(scene.durationSeconds), '-ar', '44100', '-ac', '2', fittedTrack], {encoding: 'utf8'});
    if (fit.status !== 0) throw new Error(fit.stderr || `Could not fit narration for ${scene.id}`);
    sceneTracks.push(fittedTrack);
    console.log(`✓ ${scene.id}: ${spokenDuration.toFixed(2)}s / ${scene.durationSeconds.toFixed(2)}s`);
  }

  fs.mkdirSync(generatedRoot, {recursive: true});
  const outputPath = path.join(root, 'public', config.output);
  const concatList = path.join(tempRoot, 'tracks.txt');
  fs.writeFileSync(concatList, sceneTracks.map((track) => `file '${track.replaceAll("'", "'\\''")}'`).join('\n'));
  const concat = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-ar', '44100', '-ac', '2', outputPath], {encoding: 'utf8'});
  if (concat.status !== 0) throw new Error(concat.stderr || 'Could not assemble narration track.');
  console.log(`\n✓ narration ready: ${path.relative(root, outputPath)} (${probeDuration(outputPath).toFixed(2)}s)`);
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
