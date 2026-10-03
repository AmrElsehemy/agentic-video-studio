import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {audioPlan, writeAudioBed} from '../scripts/lib/audio-bed.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'videos', 'geographica', 'silk-road', 'video.json'), 'utf8'));
/** The Silk Road as its real narration timed it: two scenes ran long and were stretched. */
const narrated = {...manifest, scenes: manifest.scenes.map((scene: {id: string; durationSeconds: number}) => ({...scene, durationSeconds: scene.durationSeconds + ({start: 1.1, peaks: 1}[scene.id] ?? 0)}))};

describe('music and sound effects', () => {
  it('put each scene-change cue at the start of its scene, as long as the scenes really are', () => {
    const plan = audioPlan(narrated);
    let start = 0;
    narrated.scenes.forEach((scene: {id: string; durationSeconds: number}, index: number) => {
      assert.ok(Math.abs(plan.soundEvents[index].time - start) < 1e-9, `${scene.id} cue at ${plan.soundEvents[index].time}, scene starts at ${start}`);
      start += scene.durationSeconds;
    });
    assert.ok(Math.abs(plan.duration - start) < 1e-9);
  });

  it('move the later cues when narration stretches an earlier scene', () => {
    const [compiled, stretched] = [audioPlan(manifest), audioPlan(narrated)];
    const at = (plan: ReturnType<typeof audioPlan>, id: string) => plan.soundEvents.find((event) => event.sceneId === id)!.time;
    assert.equal(at(stretched, 'start'), at(compiled, 'start'));
    assert.ok(Math.abs(at(stretched, 'route') - at(compiled, 'route') - 1.1) < 1e-9);
    assert.ok(Math.abs(at(stretched, 'verdict') - at(compiled, 'verdict') - 2.1) < 1e-9);
    assert.ok(Math.abs(stretched.duration - compiled.duration - 2.1) < 1e-9);
  });

  it('write a bed as long as the manifest it is given', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-bed-'));
    const {musicOutput, sfxOutput, duration} = writeAudioBed({root: out, episodeId: 'silk-road', manifest: narrated, log: () => {}});
    // 16-bit mono at 44.1 kHz after a 44-byte header.
    for (const file of [musicOutput, sfxOutput]) assert.equal((fs.statSync(file).size - 44) / 2, Math.ceil(duration * 44100));
  });
});
