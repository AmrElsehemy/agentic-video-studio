import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {addLibraryVoice, charactersToWords, findNarrators, synthesize} from '../scripts/lib/elevenlabs.mjs';

/** A fetch that records each call and answers with `body`. */
const fake = (body: object, status = 200) => {
  const calls: {url: string; init: any}[] = [];
  const fetchImpl = async (url: string, init: any = {}) => {
    calls.push({url, init});
    return {ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body)};
  };
  return {calls, fetchImpl};
};

const timed = (text: string) => ({
  characters: [...text],
  character_start_times_seconds: [...text].map((_, index) => index * .1),
  character_end_times_seconds: [...text].map((_, index) => index * .1 + .1),
});

describe('ElevenLabs narration', () => {
  it('asks for speech with timestamps from the chosen voice and model', async () => {
    const {calls, fetchImpl} = fake({audio_base64: Buffer.from('mp3').toString('base64'), alignment: timed('Hi.')});
    const result = await synthesize({apiKey: 'k', voiceId: 'v 1', text: 'Hi.', fetchImpl});
    assert.equal(calls[0].url, 'https://api.elevenlabs.io/v1/text-to-speech/v%201/with-timestamps?output_format=mp3_44100_128');
    assert.equal(calls[0].init.headers['xi-api-key'], 'k');
    assert.deepEqual(JSON.parse(calls[0].init.body), {text: 'Hi.', model_id: 'eleven_v4'});
    assert.equal(result.audio.toString(), 'mp3');
    assert.ok(result.alignment);
  });

  it('says what failed, without the key', async () => {
    const {fetchImpl} = fake({detail: 'quota exceeded'}, 401);
    await assert.rejects(synthesize({apiKey: 'secret-key', voiceId: 'v', text: 'Hi.', fetchImpl}), (error: Error) => /failed \(401\).*quota exceeded/.test(error.message) && !error.message.includes('secret-key'));
  });

  it('turns character timings into the words captions show', () => {
    const text = 'It began, in 130 BCE.';
    const words = charactersToWords(text, timed(text))!;
    assert.deepEqual(words.map((word) => word.text), ['It', 'began,', 'in', '130', 'BCE.']);
    assert.deepEqual([words[1].start, words[1].end], [.3, .9]);
    assert.equal(charactersToWords('Something else.', timed(text)), undefined);
    assert.equal(charactersToWords(text, undefined), undefined);
  });

  it('lists library narrators without an extra fee or a short notice period', async () => {
    const voice = (id: string, extra: object = {}) => ({voice_id: id, public_owner_id: `o-${id}`, name: id, usage_character_count_1y: 1, ...extra});
    const {calls, fetchImpl} = fake({voices: [voice('a'), voice('b', {rate: 2}), voice('c', {notice_period: 7}), voice('d', {notice_period: 365})]});
    const narrators = await findNarrators({apiKey: 'k', fetchImpl});
    assert.deepEqual(narrators.map((item) => item.voiceId), ['a', 'd']);
    assert.match(calls[0].url, /shared-voices\?search=storyteller&language=en&page_size=30&sort=usage_character_count_1y/);
  });

  it('adds a library voice to the account before it is used', async () => {
    const {calls, fetchImpl} = fake({voice_id: 'mine'});
    assert.equal(await addLibraryVoice({apiKey: 'k', ownerId: 'o', voiceId: 'v', name: 'audition', fetchImpl}), 'mine');
    assert.equal(calls[0].url, 'https://api.elevenlabs.io/v1/voices/add/o/v');
    assert.deepEqual(JSON.parse(calls[0].init.body), {new_name: 'audition'});
  });
});
