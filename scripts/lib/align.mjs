// Forced alignment of narration (#86): when each word is spoken, from the
// track and the known script (scripts/align-words.py, torchaudio's MMS
// aligner, free and local). Optional: without Python and torchaudio, captions
// keep their pause-pinned estimate.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Word times per scene id ({text, start, end}, seconds from the scene's
 * start) for a narration track laid out as `scenes` ({id, narration,
 * durationSeconds}, back to back), or {error} when alignment can't run.
 */
export const alignNarration = ({root, track, scenes, python = process.env.PYTHON ?? 'python3'}) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'align-'));
  try {
    const mono = path.join(work, 'track.wav');
    const convert = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', track, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', mono], {encoding: 'utf8'});
    if (convert.status !== 0) return {error: `ffmpeg couldn't read ${track}: ${convert.stderr}`};
    let start = 0;
    const layout = scenes.map((scene) => {
      const entry = {id: scene.id, narration: scene.narration, start, duration: scene.durationSeconds};
      start += scene.durationSeconds;
      return entry;
    });
    const scenesPath = path.join(work, 'scenes.json');
    fs.writeFileSync(scenesPath, JSON.stringify(layout));
    const run = spawnSync(python, [path.join(root, 'scripts', 'align-words.py'), mono, scenesPath], {encoding: 'utf8', maxBuffer: 1 << 26});
    if (run.error || run.status !== 0) return {error: run.error?.message ?? run.stderr.trim().split('\n').at(-1)};
    return {words: JSON.parse(run.stdout)};
  } finally {
    fs.rmSync(work, {recursive: true, force: true});
  }
};

/** Python with what the aligner needs, so callers can skip it quietly when it's missing. */
export const alignerAvailable = (python = process.env.PYTHON ?? 'python3') =>
  spawnSync(python, ['-c', 'import torchaudio, num2words'], {encoding: 'utf8'}).status === 0;
