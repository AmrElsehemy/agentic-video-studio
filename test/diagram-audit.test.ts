import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {speechSpan, wordTimes} from '../scripts/lib/captions.mjs';
import {withDiagramTimes} from '../scripts/lib/diagram-timing.mjs';
import {auditDiagram, chapterBox, overviewLabels} from '../src/video/diagram/audit';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = (id: string) => JSON.parse(fs.readFileSync(path.join(root, `videos/under-the-hood/${id}/video.json`), 'utf8'));
/** The render props' view of an episode: action times resolved against its words. */
const props = (raw: any) => withDiagramTimes(raw) as any;
const blocking = (raw: any) => auditDiagram(props(raw)).filter((finding) => finding.severity === 'blocking');
const scene = (raw: any, id: string) => raw.scenes.find((item: {id: string}) => item.id === id);

describe('diagram QA', () => {
  for (const id of ['how-avs-works', 'azure-cache-aside', 'azure-cache-aside-sketch', 'url-shortener']) {
    it(`passes the ${id} episode`, () => assert.deepEqual(blocking(manifest(id)), []));
  }

  it('fails an element that appears long before the narration names it', () => {
    const raw = manifest('url-shortener');
    scene(raw, 'setup').primitive.actions.find((action: {target?: string}) => action.target === 'db').at = 0;
    const [finding] = blocking(raw);
    assert.equal(finding.check, 'timing');
    assert.match(finding.message, /"Postgres" appears at 0 s, [\d.]+ s before the narration names it/);
  });

  it('fails anchored actions whose words were spoken at other times than the actions were timed to', () => {
    const timed = props(manifest('url-shortener'));
    const open = timed.scenes.find((item: {id: string}) => item.id === 'open');
    // As when narration is re-voiced but the render props kept the old timings.
    open.words = wordTimes(open.narration, speechSpan(open, {speed: timed.audio?.voice?.speed ?? 1})).map((word: {start: number; end: number}) => ({...word, start: word.start + .8, end: word.end + .8}));
    const findings = auditDiagram(timed).filter((finding) => finding.severity === 'blocking');
    assert.deepEqual(findings.map((finding) => finding.check), ['timing', 'timing']);
    assert.match(findings[0].message, /from its word "Opening"/);
  });

  it('fails a step drawn outside the frame', () => {
    const raw = manifest('url-shortener');
    scene(raw, 'lookup').primitive.actions[0] = {do: 'camera', focus: ['user'], padding: .1, at: 0};
    const findings = blocking(raw);
    assert.deepEqual(findings.map((finding) => finding.check), ['framing']);
    assert.match(findings[0].message, /"Look up code" is drawn in this scene but only 0% of it is in the frame/);
  });

  it('fails a part drawn under the chapter card', () => {
    const raw = manifest('url-shortener');
    const user = raw.diagram.spec.nodes.find((node: {id: string}) => node.id === 'user');
    [user.at, user.labelAt] = [[95, 45], [95, 45]];
    scene(raw, 'hook').primitive.actions[0] = {do: 'camera', focus: 'all', padding: 0, at: 0};
    const findings = blocking(raw);
    assert.equal(findings[0].check, 'covered');
    assert.match(findings[0].message, /"Visitor" is \d+% under the chapter card as it is drawn/);
  });

  it('warns about a named element that only lags its name, rather than failing it', () => {
    const findings = auditDiagram(props(manifest('url-shortener')));
    assert.deepEqual(findings.map((finding) => [finding.check, finding.severity]), [['timing', 'warning']]);
  });

  it('places every label of the final overview inside the frame, before the fade', () => {
    const raw = props(manifest('url-shortener'));
    const overview = overviewLabels(raw)!;
    const total = raw.scenes.reduce((sum: number, item: {durationSeconds: number}) => sum + Math.round(item.durationSeconds * 30), 0) / 30;
    assert.ok(overview.seconds < total - 8 / 30 && overview.seconds > total - 1);
    assert.equal(overview.labels.length, raw.diagram.spec.nodes.length);
    for (const {box} of overview.labels) assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 1920 && box.y + box.h <= 1080);
    // Laid-out diagrams draw inside a map area and aren't read this way.
    assert.equal(overviewLabels(props(manifest('how-avs-works'))), undefined);
  });

  it('estimates the chapter card from its text', () => {
    const short = chapterBox({eyebrow: 'READ FLOW', headline: 'STEP 3'});
    const long = chapterBox({eyebrow: undefined, headline: 'THE CODE IS LOOKED UP IN THE REDIS CACHE FIRST'});
    assert.deepEqual([short.x, short.y], [56, 44]);
    assert.ok(long.w > 900 && short.w < 300 && long.h < short.h);
  });
});
