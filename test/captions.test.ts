import assert from 'node:assert/strict';
import fs from 'node:fs';
import {describe, it} from 'node:test';
import {listManifests} from '../scripts/catalog.mjs';
import {captionAt, LEAD_IN, MAX_PHRASE_WORDS, phrases, speechBounds, speechSpan, withWordCaptions, wordTimes} from '../scripts/lib/captions.mjs';
import {expectedCaptions} from '../scripts/lib/frame-audit.mjs';
import type {VideoManifest} from '../src/schema';

const manifests: VideoManifest[] = listManifests().map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));

describe('word-synced captions (#86)', () => {
  it('only shows that opt in get word captions', () => {
    for (const manifest of manifests) {
      const captioned = withWordCaptions(manifest);
      const words = manifest.show.captions?.mode === 'words';
      assert.equal(captioned.scenes.every((scene) => Boolean(scene.words?.length)), words, manifest.id);
      if (manifest.show.id === 'pokepulses') assert.equal(captioned, manifest, `${manifest.id} must be untouched`);
    }
  });

  it('times every word inside the speech span, in order, without gaps beyond pauses', () => {
    for (const manifest of manifests.filter((item) => item.show.captions?.mode === 'words')) {
      for (const scene of withWordCaptions(manifest).scenes) {
        const span = speechSpan(scene, {speed: manifest.audio.voice?.speed});
        const words = scene.words!;
        assert.equal(words.length, scene.narration.trim().split(/\s+/).length, scene.id);
        assert.ok(words[0].start >= span.start - 1e-6 && words.at(-1)!.end <= span.end + 1e-3, `${scene.id} words outside the span`);
        assert.ok(span.end <= scene.durationSeconds, `${scene.id} speech runs past the scene`);
        words.forEach((word, index) => {
          assert.ok(word.end > word.start, `${scene.id}: "${word.text}" has no length`);
          if (index) assert.ok(word.start >= words[index - 1].end - 1e-6 && word.start - words[index - 1].end <= 0.17, `${scene.id}: gap before "${word.text}"`);
        });
      }
    }
  });

  it('uses the measured speech span when the track has one', () => {
    const words = wordTimes('One country is sealed inside another.', speechSpan({narration: 'x', durationSeconds: 4}, {measured: {start: 0.3, end: 2.5}}));
    assert.equal(words[0].start, 0.3);
    assert.ok(Math.abs(words.at(-1)!.end - 2.5) < 0.002);
  });

  it('keeps phrases short, ends them at sentences and never leaves a stranded last word', () => {
    const list = phrases(wordTimes('Where was wine first made? Follow the map.', {start: 0, end: 3}));
    assert.deepEqual(list.map((phrase) => phrase.words.map((word) => word.text).join(' ')), ['Where was wine', 'first made?', 'Follow the map.']);
    for (const manifest of manifests.filter((item) => item.show.captions?.mode === 'words')) {
      for (const scene of withWordCaptions(manifest).scenes) {
        for (const phrase of phrases(scene.words!)) assert.ok(phrase.words.length <= MAX_PHRASE_WORDS, phrase.words.map((word) => word.text).join(' '));
      }
    }
  });

  it('shows the first phrase before speech starts and highlights the word being spoken', () => {
    const words = wordTimes('One country is sealed inside another.', {start: LEAD_IN, end: 3});
    assert.equal(captionAt(words, 0)?.active, -1);
    assert.equal(captionAt(words, 0)?.phrase, 'One country is sealed');
    const late = captionAt(words, 2.9)!;
    assert.equal(late.phrase, 'inside another.');
    assert.equal(late.active, 1);
  });

  it('reads speech bounds from silencedetect output', () => {
    const log = 'silence_start: 0\nsilence_end: 0.300159 | silence_duration: 0.3\nsilence_start: 1.79991\nsilence_end: 2.4 | silence_duration: 0.6';
    assert.deepEqual(speechBounds(log, 2.4), {start: 0.3, end: 1.8});
    assert.deepEqual(speechBounds('', 2), {start: 0, end: 2});
    assert.equal(speechBounds('silence_start: 0\n', 2), undefined);
  });

  it('expects the on-screen phrase in the review frame, and the static caption otherwise', () => {
    for (const manifest of manifests) {
      const captioned = withWordCaptions(manifest);
      expectedCaptions(captioned).forEach((text, index) => {
        if (manifest.show.captions?.mode === 'words') assert.ok(captioned.scenes[index].narration.includes(text), `${manifest.id} scene ${index + 1}: "${text}"`);
        else assert.equal(text, manifest.scenes[index].caption);
      });
    }
  });
});
