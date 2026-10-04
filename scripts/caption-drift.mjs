// How far word-synced captions land from the narration (#86):
//   npm run captions:drift -- <episode-id> [--estimated] [--words=<reference.json>]
// The reference is when each word is spoken, by forced alignment of the track
// against the script (scripts/align-words.py: free, local). Captions that
// already use aligned times match it by construction; --estimated measures
// the pause-pinned estimate captions fall back to without the aligner.
import fs from 'node:fs';
import path from 'node:path';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {alignNarration} from './lib/align.mjs';
import {captionDrift, MAX_DRIFT, timelineWords} from './lib/caption-drift.mjs';
import {withWordCaptions} from './lib/captions.mjs';
import {prepareRenderProps} from './lib/render-props.mjs';
import {narrationProvider} from './lib/voice-lock.mjs';

const args = process.argv.slice(2);
const episodeId = resolveEpisodeId(args.find((arg) => !arg.startsWith('--')));
if (!episodeId) throw new Error('Usage: npm run captions:drift -- <episode-id> [--estimated] [--words=<reference.json>]');
const {root} = findManifest(episodeId);

let {manifest} = prepareRenderProps(episodeId, {voice: 'paid', log: () => {}});
if (!manifest.scenes.some((scene) => scene.words)) throw new Error(`${episodeId}'s show doesn't caption word by word.`);
const owner = manifest.twinOf ?? episodeId;
const speech = JSON.parse(fs.readFileSync(path.join(root, 'public', 'generated', `${owner}-${narrationProvider(manifest)}-timing.json`), 'utf8')).speech ?? {};
const aligned = Object.values(speech).some((span) => span.words);
if (args.includes('--estimated')) {
  manifest = withWordCaptions(manifest, Object.fromEntries(Object.entries(speech).map(([id, {words, ...span}]) => [id, span])));
}
const timing = args.includes('--estimated') || !aligned ? 'estimated' : 'aligned';

const given = args.find((arg) => arg.startsWith('--words='))?.split('=')[1];
let reference;
if (given) reference = JSON.parse(fs.readFileSync(given, 'utf8'));
else {
  console.log(`▶ aligning ${manifest.audio.voiceover} to the script (local, free)`);
  const result = alignNarration({root, track: path.join(root, 'public', manifest.audio.voiceover), scenes: manifest.scenes});
  if (result.error) throw new Error(`Alignment failed: ${result.error}\nIt needs: pip install torch torchaudio num2words`);
  reference = timelineWords({scenes: manifest.scenes.map((scene) => ({...scene, words: result.words[scene.id] ?? []}))});
}

const result = captionDrift(timelineWords(manifest), reference);
const ms = (seconds) => `${Math.round(seconds * 1000)} ms`;
const reportPath = path.join(root, 'out', `${episodeId}-caption-drift.json`);
fs.writeFileSync(reportPath, `${JSON.stringify({timing, ...result}, null, 2)}\n`);
for (const word of result.words.filter((item) => Math.abs(item.drift) > MAX_DRIFT)) console.log(`  ${word.scene}: "${word.text}" ${word.drift > 0 ? 'late' : 'early'} by ${ms(Math.abs(word.drift))}`);
console.log(`${result.pass ? '✓' : '✗'} ${episodeId} (${timing} word times): ${result.words.length} words, median ${ms(result.median)}, 90% within ${ms(result.p90)}, worst ${ms(result.max)} (target: 90% within ${ms(MAX_DRIFT)}) → ${path.relative(root, reportPath)}`);
