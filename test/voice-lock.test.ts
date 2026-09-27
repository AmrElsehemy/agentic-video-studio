import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {voiceInputHash, voiceStaleReason} from '../scripts/lib/voice-lock.mjs';
import {videoSchema, type VideoManifest} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadManifest = (): VideoManifest => videoSchema.parse(JSON.parse(fs.readFileSync(path.join(root, 'videos/pokepulses/mew-151/video.json'), 'utf8')));
const lockFor = (manifest: VideoManifest, provider = 'openai') => ({inputHash: voiceInputHash(manifest, provider)});

describe('narration lock', () => {
  it('accepts a track generated from the current manifest', () => {
    const manifest = loadManifest();
    assert.equal(voiceStaleReason(manifest, 'openai', lockFor(manifest)), null);
  });

  it('flags a track after narration changes', () => {
    const manifest = loadManifest();
    const timing = lockFor(manifest);
    manifest.scenes[3].narration = 'A completely different line.';
    assert.match(voiceStaleReason(manifest, 'openai', timing)!, /changed/);
  });

  it('flags a track after scene timing changes', () => {
    const manifest = loadManifest();
    const timing = lockFor(manifest);
    manifest.scenes[0].durationSeconds += 0.5;
    assert.ok(voiceStaleReason(manifest, 'openai', timing));
  });

  it('flags a track after voice settings change', () => {
    const manifest = loadManifest();
    const timing = lockFor(manifest);
    manifest.audio.voice!.speed = 1.2;
    assert.ok(voiceStaleReason(manifest, 'openai', timing));
  });

  it('does not let one provider’s lock vouch for the other', () => {
    const manifest = loadManifest();
    assert.ok(voiceStaleReason(manifest, 'local', lockFor(manifest, 'openai')));
  });

  it('ignores changes that do not affect narration', () => {
    const manifest = loadManifest();
    const timing = lockFor(manifest);
    manifest.scenes[2].headline = 'NEW HEADLINE';
    manifest.palette.primary = '#000000';
    assert.equal(voiceStaleReason(manifest, 'openai', timing), null);
  });

  it('treats missing or pre-lock timing files as stale', () => {
    const manifest = loadManifest();
    assert.match(voiceStaleReason(manifest, 'openai', null)!, /no timing file/);
    assert.match(voiceStaleReason(manifest, 'openai', {})!, /before narration locking/);
  });
});
