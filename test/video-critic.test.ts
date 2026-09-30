import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {auditFrames, coverage, difference, occurrences, words} from '../scripts/lib/frame-audit.mjs';
import {createCompletion} from '../scripts/lib/llm.mjs';
import {buildVideoCriticPrompt, critiqueFrames, frameExpectations} from '../scripts/lib/video-critic.mjs';
import {videoSchema, type VideoManifest} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestOf = (id: string): VideoManifest => videoSchema.parse(JSON.parse(fs.readFileSync(path.join(root, `videos/pokepulses/${id}/video.json`), 'utf8')));
const darmanitan = () => manifestOf('darmanitan-555');

/** OCR text a correct render produces: header, visual area and caption band for each scene. */
const goodText = (manifest: VideoManifest) => manifest.scenes.map((scene) => `POKEPULSES #555\n${scene.eyebrow ?? ''}\n${scene.headline}\n${(scene.facts ?? []).join('\n')}\n${scene.caption}\n@PokePulses`);
/** A varied thumbnail per scene (a gradient offset by scene), so no frame is blank or repeated. */
const thumbnails = (count: number) => Array.from({length: count}, (_, scene) => Uint8Array.from({length: 448}, (_, i) => (i * 7 + scene * 60) % 256));
const frames = (manifest: VideoManifest, texts = goodText(manifest)) => texts.map((text, index) => ({text, gray: thumbnails(texts.length)[index]}));
const goodCover = (manifest: VideoManifest) => ({text: `POKEPULSES\nPOKEDEX #555\n${manifest.scenes[0].headline}`, gray: thumbnails(1)[0]});
const checks = (issues: {where: string; check: string; severity: string}[]) => issues.map((issue) => `${issue.severity} ${issue.where} ${issue.check}`);

describe('OCR text matching', () => {
  it('folds case, accents and OCR look-alikes', () => {
    assert.deepEqual(words('Its stats flip T00!'), ['ITS', 'STATS', 'FLIP', 'TOO']);
    assert.deepEqual(words('POKÉDEX #555'), ['POKEDEX', 'SSS']);
    assert.equal(coverage('ITS STATS FLIP TOO', 'ITS STATS FLIP T00'), 1);
    assert.equal(coverage('HURT IT. IT TRANSFORMS.', 'POKEPULSES #555'), 0);
    assert.equal(coverage('', 'anything'), 1);
  });

  it('counts whole-phrase occurrences', () => {
    assert.equal(occurrences('RISK IT FOR ZEN MODE?', 'RISK IT FOR ZEN MODE?\nVS\nRISK IT FOR ZEN MODE?'), 2);
    assert.equal(occurrences('RISK IT FOR ZEN MODE?', 'RISK IT FOR ZEN\nMODE ON'), 1);
    assert.equal(occurrences('RISK IT', 'RISK THEM'), 0);
  });
});

describe('frame audit', () => {
  it('passes a correct render', () => {
    const manifest = darmanitan();
    assert.deepEqual(auditFrames({manifest, frames: frames(manifest), cover: goodCover(manifest)}), []);
  });

  it('catches a missing hook headline (from a real render with the bug reintroduced)', () => {
    const manifest = darmanitan();
    const texts = goodText(manifest);
    texts[0] = 'POKEPULSES #555\nPOKEDEX #555\n50% HP = TRANSFORMATION\n@PokePulses';
    assert.deepEqual(checks(auditFrames({manifest, frames: frames(manifest, texts)})), ['blocking scene 1 (hook) headline']);
  });

  it('finds the headline in the block read when the sparse read garbles it', () => {
    const manifest = darmanitan();
    const texts = goodText(manifest);
    // The sparse read of Terapagos's hook: "ONE POKÉMON. THREE FORMS." came back as "ONE Ste THREE".
    texts[0] = texts[0].replace(manifest.scenes[0].headline, 'Ste');
    const garbled: {text: string; headlineText?: string; gray: Uint8Array}[] = frames(manifest, texts);
    assert.deepEqual(checks(auditFrames({manifest, frames: garbled})), ['blocking scene 1 (hook) headline']);
    garbled[0] = {...garbled[0], headlineText: `${manifest.scenes[0].eyebrow ?? ''}\n${manifest.scenes[0].headline}`};
    assert.deepEqual(auditFrames({manifest, frames: garbled}), []);
  });

  it('never counts the headline read towards duplicate captions', () => {
    const manifest = darmanitan();
    const withHeadline = frames(manifest).map((frame, index) => ({...frame, headlineText: `${manifest.scenes[index].headline}\n${manifest.scenes[index].caption}`}));
    assert.deepEqual(auditFrames({manifest, frames: withHeadline}), []);
  });

  it('catches a caption drawn twice, unless the caption repeats other on-screen text by design', () => {
    const manifest = darmanitan();
    const texts = goodText(manifest);
    texts[5] = `WOULD YOU TRIGGER IT?\nRISK IT FOR ZEN MODE?\nVS\nRISK IT FOR ZEN MODE?\n@PokePulses`;
    assert.deepEqual(checks(auditFrames({manifest, frames: frames(manifest, texts)})), ['blocking scene 6 (cta) caption']);
    manifest.scenes[5].headline = manifest.scenes[5].caption;
    assert.deepEqual(auditFrames({manifest, frames: frames(manifest, texts)}), []);
  });

  it('catches a cover that belongs to another episode', () => {
    const manifest = darmanitan();
    const issues = auditFrames({manifest, frames: frames(manifest), cover: {text: 'POKEPULSES\nWHY BULBASAUR IS NUMBER ONE', gray: thumbnails(1)[0]}});
    assert.deepEqual(checks(issues), ['blocking cover title']);
    assert.match(issues[0].message, /hook headline "HURT IT\. IT TRANSFORMS\."/);
  });

  it('catches blank frames and warns on repeated ones', () => {
    const manifest = darmanitan();
    const set = frames(manifest);
    set[1].gray = new Uint8Array(448).fill(12);
    set[3].gray = set[2].gray;
    assert.deepEqual(checks(auditFrames({manifest, frames: set})), ['blocking scene 2 (identity) blank', 'warning scene 4 (transform) variety']);
    assert.equal(difference([0, 10], [4, 10]), 2);
  });

  it('skips text checks when there is no OCR text', () => {
    const manifest = darmanitan();
    assert.deepEqual(auditFrames({manifest, frames: thumbnails(manifest.scenes.length).map((gray) => ({gray}))}), []);
  });
});

