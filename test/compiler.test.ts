import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {archetypes, archetypeSchema, planScenes} from '../scripts/archetypes.mjs';
import {compileEpisode, estimatedSpeech, manifestDrift, MAX_SCENE, MIN_SCENE, safeDuration, serializeManifest} from '../scripts/lib/compiler.mjs';
import {videoSchema} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const drafts = fs.readdirSync(path.join(root, 'drafts'), {withFileTypes: true})
  .filter((entry) => entry.isDirectory())
  .flatMap((show) => fs.readdirSync(path.join(root, 'drafts', show.name))
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({showId: show.name, id: file.replace(/\.json$/, ''), draftPath: path.join(root, 'drafts', show.name, file)})));

const readDraft = (draftPath: string) => JSON.parse(fs.readFileSync(draftPath, 'utf8'));
const sampleDraft = () => {
  const fixture = drafts.find((draft) => draft.id === 'mew-151');
  assert.ok(fixture, 'These tests use drafts/pokepulses/mew-151.json as their sample draft; it was not found.');
  return readDraft(fixture.draftPath);
};

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

  it('reports the total as an exact sum of tenths', () => {
    const {manifest, totalSeconds} = compileEpisode(sampleDraft(), {showId: 'pokepulses'});
    const tenths = manifest.scenes.reduce((sum, scene) => sum + Math.round(scene.durationSeconds * 10), 0);
    assert.equal(totalSeconds, tenths / 10);
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
  const compileWith = (mutate: (draft: ReturnType<typeof sampleDraft>) => void) => {
    const draft = sampleDraft();
    mutate(draft);
    return compileEpisode(draft, {showId: 'pokepulses'}).manifest;
  };
  // A short line that fits any beat, including the hook limit.
  const extraScene = (id: string, beat?: string) => ({id, ...(beat ? {beat} : {}), headline: 'EXTRA BEAT', narration: 'One more clue.', caption: 'ONE MORE CLUE'});

  for (const [pattern, archetype] of Object.entries(archetypes)) {
    it(`${pattern}: a draft with each beat's minimum scenes follows the beats in order`, () => {
      const minimum = archetype.beats.reduce((sum, beat) => sum + beat.minScenes, 0);
      const manifest = compileWith((draft) => {
        draft.storyPattern = pattern;
        draft.scenes = draft.scenes.slice(0, minimum);
      });
      const expected = archetype.beats.flatMap((beat) => Array.from({length: beat.minScenes}, (_, occurrence) => ({
        beat: beat.id,
        role: beat.role,
        shot: beat.shots[occurrence % beat.shots.length],
        visual: beat.visuals[occurrence % beat.visuals.length],
        subjectFocus: beat.subjectFocus[occurrence % beat.subjectFocus.length],
      })));
      assert.deepEqual(manifest.scenes.map(({beat, role, shot, visual, subjectFocus}) => ({beat, role, shot, visual, subjectFocus})), expected);
    });

    it(`${pattern}: opens with a hook, closes with an interaction, and limits the hook`, () => {
      assert.equal(archetype.beats[0].role, 'hook');
      assert.equal(archetype.beats.at(-1)!.role, 'interaction');
      assert.ok(archetype.beats[0].maxSeconds, 'hook beat should set maxSeconds');
    });
  }

  it('lets a tagged scene repeat a beat, cycling its shots', () => {
    const manifest = compileWith((draft) => {
      draft.scenes.splice(2, 0, extraScene('extra-clue', 'clue'));
    });
    assert.deepEqual(manifest.scenes.map((scene) => scene.beat), ['hook', 'clue', 'clue', 'escalation', 'reveal', 'reveal', 'verdict']);
    assert.equal(manifest.scenes[2].shot, archetypes.mystery.beats[1].shots[1]);
  });

  it('rejects a beat repeated beyond its maximum', () => {
    assert.throws(() => compileWith((draft) => {
      draft.scenes.splice(2, 0, extraScene('clue-2', 'clue'), extraScene('clue-3', 'clue'), extraScene('clue-4', 'clue'));
    }), /allows at most 3/);
  });

  it('rejects scenes that go back to an earlier beat', () => {
    assert.throws(() => compileWith((draft) => {
      draft.scenes.splice(4, 0, extraScene('late-clue', 'clue'));
    }), /beats must stay in order/);
  });

  it('rejects an unknown beat', () => {
    assert.throws(() => compileWith((draft) => {
      draft.scenes[1].beat = 'epilogue';
    }), /unknown beat "epilogue"/);
  });

  it('rejects a story missing a required beat', () => {
    assert.throws(() => compileWith((draft) => {
      draft.scenes = draft.scenes.slice(0, 4);
    }), /needs at least/);
  });

  it('rejects an untagged scene after the final beat', () => {
    assert.throws(() => compileWith((draft) => {
      draft.scenes.push(extraScene('encore'));
    }), /no beat left/);
  });

  it('enforces the hook time limit', () => {
    assert.throws(() => compileWith((draft) => {
      draft.scenes[0].narration = 'This tiny Mythical Pokémon may carry the genetic code of every single Pokémon.';
    }), /hook beat allows at most 4.8s/);
  });

  it('enforces the total length limit now that scene counts vary', () => {
    // Every beat at its maximum: 1 + 3 + 2 + 3 + 1 = 10 scenes of ~5.3s each.
    const long = 'Scientists still argue about where this creature came from and why.';
    const beats = ['clue', 'clue', 'clue', 'escalation', 'escalation', 'reveal', 'reveal', 'reveal'];
    assert.throws(() => compileWith((draft) => {
      draft.scenes = [draft.scenes[0], ...beats.map((beat, index) => ({...extraScene(`s${index}`, beat), narration: long})), draft.scenes.at(-1)];
    }), /compiler target is <=45s/);
  });

  it('uses the archetype beat unless a scene overrides it', () => {
    const manifest = compileWith((draft) => {
      draft.targetSecondsBetweenVisualChanges = undefined;
      draft.scenes[1].beatEverySeconds = 1.1;
    });
    assert.equal(manifest.scenes[0].beatEverySeconds, archetypes.mystery.defaultBeat);
    assert.equal(manifest.scenes[1].beatEverySeconds, 1.1);
    assert.equal(manifest.direction.targetSecondsBetweenVisualChanges, archetypes.mystery.defaultBeat);
  });

});

