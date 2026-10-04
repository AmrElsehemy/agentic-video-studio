import assert from 'node:assert/strict';
import fs from 'node:fs';
import {describe, it} from 'node:test';
import {synthesize} from '../scripts/lib/elevenlabs.mjs';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {speechCost} from '../scripts/lib/production.mjs';
import {loadShow} from '../scripts/lib/shows.mjs';
import {narrationProvider} from '../scripts/lib/voice-lock.mjs';
import {showSchema} from '../scripts/show-schema.mjs';
import {videoSchema} from '../src/schema';

const raw = JSON.parse(fs.readFileSync('shows/geographica.json', 'utf8'));
const withVoice = (voice: object) => showSchema.safeParse({...raw, voice: {...raw.voice, ...voice}});

describe('narration provider (#102)', () => {
  it('reads with OpenAI unless the show picks ElevenLabs, with each provider\'s default model', () => {
    const openai = withVoice({});
    assert.equal(openai.success && openai.data.voice.provider, 'openai');
    assert.equal(openai.success && openai.data.voice.model, 'gpt-4o-mini-tts');
    const {model, ...rest} = raw.voice;
    const eleven = showSchema.safeParse({...raw, voice: {...rest, provider: 'elevenlabs', voice: 'JBFqnCBsd6RMkjVDRZzb'}});
    assert.equal(eleven.success && eleven.data.voice.model, 'eleven_v4');
    assert.equal(model, 'gpt-4o-mini-tts');
  });

  it('checks the voice against its provider', () => {
    assert.match(JSON.stringify(withVoice({voice: 'JBFqnCBsd6RMkjVDRZzb'}).error?.issues), /isn't an OpenAI voice/);
    assert.match(JSON.stringify(withVoice({provider: 'elevenlabs', voice: 'cedar'}).error?.issues), /isn't an ElevenLabs voice id/);
    assert.match(JSON.stringify(withVoice({provider: 'elevenlabs', voice: 'JBFqnCBsd6RMkjVDRZzb', model: 'eleven_v4', speed: 1.5}).error?.issues), /speed must be 0.7–1.2/);
    // Switching provider but keeping the OpenAI model is caught, not silently sent to ElevenLabs.
    assert.match(JSON.stringify(withVoice({provider: 'elevenlabs', voice: 'JBFqnCBsd6RMkjVDRZzb'}).error?.issues), /gpt-4o-mini-tts.{1,4} isn.t an elevenlabs model/);
  });

  it('compiles an ElevenLabs show\'s episodes with its voice, and they validate', () => {
    const show = {...loadShow('geographica'), voice: {...loadShow('geographica').voice, provider: 'elevenlabs' as const, voice: 'JBFqnCBsd6RMkjVDRZzb', model: 'eleven_v4'}};
    const draft = JSON.parse(fs.readFileSync('drafts/geographica/silk-road.json', 'utf8'));
    const {manifest} = compileEpisode(draft, {showId: 'geographica', show});
    assert.equal(narrationProvider(manifest), 'elevenlabs');
    assert.equal(manifest.audio.voice!.voice, 'JBFqnCBsd6RMkjVDRZzb');
    assert.equal(videoSchema.safeParse(manifest).success, true);
    assert.equal(narrationProvider(JSON.parse(fs.readFileSync('videos/geographica/silk-road/video.json', 'utf8'))), 'openai');
  });

  it('prices ElevenLabs by characters and OpenAI by minutes', () => {
    assert.ok(Math.abs(speechCost({model: 'eleven_v4', seconds: 40, characters: 450})! - .045) < 1e-12);
    assert.equal(speechCost({model: 'gpt-4o-mini-tts', seconds: 60, characters: 450}), .015);
    assert.equal(speechCost({model: 'unknown', seconds: 60, characters: 450}), null);
  });

  it('lets ElevenLabs hear the lines either side, so scenes flow on', async () => {
    let body: any;
    const fetchImpl = async (_url: string, init: any) => {
      body = JSON.parse(init.body);
      return {ok: true, status: 200, json: async () => ({audio_base64: ''}) , text: async () => ''};
    };
    await assert.rejects(synthesize({apiKey: 'k', voiceId: 'v', text: 'Middle.', previousText: 'Before.', nextText: 'After.', fetchImpl}), /no audio/);
    assert.deepEqual(body, {text: 'Middle.', model_id: 'eleven_v4', previous_text: 'Before.', next_text: 'After.'});
  });
});
