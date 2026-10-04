// ElevenLabs narration (#102): a client for speech with timestamps and for
// finding narrator voices in the Voice Library. Only the listening test uses
// it so far; the winning voice is wired into voice generation afterwards.
// The default voices expire on 2026-12-31, so candidates come from the library.

const API = 'https://api.elevenlabs.io/v1';
export const DEFAULT_MODEL = 'eleven_v4';

const request = async (fetchImpl, apiKey, url, init = {}) => {
  const response = await fetchImpl(url, {...init, headers: {'xi-api-key': apiKey, 'Content-Type': 'application/json', ...init.headers}});
  if (!response.ok) throw new Error(`ElevenLabs ${init.method ?? 'GET'} ${new URL(url).pathname} failed (${response.status}): ${await response.text()}`);
  return response.json();
};

/**
 * Speech for `text`, with when each character is spoken when the model gives
 * timings. Returns {audio: Buffer, alignment?: {characters, character_start_times_seconds, character_end_times_seconds}}.
 */
export const synthesize = async ({apiKey, voiceId, text, model = DEFAULT_MODEL, outputFormat = 'mp3_44100_128', voiceSettings, previousText, nextText, fetchImpl = fetch}) => {
  const url = `${API}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${outputFormat}`;
  const body = await request(fetchImpl, apiKey, url, {method: 'POST', body: JSON.stringify({text, model_id: model, ...(voiceSettings ? {voice_settings: voiceSettings} : {}), ...(previousText ? {previous_text: previousText} : {}), ...(nextText ? {next_text: nextText} : {})})});
  if (!body.audio_base64) throw new Error('ElevenLabs returned no audio.');
  return {audio: Buffer.from(body.audio_base64, 'base64'), ...(body.alignment?.characters?.length ? {alignment: body.alignment} : {})};
};

/**
 * Word times from character timings: the narration's words (the tokens word
 * captions show), each from its first character's start to its last's end.
 * Undefined when the characters don't spell the narration.
 */
export const charactersToWords = (text, alignment) => {
  const chars = alignment?.characters ?? [];
  if (chars.join('') !== text) return undefined;
  const words = [];
  let current;
  chars.forEach((char, index) => {
    if (/\s/.test(char)) { current = undefined; return; }
    if (!current) words.push(current = {text: '', start: alignment.character_start_times_seconds[index], end: 0});
    current.text += char;
    current.end = alignment.character_end_times_seconds[index];
  });
  const round = (value) => Math.round(value * 1000) / 1000;
  return words.filter((word) => /[\p{L}\p{N}]/u.test(word.text)).map((word) => ({text: word.text, start: round(word.start), end: round(word.end)}));
};

/**
 * Narrator candidates from the Voice Library: English voices matching
 * `search`, most used first, without an extra per-character fee. A voice
 * whose owner can withdraw it at short notice is skipped (it would leave a
 * show without its narrator).
 */
export const findNarrators = async ({apiKey, search = 'storyteller', language = 'en', pageSize = 30, minNoticeDays = 30, fetchImpl = fetch}) => {
  const query = new URLSearchParams({search, language, page_size: String(pageSize), sort: 'usage_character_count_1y'});
  const {voices = []} = await request(fetchImpl, apiKey, `${API}/shared-voices?${query}`);
  return voices.filter((voice) => !voice.rate && !voice.fiat_rate && (voice.notice_period == null || voice.notice_period >= minNoticeDays)).map((voice) => ({
    voiceId: voice.voice_id,
    ownerId: voice.public_owner_id,
    name: voice.name,
    description: voice.description,
    accent: voice.accent,
    gender: voice.gender,
    age: voice.age,
    useCase: voice.use_case,
    previewUrl: voice.preview_url,
    uses1y: voice.usage_character_count_1y,
  }));
};

/** Adds a library voice to the account, which text-to-speech needs; returns the account's voice id for it. */
export const addLibraryVoice = async ({apiKey, ownerId, voiceId, name, fetchImpl = fetch}) =>
  (await request(fetchImpl, apiKey, `${API}/voices/add/${encodeURIComponent(ownerId)}/${encodeURIComponent(voiceId)}`, {method: 'POST', body: JSON.stringify({new_name: name})})).voice_id;