describe('archetype files', () => {
  const timeline = {
    description: 'Events in order, with an optional flashback.',
    defaultBeat: 0.7,
    beats: [
      {id: 'hook', role: 'hook', minScenes: 1, maxScenes: 1, shots: ['impact'], visuals: ['hook'], subjectFocus: ['hidden'], maxSeconds: 4.8},
      {id: 'flashback', role: 'evidence', minScenes: 0, maxScenes: 1, shots: ['wide'], visuals: ['gauntlet'], subjectFocus: ['secondary']},
      {id: 'events', role: 'escalation', minScenes: 2, maxScenes: 4, shots: ['tracking', 'macro'], visuals: ['race'], subjectFocus: ['primary']},
      {id: 'verdict', role: 'interaction', minScenes: 1, maxScenes: 1, shots: ['interaction'], visuals: ['cta'], subjectFocus: ['primary']},
    ],
  };
  const scenes = (...beats: (string | undefined)[]) => beats.map((beat, index) => ({id: `s${index}`, ...(beat ? {beat} : {})}));

  it('accepts a valid archetype', () => {
    assert.doesNotThrow(() => archetypeSchema.parse(timeline));
  });

  it('rejects archetypes that do not open with a hook or close with an interaction', () => {
    assert.throws(() => archetypeSchema.parse({...timeline, beats: timeline.beats.slice(1)}), /hook/);
    assert.throws(() => archetypeSchema.parse({...timeline, beats: timeline.beats.slice(0, -1)}), /interaction/);
  });

  it('rejects duplicate beat ids and max below min', () => {
    assert.throws(() => archetypeSchema.parse({...timeline, beats: [timeline.beats[0], timeline.beats[2], timeline.beats[2], timeline.beats[3]]}), /unique/);
    assert.throws(() => archetypeSchema.parse({...timeline, beats: [timeline.beats[0], {...timeline.beats[2], minScenes: 3, maxScenes: 2}, timeline.beats[3]]}), /maxScenes/);
  });

  it('skips an optional beat for untagged scenes', () => {
    assert.deepEqual(planScenes(timeline as never, scenes(undefined, undefined, undefined, undefined)).map((plan) => plan.beat), ['hook', 'events', 'events', 'verdict']);
  });

  it('uses an optional beat when a scene is tagged with it', () => {
    assert.deepEqual(planScenes(timeline as never, scenes(undefined, 'flashback', undefined, undefined, undefined)).map((plan) => plan.beat), ['hook', 'flashback', 'events', 'events', 'verdict']);
  });

  it('rejects a draft naming an archetype that has no file', () => {
    assert.throws(() => compileEpisode({...sampleDraft(), storyPattern: 'timeline'}, {showId: 'pokepulses'}), /Unknown story archetype.*timeline/);
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
