import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {approvalHash, episodeStages, hashFiles, readLock, runPipeline} from '../scripts/lib/pipeline.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'lesotho-enclave';

/** A scratch project with the Lesotho draft, and a fake runner that records steps and writes their outputs. */
const project = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-'));
  fs.mkdirSync(path.join(root, 'drafts', 'geographica'), {recursive: true});
  fs.copyFileSync(path.join(repo, 'drafts', 'geographica', `${ID}.json`), path.join(root, 'drafts', 'geographica', `${ID}.json`));
  const steps: string[] = [];
  const failing = new Set<string>();
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  };
  const exec = (label: string, _command: string, args: string[]) => {
    steps.push(label);
    if (failing.has(label)) throw new Error(`${label} broke`);
    const draft = fs.readFileSync(path.join(root, 'drafts', 'geographica', `${ID}.json`), 'utf8');
    if (args.includes('scripts/frame-check.mjs')) write(path.join(root, 'out', `${ID}-frames`, '00.png'), 'frame');
    const provider = args.find((arg) => arg.startsWith('--provider='))?.slice(11);
    if (provider) write(path.join(root, 'public', 'generated', `${ID}-${provider}-timing.json`), JSON.stringify({narration: JSON.parse(draft).scenes.map((scene: {narration: string}) => scene.narration)}));
    if (args.includes('scripts/render.mjs')) write(path.join(root, 'out', `${ID}.mp4`), 'mp4');
  };
  const lock = readLock(path.join(root, 'build', ID, 'lock.json'));
  const run = async (options: {voice?: string; until?: string; force?: string[]; dryRun?: boolean} = {}) => {
    steps.length = 0;
    const stages = episodeStages({root, episodeId: ID, voice: options.voice ?? 'none', exec});
    const result = await runPipeline({stages, until: options.until, force: options.force, dryRun: options.dryRun, lock, log: () => {}});
    return {...result, steps: [...steps], stages};
  };
  const editScene = (id: string, change: Record<string, string>) => {
    const file = path.join(root, 'drafts', 'geographica', `${ID}.json`);
    const draft = JSON.parse(fs.readFileSync(file, 'utf8'));
    Object.assign(draft.scenes.find((scene: {id: string}) => scene.id === id), change);
    fs.writeFileSync(file, JSON.stringify(draft, null, 2));
  };
  return {root, run, lock, editScene, failing};
};

describe('stage pipeline', () => {
  it('runs every stage once, then does no work on a second run', async () => {
    const {root, run} = project();
    const first = await run({voice: 'local'});
    assert.deepEqual(first.ran, ['compile', 'lint', 'preview', 'voice', 'render']);
    assert.deepEqual(first.skipped, ['approve']);
    assert.ok(fs.existsSync(path.join(root, 'videos', 'geographica', ID, 'video.json')));
    const second = await run({voice: 'local'});
    assert.deepEqual(second.ran, []);
    assert.deepEqual(second.steps, []);
    assert.deepEqual(second.cached, ['compile', 'lint', 'preview', 'voice', 'render']);
  });

  it('re-runs compile → lint → voice → render when one narration line changes, and nothing upstream', async () => {
    const {run, editScene} = project();
    await run({voice: 'local'});
    editScene('peak', {narration: 'Thabana Ntlenyana, at 3,482 metres, tops southern Africa.'});
    const again = await run({voice: 'local'});
    assert.deepEqual(again.ran, ['compile', 'lint', 'preview', 'voice', 'render']);
    assert.ok(again.steps.includes('local narration'));
  });

  it('keeps the narration when only on-screen text changes', async () => {
    const {run, editScene} = project();
    await run({voice: 'local'});
    editScene('peak', {headline: 'THE ROOF OF SOUTHERN AFRICA'});
    const again = await run({voice: 'local'});
    assert.deepEqual(again.ran, ['compile', 'lint', 'preview', 'render']);
    assert.deepEqual(again.cached, ['voice']);
  });

  it('stops early when a change leaves the compiled manifest identical', async () => {
    const {root, run} = project();
    await run();
    // Reformatting the draft changes its bytes but not what it compiles to.
    const file = path.join(root, 'drafts', 'geographica', `${ID}.json`);
    fs.writeFileSync(file, JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8'))));
    const again = await run();
    assert.deepEqual(again.ran, ['compile']);
    assert.deepEqual(again.cached, ['lint', 'preview', 'render']);
  });

  it('re-runs a stage whose output was deleted, or that is forced', async () => {
    const {root, run} = project();
    await run();
    fs.rmSync(path.join(root, 'out', `${ID}.mp4`));
    assert.deepEqual((await run()).ran, ['render']);
    assert.deepEqual((await run({force: ['preview']})).ran, ['preview']);
  });

  it('holds paid narration until this version is approved, and again after an edit', async () => {
    const {run, lock, editScene} = project();
    const blocked = await run({voice: 'openai'});
    assert.equal(blocked.stoppedAt, 'approve');
    assert.ok(!blocked.steps.includes('openai narration'));
    lock.approvals[approvalHash(blocked.stages)!] = {at: 'now'};
    const approved = await run({voice: 'openai'});
    assert.deepEqual(approved.ran, ['voice', 'render']);
    editScene('hook', {narration: 'One country is sealed inside another. Spot it now?'});
    const edited = await run({voice: 'openai'});
    assert.equal(edited.stoppedAt, 'approve');
    assert.deepEqual(edited.ran, ['compile', 'lint', 'preview']);
  });

  it('stops at a failing stage, keeps what finished, and retries it next time', async () => {
    const {run, failing, lock} = project();
    failing.add('typecheck');
    const broken = await run();
    assert.equal(broken.failed, true);
    assert.equal(broken.stoppedAt, 'lint');
    assert.deepEqual(broken.ran, ['compile']);
    assert.equal(lock.stages.lint, undefined);
    failing.clear();
    assert.deepEqual((await run()).ran, ['lint', 'preview', 'render']);
  });

  it('plans without running, and stops at --until', async () => {
    const {run} = project();
    const plan = await run({dryRun: true});
    assert.deepEqual(plan.steps, []);
    assert.deepEqual(plan.ran, ['compile', 'lint', 'preview', 'render']);
    const partial = await run({until: 'lint'});
    assert.deepEqual(partial.ran, ['compile', 'lint']);
  });

  it('hashes files by path and content', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hash-'));
    fs.mkdirSync(path.join(root, 'a'));
    fs.writeFileSync(path.join(root, 'a', 'x.txt'), '1');
    const before = hashFiles(root, ['a', 'missing']);
    assert.equal(hashFiles(root, ['a']), before);
    fs.writeFileSync(path.join(root, 'a', 'x.txt'), '2');
    assert.notEqual(hashFiles(root, ['a']), before);
  });
});
