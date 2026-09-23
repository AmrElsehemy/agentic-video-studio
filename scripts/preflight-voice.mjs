import fs from 'node:fs';
import {findManifest} from './catalog.mjs';

const args = process.argv.slice(2);
const episodeId = args.find((arg) => !arg.startsWith('--')) ?? 'bulbasaur-001';
const {manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const speed = manifest.audio?.voice?.speed ?? 1;

// Calibrated against actual OpenAI short-form narration from this project.
// Punctuation/number penalties keep the estimate conservative without wildly
// overestimating normal delivery. Real overruns are still safe because the
// generator now expands scene timing instead of discarding paid narration.
const BASE_WPM = 145;
const END_PADDING_SECONDS = 0.12;
const MAX_SAFE_RATIO = 1.05;

const spokenWordCount = (text) => text.trim().split(/\s+/).filter(Boolean).length;
const punctuationPauseSeconds = (text) => {
  const commas = (text.match(/[,;:]/g) ?? []).length;
  const stops = (text.match(/[.!?]/g) ?? []).length;
  const dashes = (text.match(/[—–-]/g) ?? []).length;
  return commas * 0.10 + stops * 0.16 + dashes * 0.08;
};
const numberPenaltySeconds = (text) => (text.match(/\b\d[\d,]*\b/g) ?? []).length * 0.18;

let failed = false;
console.log(`Voice preflight: ${episodeId} (speed ${speed}x, calibrated ${BASE_WPM} WPM baseline)`);
for (const scene of manifest.scenes) {
  const words = spokenWordCount(scene.narration);
  const estimated = (words / BASE_WPM) * 60 / speed + punctuationPauseSeconds(scene.narration) + numberPenaltySeconds(scene.narration);
  const available = scene.durationSeconds - END_PADDING_SECONDS;
  const ratio = estimated / available;
  const safe = ratio <= MAX_SAFE_RATIO;
  failed ||= !safe;
  console.log(`${safe ? '✓' : '✗'} ${scene.id}: est ${estimated.toFixed(2)}s / ${available.toFixed(2)}s available (${words} words, ${ratio.toFixed(2)}x)`);
}
if (failed) {
  console.error('\nVoice preflight FAILED before any paid TTS call. Shorten narration or increase scene duration.');
  process.exit(1);
}
console.log('\n✓ Voice preflight passed. Paid TTS may proceed; any real overrun will auto-expand render timing.');
