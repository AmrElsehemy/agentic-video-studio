import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {archetypes} from '../scripts/archetypes.mjs';
import {compileEpisode, estimatedSpeech, manifestDrift, MAX_SCENE, MIN_SCENE, safeDuration, serializeManifest} from '../scripts/lib/compiler.mjs';
import {videoSchema} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const drafts = fs.readdirSync(path.join(root, 'drafts'), {withFileTypes: true})
  .filter((entry) => entry.isDirectory())
  .flatMap((show) => fs.readdirSync(path.join(root, 'drafts', show.name))
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({showId: show.name, id: file.replace(/\.json$/, ''), draftPath: path.join(root, 'drafts', show.name, file)})));

const readDraft = (draftPath: string) => JSON.parse(fs.readFileSync(draftPath, 'utf8'));
const sampleDraft = () => readDraft(drafts.find((draft) => draft.id === 'mew-151')!.draftPath);

describe('compiled drafts (golden files)', () => {
  it('finds drafts to test', () => assert.ok(drafts.length > 0));

  for (const {showId, id, draftPath} of drafts) {
    it(`${id} matches its committed video.json`, () => {
      const {manifest} = compileEpisode(readDraft(draftPath), {showId});
      const committed = fs.readFileSync(path.join(root, 'videos', showId, id, 'video.json'), 'utf8');
      assert.equal(manifestDrift(manifest, committed), null);
    });

    it(`${id} compiles to a manifest the renderer schema accepts`, () => {
      const {manifest} = compileEpisode(readDraft(draftPath), {showId});
      assert.doesNotThrow(() => videoSchema.parse(manifest));
    });
  }
});

describe('drift detection', () => {
  const {manifest} = compileEpisode(sampleDraft(), {showId: 'pokepulses'});

  it('ignores formatting-only differences', () => {
    assert.equal(manifestDrift(manifest, JSON.stringify(manifest)), null);
  });

  it('reports the path of a changed value', () => {
    const edited = structuredClone(manifest);
    edited.scenes[2].headline = 'HAND EDITED';
    assert.equal(manifestDrift(manifest, serializeManifest(edited)), '$.scenes[2].headline');
  });

  it('reports a removed field', () => {
    const edited = structuredClone(manifest);
    delete (edited.scenes[0] as {accent?: string}).accent;
    assert.equal(manifestDrift(manifest, serializeManifest(edited)), '$.scenes[0].accent');
  });
});

describe('scene durations', () => {
  it('never goes below the minimum scene length', () => {
    assert.equal(safeDuration('Short line.', 1.08), MIN_SCENE);
  });

  it('rounds up to a tenth of a second and leaves room for the estimate', () => {
    const text = 'Its DNA became the key to creating Mewtwo.';
    const duration = safeDuration(text, 0.9);
    assert.ok(duration > MIN_SCENE);
    assert.equal(Math.round(duration * 10), duration * 10);
    assert.ok(duration > estimatedSpeech(text, 0.9));
  });

  it('rejects narration that cannot fit in the longest scene', () => {
    const text = Array.from({length: 40}, () => 'word').join(' ');
    assert.throws(() => safeDuration(text, 1.08), new RegExp(`max scene is ${MAX_SCENE}s`));
  });

  it('gives slower voices longer scenes', () => {
    const text = 'Its DNA became the key to creating Mewtwo.';
    assert.ok(safeDuration(text, 0.9) > safeDuration(text, 1.2));
  });
});

describe('archetype mapping', () => {
  for (const [pattern, archetype] of Object.entries(archetypes)) {
    it(`${pattern} assigns roles, shots, focus and visuals by position`, () => {
      const draft = {...sampleDraft(), storyPattern: pattern};
      const {manifest} = compileEpisode(draft, {showId: 'pokepulses'});
      assert.deepEqual(manifest.scenes.map((scene) => scene.role), archetype.sceneRoles);
      assert.deepEqual(manifest.scenes.map((scene) => scene.shot), archetype.shots);
      assert.deepEqual(manifest.scenes.map((scene) => scene.subjectFocus), archetype.subjectFocus);
      assert.deepEqual(manifest.scenes.map((scene) => scene.visual), archetype.visuals);
    });
  }

  it('uses the archetype beat unless a scene overrides it', () => {
    const draft = sampleDraft();
    draft.targetSecondsBetweenVisualChanges = undefined;
    draft.scenes[1].beatEverySeconds = 1.1;
    const {manifest} = compileEpisode(draft, {showId: 'pokepulses'});
    assert.equal(manifest.scenes[0].beatEverySeconds, archetypes.mystery.defaultBeat);
    assert.equal(manifest.scenes[1].beatEverySeconds, 1.1);
    assert.equal(manifest.direction.targetSecondsBetweenVisualChanges, archetypes.mystery.defaultBeat);
  });

  it('rejects an unknown archetype', () => {
    assert.throws(() => compileEpisode({...sampleDraft(), storyPattern: 'timeline'}, {showId: 'pokepulses'}));
  });

  it('rejects a draft without exactly 6 scenes', () => {
    const draft = sampleDraft();
    draft.scenes = draft.scenes.slice(0, 5);
    assert.throws(() => compileEpisode(draft, {showId: 'pokepulses'}));
  });
});

describe('number relevance', () => {
  const withIndexFact = (numberRelevant: boolean) => {
    const draft = sampleDraft();
    draft.numberRelevant = numberRelevant;
    draft.scenes[0].facts = ['#151', 'MYTHICAL'];
    return compileEpisode(draft, {showId: 'pokepulses'}).manifest.scenes[0].facts;
  };

  it('drops Pokédex numbers from facts by default', () => {
    assert.deepEqual(withIndexFact(false), ['MYTHICAL']);
  });

  it('keeps Pokédex numbers when the story says they matter', () => {
    assert.deepEqual(withIndexFact(true), ['#151', 'MYTHICAL']);
  });
});

describe('show fallback', () => {
  it('derives show identity from the drafts folder when the draft has none', () => {
    const {manifest} = compileEpisode(sampleDraft(), {showId: 'pokepulses'});
    assert.deepEqual(manifest.show, {id: 'pokepulses', name: 'PokePulses', handle: '@pokepulses'});
  });
});
