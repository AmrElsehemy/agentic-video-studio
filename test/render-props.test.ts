import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {enforceSubjectOnlyArtwork, framePath, reviewFrames} from '../scripts/lib/render-props.mjs';
import {getDurationInFrames, videoSchema} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('PokePulses subject-only artwork', () => {
  it('removes related Pokemon and replaces foreign scene artwork with the subject', () => {
    const manifest = {
      show: {id: 'pokepulses'},
      subject: {name: 'Bulbasaur', artworkUrl: 'bulbasaur.png'},
      related: [
        {name: 'Ivysaur', artworkUrl: 'ivysaur.png'},
        {name: 'Venusaur', artworkUrl: 'venusaur.png'},
      ],
      scenes: [
        {id: 'hook'},
        {id: 'evolution', artworkUrl: 'venusaur.png'},
        {id: 'self', artworkUrl: 'bulbasaur.png'},
      ],
    };

    enforceSubjectOnlyArtwork(manifest);

    assert.deepEqual(manifest.related, []);
    assert.equal(manifest.scenes[0].artworkUrl, undefined);
    assert.equal(manifest.scenes[1].artworkUrl, 'bulbasaur.png');
    assert.equal(manifest.scenes[2].artworkUrl, 'bulbasaur.png');
  });

  it('does not alter other shows', () => {
    const manifest = {
      show: {id: 'another-show'},
      subject: {name: 'A', artworkUrl: 'a.png'},
      related: [{name: 'B', artworkUrl: 'b.png'}],
      scenes: [{id: 'compare', artworkUrl: 'b.png'}],
    };

    enforceSubjectOnlyArtwork(manifest);

    assert.equal(manifest.related.length, 1);
    assert.equal(manifest.scenes[0].artworkUrl, 'b.png');
  });
});

describe('review frames', () => {
  it('picks one frame per scene, 60% of the way in', () => {
    const manifest = {format: {width: 1080, height: 1920, fps: 30}, scenes: [{durationSeconds: 2}, {durationSeconds: 3}, {durationSeconds: 1.5}]} as Parameters<typeof reviewFrames>[0];
    assert.deepEqual(reviewFrames(manifest).map(({index, frame}) => [index, frame]), [[0, 36], [1, 114], [2, 177]]);
    assert.ok(Math.abs(reviewFrames(manifest)[1].seconds - 3.8) < 1e-9);
  });

  it('stays inside every real episode', () => {
    for (const show of fs.readdirSync(path.join(root, 'videos'))) {
      for (const id of fs.readdirSync(path.join(root, 'videos', show))) {
        const manifest = videoSchema.parse(JSON.parse(fs.readFileSync(path.join(root, 'videos', show, id, 'video.json'), 'utf8')));
        const frames = reviewFrames(manifest);
        assert.equal(frames.length, manifest.scenes.length, id);
        assert.ok(frames.every(({frame}, index) => frame < getDurationInFrames(manifest) && (index === 0 || frame > frames[index - 1].frame)), id);
      }
    }
  });

  it('writes frames where the critic and contact sheet read them', () => {
    assert.equal(path.relative(root, framePath(root, 'mew-151', 3)), path.join('out', 'pokepulses', 'mew-151', 'mew-151-frames', '03.png'));
  });
});
