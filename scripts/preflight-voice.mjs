import fs from 'node:fs';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {BASE_WPM, END_PADDING, estimatedSpeech, PREFLIGHT_MAX_RATIO, spokenWords} from './lib/speech.mjs';

const args = process.argv.slice(2);
const episodeId = resolveEpisodeId(args.find((arg) => !arg.startsWith('--')) ?? 'bulbasaur-001');
const {manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const speed = manifest.audio?.voice?.speed ?? 1;

let failed = false;
console.log(`Voice preflight: ${episodeId} (speed ${speed}x, calibrated ${BASE_WPM} WPM baseline)`);
for (const scene of manifest.scenes) {
  const words = spokenWords(scene.narration);
  const estimated = estimatedSpeech(scene.narration, speed);
  const available = scene.durationSeconds - END_PADDING;
  const ratio = estimated / available;
  const safe = ratio <= PREFLIGHT_MAX_RATIO;
  failed ||= !safe;
  console.log(`${safe ? '✓' : '✗'} ${scene.id}: est ${estimated.toFixed(2)}s / ${available.toFixed(2)}s available (${words} words, ${ratio.toFixed(2)}x)`);
}
if (failed) {
  console.error('\nVoice preflight FAILED before any paid TTS call. Shorten narration or increase scene duration.');
  process.exit(1);
}
console.log('\n✓ Voice preflight passed. Paid TTS may proceed; any real overrun will auto-expand render timing.');
