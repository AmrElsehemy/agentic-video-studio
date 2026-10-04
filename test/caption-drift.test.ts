import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {captionDrift, matchWords, MAX_DRIFT, timelineWords} from '../scripts/lib/caption-drift.mjs';
import {alignerAvailable, alignNarration} from '../scripts/lib/align.mjs';
import {speechPauses, syllables, wordTimes} from '../scripts/lib/captions.mjs';

const words = (...list: [string, number][]) => list.map(([text, start]) => ({text, start, end: start + .2}));

describe('caption timing from heard pauses', () => {
  const narration = 'It began around 130 BCE, in Han China\'s Chang\'an, today\'s Xi\'an.';

  it('counts an acronym letter by letter', () => {
    assert.equal(syllables('BCE,'), 3);
    assert.equal(syllables('NATO'), 4);
    assert.equal(syllables('Road.'), 1);
  });

  it('reads the pauses inside the speech span from a silencedetect log', () => {
    const log = 'silence_start: 0\nsilence_end: 0.1\nsilence_start: 1.2\nsilence_end: 1.5\nsilence_start: 2.9\nsilence_end: 3\nsilence_start: 3.5\n';
    assert.deepEqual(speechPauses(log, {start: 0.1, end: 3.5}), [{start: 1.2, end: 1.5}, {start: 2.9, end: 3}]);
  });

  it('pins each break to the longest pause near it, so the next word starts as the voice resumes', () => {
    // The long pauses follow "BCE," and "Chang'an,"; the short one inside the clause is no break.
    const pauses = [{start: 2.55, end: 3.03}, {start: 3.93, end: 4.02}, {start: 4.49, end: 4.9}];
    const timed = wordTimes(narration, {start: 0.13, end: 5.95, pauses});
    const at = (text: string) => timed.find((word) => word.text === text)!;
    assert.equal(at('BCE,').end, 2.55);
    assert.equal(at('in').start, 3.03);
    assert.equal(at('Chang\'an,').end, 4.49);
    assert.equal(at('today\'s').start, 4.9);
    assert.equal(timed.at(-1)!.end, 5.95);
  });

  it('leaves a break unpinned when no pause is anywhere near it, and times as before without pauses', () => {
    const far = wordTimes(narration, {start: 0, end: 6, pauses: [{start: 5.5, end: 5.6}]});
    const none = wordTimes(narration, {start: 0, end: 6});
    assert.deepEqual(far.map((word) => word.text), none.map((word) => word.text));
    assert.ok(far.every((word, index) => word.start <= word.end && (index === 0 || word.start >= far[index - 1].end)));
    assert.deepEqual(wordTimes(narration, {start: 0, end: 6, pauses: []}), none);
  });
});

describe('caption drift', () => {
  it('matches words written differently from how they were transcribed', () => {
    const captions = words(['6,400', 0], ['kilometres', 1], ['of', 2], ['Silk', 2.3]);
    const spoken = words(['6', 0], [',400', .4], ['kilometers', 1.2], ['of', 1.7], ['Silk', 2]);
    assert.deepEqual(matchWords(captions, spoken), [0, 2, 3, 4]);
  });

  it('puts each scene\'s words on the episode timeline', () => {
    const manifest = {scenes: [{id: 'a', durationSeconds: 4, words: words(['One', .1])}, {id: 'b', durationSeconds: 3, words: words(['Two', .2])}]};
    assert.deepEqual(timelineWords(manifest).map((word: any) => [word.text, word.start, word.scene]), [['One', .1, 'a'], ['Two', 4.2, 'b']]);
  });

  it('passes when 90% of words light up within 150 ms of being spoken', () => {
    const spoken = words(...Array.from({length: 10}, (_, index) => [`w${index}`, index] as [string, number]));
    const close = captionDrift(spoken.map((word) => ({...word, start: word.start + .1})), spoken);
    assert.equal(close.pass, true);
    assert.equal(close.median, .1);
    const late = captionDrift(spoken.map((word, index) => ({...word, start: word.start + (index < 2 ? .4 : .05)})), spoken);
    assert.equal(late.pass, false);
    assert.equal(late.max, .4);
    assert.ok(late.p90! > MAX_DRIFT);
  });
});

describe('aligned word times', () => {
  it('uses forced-alignment times as they are when they belong to this narration', () => {
    const aligned = [{text: 'Never', start: .21, end: .5}, {text: 'one', start: .55, end: .7}, {text: 'road.', start: .74, end: 1.1}];
    assert.deepEqual(wordTimes('Never one road.', {start: 0, end: 1.2, words: aligned}), aligned);
  });

  it('falls back to the estimate when the aligned words are for other narration', () => {
    const aligned = [{text: 'Never', start: .21, end: .5}, {text: 'two', start: .55, end: .7}, {text: 'roads.', start: .74, end: 1.1}];
    assert.deepEqual(wordTimes('Never one road.', {start: 0, end: 1.2, words: aligned}), wordTimes('Never one road.', {start: 0, end: 1.2}));
  });

  it('reports the aligner as missing rather than failing', () => {
    assert.equal(alignerAvailable('python-that-does-not-exist'), false);
    assert.ok(alignNarration({root: process.cwd(), track: 'missing.wav', scenes: [], python: 'python-that-does-not-exist'}).error);
  });
});
