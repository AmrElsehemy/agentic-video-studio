// How far word-synced captions land from the narration (#86):
//   npm run captions:drift -- <episode-id> [--words=<transcript.json>]
// The spoken word times come from a transcript of the narration track,
// made locally by scripts/align-words.py (faster-whisper) unless one is given.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {captionDrift, MAX_DRIFT, timelineWords} from './lib/caption-drift.mjs';
import {prepareRenderProps} from './lib/render-props.mjs';

const args = process.argv.slice(2);
const episodeId = resolveEpisodeId(args.find((arg) => !arg.startsWith('--')));
if (!episodeId) throw new Error('Usage: npm run captions:drift -- <episode-id> [--words=<transcript.json>]');
const {root} = findManifest(episodeId);

const {manifest} = prepareRenderProps(episodeId, {voice: 'openai', log: () => {}});
if (!manifest.scenes.some((scene) => scene.words)) throw new Error(`${episodeId}'s show doesn't caption word by word.`);

const given = args.find((arg) => arg.startsWith('--words='))?.split('=')[1];
const transcriptPath = given ?? path.join(root, 'out', `${episodeId}-spoken-words.json`);
if (!given) {
  const track = path.join(root, 'public', manifest.audio.voiceover);
  console.log(`▶ transcribing ${path.relative(root, track)} with faster-whisper (local, free)`);
  const align = spawnSync(process.env.PYTHON ?? 'python3', [path.join(root, 'scripts', 'align-words.py'), track], {encoding: 'utf8', maxBuffer: 1 << 26});
  if (align.status !== 0) throw new Error(`Transcription failed; is faster-whisper installed (pip install faster-whisper)?\n${align.stderr}`);
  fs.mkdirSync(path.dirname(transcriptPath), {recursive: true});
  fs.writeFileSync(transcriptPath, align.stdout);
}

const result = captionDrift(timelineWords(manifest), JSON.parse(fs.readFileSync(transcriptPath, 'utf8')));
const ms = (seconds) => `${Math.round(seconds * 1000)} ms`;
const reportPath = path.join(root, 'out', `${episodeId}-caption-drift.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
for (const word of result.words.filter((item) => Math.abs(item.drift) > MAX_DRIFT)) console.log(`  ${word.scene}: "${word.text}" ${word.drift > 0 ? 'late' : 'early'} by ${ms(Math.abs(word.drift))}`);
console.log(`${result.pass ? '✓' : '✗'} ${episodeId}: ${result.words.length} words, median ${ms(result.median)}, 90% within ${ms(result.p90)}, worst ${ms(result.max)} (target: 90% within ${ms(MAX_DRIFT)}) → ${path.relative(root, reportPath)}`);
