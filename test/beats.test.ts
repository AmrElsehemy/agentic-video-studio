import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';
import {snapPrimitive, snapToBeats} from '../scripts/lib/beats.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

/** Every reveal time in a map primitive, as fractions of the scene. */
const times = (primitive: any) => [
  ...primitive.camera.slice(1).map((key: any) => key.at),
  ...primitive.highlights.map((highlight: any) => highlight.at),
  ...primitive.annotations.flatMap((annotation: any) => [annotation.at, ...(annotation.until === undefined ? [] : [annotation.until])]),
  ...(primitive.data ? [primitive.data.at] : []),
].filter((at: number) => at > 0 && at < 1);

/** Episode frame of each scene's start, laid out as the renderer does. */
const starts = (manifest: any) => {
  let start = 0;
  return manifest.scenes.map((scene: any) => {
    const frames = Math.round(scene.durationSeconds * manifest.format.fps);
    const entry = {start, frames};
    start += frames;
    return entry;
  });
};

describe('beat-snapped map reveals', () => {
  for (const id of ['silk-road', 'lesotho-enclave', 'georgia-wine']) {
    it(`puts every reveal in ${id} on a beat of its music`, () => {
      const manifest = read(`videos/geographica/${id}/video.json`);
      const beatFrames = 60 / manifest.audio.bed.bpm * manifest.format.fps;
      const snapped = snapToBeats(manifest);
      const layout = starts(manifest);
      let checked = 0;
      snapped.scenes.forEach((scene: any, index: number) => {
        if (scene.primitive?.kind !== 'geo-map') return;
        assert.equal(primitiveSchema.safeParse(scene.primitive).success, true);
        for (const at of times(scene.primitive)) {
          const frame = layout[index].start + at * layout[index].frames;
          // On a whole frame, within half a frame of a beat.
          assert.ok(Math.abs(frame - Math.round(frame)) < 1e-3, `${scene.id}: ${at} is not on a frame`);
          const beat = Math.round(frame / beatFrames) * beatFrames;
          assert.ok(Math.abs(frame - beat) <= .5 + 1e-3, `${scene.id}: frame ${frame} is ${(frame - beat).toFixed(2)} frames off the beat`);
          checked++;
        }
      });
      assert.ok(checked > 5);
    });
  }

  it('moves each time by at most half a beat', () => {
    const manifest = read('videos/geographica/silk-road/video.json');
    const beatSeconds = 60 / manifest.audio.bed.bpm;
    const snapped = snapToBeats(manifest);
    manifest.scenes.forEach((scene: any, index: number) => {
      if (scene.primitive?.kind !== 'geo-map') return;
      const [before, after] = [times(scene.primitive), times(snapped.scenes[index].primitive)];
      before.forEach((at: number, item: number) => assert.ok(Math.abs(after[item] - at) * scene.durationSeconds <= beatSeconds / 2 + 1 / 30));
    });
  });

  it('leaves the start and end of a scene, and scenes without a map, alone', () => {
    const pokemon = read('videos/pokepulses/bulbasaur-001/video.json');
    assert.deepEqual(snapToBeats(pokemon), pokemon);
    const manifest = read('videos/geographica/silk-road/video.json');
    snapToBeats(manifest).scenes.forEach((scene: any) => assert.equal(scene.primitive.camera[0].at, 0));
  });

  it('keeps camera keys in order and a followed route finished in time', () => {
    const scene = {start: 0, frames: 150, fps: 30, beatFrames: 30};
    const primitive = primitiveSchema.parse({kind: 'geo-map', camera: [{target: 'world', at: 0}, {target: 'country:GEO', at: .41}, {target: 'country:ARM', at: .45}],
      annotations: [{type: 'route', path: ['country:GEO', 'country:ARM'], at: .1, until: .84, follow: true}]});
    const snapped = snapPrimitive(primitive, scene) as any;
    // Beats fall every 0.2 of this scene: .41 goes to .4, so .45 can't also go to .4 and goes to .6.
    assert.deepEqual(snapped.camera.map((key: any) => key.at), [0, .4, .6]);
    // .84 is nearest .8, which is within the follow limit of .85.
    assert.equal(snapped.annotations[0].until, .8);
    assert.equal(snapped.annotations[0].at, .2);
  });

  it('is the same every time', () => {
    const manifest = read('videos/geographica/lesotho-enclave/video.json');
    assert.deepEqual(snapToBeats(manifest), snapToBeats(read('videos/geographica/lesotho-enclave/video.json')));
  });
});
