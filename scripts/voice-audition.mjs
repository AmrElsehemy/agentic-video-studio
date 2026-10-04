// Listening test for a narrator (#102): one episode's narration read by a few
// ElevenLabs library voices and by the current OpenAI voice, under shuffled
// letters so nobody knows which is which while listening.
//   npm run voice:audition -- silk-road                      # list candidates only, free
//   npm run voice:audition -- silk-road --voices=<owner/voice>,... [--model=eleven_v4]
// Writes out/voice-audition/<id>/{A,B,...}.mp3 and key.json (which letter is
// which voice: open it only after choosing). Each ElevenLabs read costs about
// as many credits as the narration has characters (~450 for an episode).
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {addLibraryVoice, charactersToWords, DEFAULT_MODEL, findNarrators, synthesize} from './lib/elevenlabs.mjs';
import {appendProduction} from './lib/production.mjs';

const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const episodeId = resolveEpisodeId(args.find((arg) => !arg.startsWith('--')));
if (!episodeId) throw new Error('Usage: npm run voice:audition -- <episode-id> [--voices=<owner-id/voice-id>,...] [--model=eleven_v4] [--search=storyteller]');
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set. Add it in the environment settings; a new session picks it up.');

const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const narration = manifest.scenes.map((scene) => scene.narration).join(' ');

const picks = option('voices');
if (!picks) {
  const narrators = await findNarrators({apiKey, search: option('search') ?? 'storyteller'});
  console.log(`Library narrators for "${option('search') ?? 'storyteller'}" (no extra fee, most used first):\n`);
  for (const voice of narrators.slice(0, 12)) console.log(`  ${voice.ownerId}/${voice.voiceId}  ${voice.name} (${[voice.gender, voice.age, voice.accent].filter(Boolean).join(', ')}): ${voice.description ?? ''}\n    preview: ${voice.previewUrl ?? '–'}`);
  console.log(`\nPick 3 and run: npm run voice:audition -- ${episodeId} --voices=<owner/voice>,<owner/voice>,<owner/voice>`);
  process.exit(0);
}

const outDir = path.join(root, 'out', 'voice-audition', episodeId);
fs.mkdirSync(outDir, {recursive: true});
const entries = [];
const model = option('model') ?? DEFAULT_MODEL;
for (const pick of picks.split(',')) {
  const [ownerId, libraryId] = pick.split('/');
  if (!ownerId || !libraryId) throw new Error(`"${pick}" isn't <owner-id>/<voice-id>; list candidates with: npm run voice:audition -- ${episodeId}`);
  const voiceId = await addLibraryVoice({apiKey, ownerId, voiceId: libraryId, name: `audition-${libraryId.slice(0, 8)}`});
  const {audio, alignment} = await synthesize({apiKey, voiceId, text: narration, model});
  const file = path.join(outDir, `${libraryId}.mp3`);
  fs.writeFileSync(file, audio);
  const words = charactersToWords(narration, alignment);
  console.log(`✓ ${pick}: ${(audio.length / 1024).toFixed(0)} KB${words ? `, ${words.length} word times` : ', no timings returned'}`);
  entries.push({voice: `elevenlabs ${model} ${pick}`, file});
}
appendProduction(root, manifest.show.id, episodeId, [{kind: 'voice-audition', provider: 'elevenlabs', model, characters: narration.length * entries.length, voices: entries.length}]);

// The current voice, if its track exists, re-encoded the same way so the format gives nothing away.
const current = path.join(root, 'public', manifest.audio.voice.output);
if (fs.existsSync(current)) {
  const file = path.join(outDir, 'current.mp3');
  const encode = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', current, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB', '-ac', '1', '-ar', '44100', '-b:a', '128k', file]);
  if (encode.status === 0) entries.push({voice: `openai ${manifest.audio.voice.model} ${manifest.audio.voice.voice} (current)`, file});
}

// Shuffled letters: a fresh order each run, recorded in key.json.
const order = entries.map((entry) => ({entry, sort: crypto.randomBytes(4).readUInt32BE()})).sort((a, b) => a.sort - b.sort).map(({entry}) => entry);
const key = {};
order.forEach((entry, index) => {
  const letter = String.fromCharCode(65 + index);
  fs.renameSync(entry.file, path.join(outDir, `${letter}.mp3`));
  key[letter] = entry.voice;
});
fs.writeFileSync(path.join(outDir, 'key.json'), `${JSON.stringify(key, null, 2)}\n`);
console.log(`\n✓ ${order.length} reads in ${path.relative(root, outDir)}: ${Object.keys(key).join(', ')} (key.json says which is which)`);
