// Exact word times for an existing narration track (#86), free and local:
//   npm run captions:align -- <episode-id>
// Adds forced-alignment word times to the track's timing file, so word-synced
// captions light up as each word is spoken. Voice generation does this itself
// when the aligner is installed; this catches up tracks made before.
import fs from 'node:fs';
import path from 'node:path';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {alignNarration} from './lib/align.mjs';
import {voiceStaleReason} from './lib/voice-lock.mjs';

const episodeId = resolveEpisodeId(process.argv.slice(2).find((arg) => !arg.startsWith('--')));
if (!episodeId) throw new Error('Usage: npm run captions:align -- <episode-id>');
const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
// A twin (#92) plays its original's narration, so the original's timing is the one to align.
const owner = manifest.twinOf ?? episodeId;
const timingPath = path.join(root, 'public', 'generated', `${owner}-openai-timing.json`);
const track = path.join(root, 'public', manifest.audio.voice.output);
if (!fs.existsSync(timingPath) || !fs.existsSync(track)) throw new Error(`${owner} has no OpenAI narration yet: npm run voice:openai -- ${owner}`);
const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
const stale = voiceStaleReason(manifest, 'openai', timing);
if (stale) throw new Error(`${owner}'s narration is stale (${stale}); regenerate it first: npm run voice:openai -- ${owner}`);

const aligned = alignNarration({root, track, scenes: manifest.scenes.map((scene) => ({...scene, durationSeconds: timing.scenes[scene.id] ?? scene.durationSeconds}))});
if (aligned.error) throw new Error(`Alignment failed: ${aligned.error}\nIt needs: pip install torch torchaudio num2words`);
for (const [id, words] of Object.entries(aligned.words)) if (timing.speech?.[id]) timing.speech[id].words = words;
fs.writeFileSync(timingPath, JSON.stringify(timing, null, 2));
console.log(`✓ ${owner}: word times aligned for ${Object.keys(aligned.words).length}/${manifest.scenes.length} scenes → ${path.relative(root, timingPath)}`);
