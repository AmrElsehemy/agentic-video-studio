import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {importDrawio} from '../scripts/lib/drawio.mjs';
import {starterDraft} from '../scripts/lib/drawio-draft.mjs';
import {buildWalkthroughPrompt, sourceText, unsupportedNumbers, writeWalkthrough} from '../scripts/lib/walkthrough-writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const show = {id: 'under-the-hood', name: 'Under the Hood', handle: '@UnderTheHood'};
/** A freshly imported diagram, as `npm run diagram:import` leaves it: placeholder narration. */
const imported = (fixture: string, id: string, title: string) => {
  const {spec} = importDrawio(fs.readFileSync(path.join(root, `test/fixtures/drawio/${fixture}.drawio`), 'utf8'), {file: `${fixture}.drawio`});
  return starterDraft({id, title, show, spec, file: `${fixture}.drawio`});
};
/** The models' saved replies, played back in order, role by role. */
const replay = (id: string) => {
  const used: Record<string, number> = {};
  return (role: string) => async () => {
    used[role] = (used[role] ?? 0) + 1;
    return fs.readFileSync(path.join(root, `test/fixtures/walkthrough-writer/${id}.${role}-${used[role]}.json`), 'utf8');
  };
};
const write = async (draft: ReturnType<typeof imported>, saved: string) => {
  const model = replay(saved);
  const attempts: {problems: string[]}[] = [];
  const result = await writeWalkthrough({draft, complete: model('writer'), critique: model('critic'), direct: model('director'), maxAttempts: 4, onAttempt: (attempt: {problems: string[]}) => attempts.push(attempt)});
  return {result, attempts};
};

describe('walkthrough writer', () => {
  it('writes the url-shortener walkthrough from its diagram alone, passing the critic and the audit', async () => {
    const {result, attempts} = await write(imported('url-shortener', 'shortener-walkthrough', 'URL Shortener'), 'shortener-walkthrough');
    assert.equal(attempts.length, 1);
    assert.equal(result.belowBar, undefined);
    assert.ok(result.review.passed && result.review.score! >= 70);
    assert.ok(result.audit.passed);
    assert.deepEqual(result.direction.fallbacks, []);
    // The placeholder narration is gone, and nothing reads the diagram out.
    for (const scene of result.draft.scenes) assert.doesNotMatch(scene.narration, /^Step \d|travels from near/);
    assert.equal(result.draft.storyPattern, 'walkthrough');
    assert.equal(result.manifest.scenes.at(-1).role, 'interaction');
  });

  it('revises the Azure walkthrough until it passes: a weak story, then a scene too long to say', async () => {
    const {result, attempts} = await write(imported('azure-cache-aside', 'azure-walkthrough', 'Cache-aside on Azure'), 'azure-walkthrough');
    assert.equal(attempts.length, 3);
    assert.match(attempts[0].problems.join('\n'), /Creative variety scored 2\/5/);
    assert.match(attempts[1].problems.join('\n'), /needs 1\d\.\d+s but compiler max scene is 12s/);
    assert.deepEqual(attempts[2].problems, []);
    assert.ok(result.review.passed);
    assert.ok(result.audit.passed);
    assert.equal(result.direction.assigned.length, result.draft.scenes.length);
  });

  it('works with no critic or director model: the story goes unjudged and the fallback times the picture', async () => {
    const model = replay('shortener-walkthrough');
    const result = await writeWalkthrough({draft: imported('url-shortener', 'x', 'URL Shortener'), complete: model('writer')});
    assert.ok(result.audit.passed);
    assert.ok(result.direction.fallbacks.every((item: {reason: string}) => item.reason === 'no model'));
  });

  it('describes the diagram in plain words, naming parts by their first line', () => {
    const azure = imported('azure-cache-aside', 'a', 'A');
    const text = sourceText(azure.diagram, {facts: ['Reads are served from Redis when the key is present.']});
    assert.match(text, /- Azure Managed Redis: Distributed cache/);
    assert.match(text, /Read flow \(numbered steps/i);
    assert.match(text, /1\. HTTPS read request/);
    assert.match(text, /Notes about the system:\n- Reads are served/);
    assert.doesNotMatch(text, /near |\(component\)|\[/);
  });

  it('allows only the numbers the diagram or the notes state', () => {
    const draft = imported('url-shortener', 'x', 'URL Shortener');
    const scenes = [{id: 'a', headline: 'STEP 3', narration: 'It takes 40 milliseconds.', caption: '2 PATHS'}];
    assert.deepEqual(unsupportedNumbers({scenes}, draft.diagram, {facts: []}).map((problem) => problem.match(/states (\d+)/)![1]), ['40']);
    assert.deepEqual(unsupportedNumbers({scenes}, draft.diagram, {facts: ['A lookup takes 40 milliseconds.']}), []);
  });

  it("asks for the walkthrough's shape and limits", () => {
    const {system, user} = buildWalkthroughPrompt({draft: imported('url-shortener', 'x', 'URL Shortener'), showId: 'under-the-hood'});
    assert.match(system, /hook \(1 scenes\) → setup \(1-3 scenes\) → flow \(1-7 scenes\)/);
    assert.match(system, /Never read the diagram out/);
    assert.match(system, /never more than 12/);
    assert.match(user, /Redirect flow \(numbered steps/);
  });

  it('refuses a diagram that is not an imported architecture', async () => {
    const draft = JSON.parse(fs.readFileSync(path.join(root, 'drafts/under-the-hood/how-avs-works.json'), 'utf8'));
    await assert.rejects(writeWalkthrough({draft, complete: async () => '{}'}), /no architecture diagram/);
  });
});