describe('vision critic', () => {
  const image = {png: 'iVBORw0KGgo='};

  it('shows the model every frame and the cover, with what each should contain', () => {
    const manifest = darmanitan();
    const {system, messages} = buildVideoCriticPrompt({manifest, frames: manifest.scenes.map(() => image), cover: image});
    assert.match(system, /safe-area/);
    assert.match(system, /its title is the hook headline \("HURT IT\. IT TRANSFORMS\."\) and it must be about Darmanitan/);
    const parts = messages[0].content;
    assert.equal(parts.filter((part) => part.type === 'image').length, manifest.scenes.length + 1);
    assert.match((parts[0] as {text: string}).text, /"primitive": "meter"/);
    assert.deepEqual(frameExpectations(manifest).map((scene) => scene.id), manifest.scenes.map((scene) => scene.id));
  });

  it('normalises the reported issues and survives a failing model', async () => {
    const manifest = darmanitan();
    const reply = {issues: [
      {where: 'scene 3', check: 'overlap', severity: 'blocking', message: 'The ZEN MODE label crosses the dashed line.'},
      {where: 'scene 5', check: 'mood', severity: 'critical', message: 'Too dark.'},
      {where: 'scene 1', check: 'caption', severity: 'warning', message: '  '},
    ]};
    const {issues} = await critiqueFrames({manifest, frames: [image], complete: async () => `Findings:\n${JSON.stringify(reply)}`});
    assert.deepEqual(issues.map((issue) => [issue.where, issue.check, issue.severity, issue.source]), [['scene 3', 'overlap', 'blocking', 'vision'], ['scene 5', 'other', 'warning', 'vision']]);
    const failed = await critiqueFrames({manifest, frames: [image], complete: async () => { throw new Error('image too large'); }});
    assert.deepEqual(failed, {issues: [], modelError: 'image too large'});
  });
});

describe('image parts in model requests', () => {
  const imageRequest = {system: 's', messages: [{role: 'user', content: [{type: 'text' as const, text: 'Scene 1:'}, {type: 'image' as const, mediaType: 'image/png', data: 'AAAA'}]}]};
  const recording = (body: unknown) => {
    const bodies: {messages: {content: unknown}[]}[] = [];
    const fetchImpl = (async (_url: string, init: {body: string}) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify(body));
    }) as unknown as typeof fetch;
    return {fetchImpl, bodies};
  };

  it('sends images to Claude as base64 image blocks', async () => {
    const {fetchImpl, bodies} = recording({content: [{type: 'text', text: '{}'}], stop_reason: 'end_turn'});
    await createCompletion({provider: 'anthropic', apiKey: 'k', fetchImpl, env: {}})(imageRequest);
    assert.deepEqual(bodies[0].messages[0].content, [{type: 'text', text: 'Scene 1:'}, {type: 'image', source: {type: 'base64', media_type: 'image/png', data: 'AAAA'}}]);
  });

  it('sends images to OpenAI as data URLs, and leaves plain text messages alone', async () => {
    const {fetchImpl, bodies} = recording({choices: [{message: {content: '{}'}, finish_reason: 'stop'}]});
    const complete = createCompletion({provider: 'openai', apiKey: 'k', fetchImpl, env: {}});
    await complete(imageRequest);
    assert.deepEqual(bodies[0].messages[1].content, [{type: 'text', text: 'Scene 1:'}, {type: 'image_url', image_url: {url: 'data:image/png;base64,AAAA'}}]);
    await complete({system: 's', messages: [{role: 'user', content: 'plain'}]});
    assert.equal(bodies[1].messages[1].content, 'plain');
  });
});
