import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {archetypes} from '../scripts/archetypes.mjs';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {requiresCounterpoint, scoreEpisode} from '../scripts/lib/engagement.mjs';
import {videoSchema} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mewDraft = () => JSON.parse(fs.readFileSync(path.join(root, 'drafts/pokepulses/mew-151.json'), 'utf8'));
const compileAs = (storyPattern: string) => compileEpisode({...mewDraft(), storyPattern}, {showId: 'pokepulses'}).manifest;
const labels = (manifest: ReturnType<typeof compileAs>) => scoreEpisode(manifest).checks.map((check) => check.label);

describe('counterpoint is archetype-specific', () => {
  it('is required by shapes that argue a position', () => {
    assert.deepEqual(Object.keys(archetypes).filter(requiresCounterpoint).sort(), ['comparison', 'profile']);
  });

  it('is checked for profile and comparison episodes', () => {
    for (const pattern of ['profile', 'comparison']) assert.ok(labels(compileAs(pattern)).includes('Counterpoint'), pattern);
  });

  it('is not checked for mechanic, transformation or mystery episodes', () => {
    for (const pattern of ['mechanic', 'transformation', 'mystery']) assert.ok(!labels(compileAs(pattern)).includes('Counterpoint'), pattern);
  });

  it('costs a profile episode points when the twist is missing', () => {
    const manifest = compileAs('profile');
    const withoutTwist = {...manifest, scenes: manifest.scenes.map((scene) => (scene.role === 'twist' ? {...scene, role: 'escalation' as const} : scene))};
    assert.ok(scoreEpisode(withoutTwist).score < scoreEpisode(manifest).score);
  });

  it('still applies to hand-authored debate episodes', () => {
    const bulbasaur = videoSchema.parse(JSON.parse(fs.readFileSync(path.join(root, 'videos/pokepulses/bulbasaur-001/video.json'), 'utf8')));
    assert.ok(labels({...bulbasaur, direction: {...bulbasaur.direction, storyPattern: 'debate'}}).includes('Counterpoint'));
  });

  it('matches what DIRECTING.md says', () => {
    const directing = fs.readFileSync(path.join(root, 'DIRECTING.md'), 'utf8');
    const line = directing.split('\n').find((text) => text.includes('**A counterpoint**'));
    assert.ok(line, 'DIRECTING.md describes the counterpoint rule');
    const [required] = line!.split('**Mechanic**');
    const named = [...required.matchAll(/\*\*([a-z]+)\*\*/g)].map((match) => match[1]).sort();
    assert.deepEqual(named, Object.keys(archetypes).filter(requiresCounterpoint).sort());
  });
});
