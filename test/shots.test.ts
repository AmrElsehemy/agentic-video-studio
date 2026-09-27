import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {videoSchema} from '../src/schema';
import {artworkPair, HEADLINE_SHOTS} from '../src/video/shots';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (id: string) => videoSchema.parse(JSON.parse(fs.readFileSync(path.join(root, 'videos/pokepulses', id, 'video.json'), 'utf8')));

describe('shot library', () => {
  it('pairs the subject with a scene that shows a different Pokémon', () => {
    const mew = load('mew-151');
    const mewtwoScene = mew.scenes.find((scene) => scene.id === 'mewtwo')!;
    assert.deepEqual(artworkPair(mewtwoScene, mew), [mew.subject.artworkUrl, mewtwoScene.artworkUrl]);
  });

  it('pairs the subject with its evolution when the scene shows the subject', () => {
    const swablu = load('swablu-333');
    assert.deepEqual(artworkPair(swablu.scenes[0], swablu), [swablu.subject.artworkUrl, swablu.evolutions[0].artworkUrl]);
  });

  it('has no pair for a subject-only scene without evolutions', () => {
    const mew = load('mew-151');
    assert.equal(artworkPair(mew.scenes[1], mew), undefined);
  });

  it('draws the headline itself only for hook-style shots', () => {
    assert.deepEqual([...HEADLINE_SHOTS].sort(), ['impact', 'mystery']);
  });
});
