import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {archProblems, archSpecSchema} from '../scripts/diagram-arch-schema.mjs';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {drawioPages, FALLBACK_ICON, importDrawio, laneOf, parseStyle, plainText} from '../scripts/lib/drawio.mjs';
import {starterDraft, stepRoute} from '../scripts/lib/drawio-draft.mjs';
import {videoSchema} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Saved by draw.io itself: containers with relative children, edges re-parented into containers, full stencil URLs.
const fixture = fs.readFileSync(path.join(root, 'test/fixtures/drawio/azure-cache-aside.drawio'), 'utf8');
// The same picture, transcribed by hand from Microsoft's image: the ground truth for positions.
const truth = JSON.parse(fs.readFileSync(path.join(root, 'drafts/under-the-hood/azure-cache-aside.json'), 'utf8')).diagram;

/** draw.io's compressed page format: deflate-raw of the URI-encoded model, in base64. */
const compressed = (xml: string) => {
  const model = /<mxGraphModel[\s\S]*<\/mxGraphModel>/.exec(xml)![0];
  return `<mxfile><diagram id="p" name="Compressed">${zlib.deflateRawSync(Buffer.from(encodeURIComponent(model), 'latin1')).toString('base64')}</diagram></mxfile>`;
};

const imported = importDrawio(fixture, {file: 'azure-cache-aside.drawio'});
const shift = (() => {
  const [a, b] = [imported.spec.nodes.find((node: {id: string}) => node.id === 'client').at, truth.nodes.find((node: {id: string}) => node.id === 'client').at];
  return [a[0] - b[0], a[1] - b[1]];
})();
const near = (a: number[], b: number[], tolerance: number) => Math.hypot(a[0] - shift[0] - b[0], a[1] - shift[1] - b[1]) <= tolerance;

describe('draw.io files', () => {
  it('reads plain and compressed pages, styles and HTML labels', () => {
    assert.deepEqual(drawioPages(fixture).map((page: {name: string}) => page.name), ['Cache-aside']);
    assert.equal(importDrawio(compressed(fixture)).spec.nodes.length, imported.spec.nodes.length);
    assert.deepEqual(parseStyle('text;html=1;fillColor=#E6E6E6;'), {text: true, html: '1', fillColor: '#E6E6E6'});
    assert.equal(plainText('App Service<br>Application&nbsp;tier'), 'App Service\nApplication tier');
    assert.equal(plainText('<div>Cache hit:</div><div>Return value</div>'), 'Cache hit:\nReturn value');
    assert.deepEqual(['#107C10', '#4472C4', '#A6A6A6', '#000000', '#FF0000'].map(laneOf), ['read', 'write', 'telemetry', 'plain', 'plain']);
    assert.throws(() => drawioPages('<svg/>'), /isn't a draw.io file/);
  });
});

describe('importing an architecture from draw.io', () => {
  it('finds every part of the picture, with nothing guessed', () => {
    const {report, spec} = imported;
    assert.deepEqual([report.nodes, report.groups, report.edges, report.steps, report.legend, report.labels], [8, 2, 13, 10, 2, 1]);
    assert.deepEqual(report.guesses, []);
    assert.deepEqual(report.unmappedIcons, []);
    const parsed = archSpecSchema.parse(spec);
    assert.deepEqual(archProblems(parsed), []);
  });

  it('puts components where they are drawn, through nested containers, with their icons, labels and tiles', () => {
    for (const node of truth.nodes) {
      const found = imported.spec.nodes.find((item: {id: string}) => item.id === node.id);
      assert.ok(found, node.id);
      assert.ok(near(found.at, node.at, 1), `${node.id} at ${found.at}`);
      assert.ok(near(found.labelAt, node.labelAt, 13), `${node.id} label at ${found.labelAt}`);
      assert.equal(found.icon, node.icon);
      assert.equal(found.label, node.label);
      assert.equal(Boolean(found.tile), Boolean(node.tile), node.id);
    }
    const vnet = imported.spec.groups.find((group: {id: string}) => group.id === 'vnet');
    assert.equal(vnet.style, 'dashed');
    assert.equal(vnet.icon, 'azure/virtual-network', 'the small icon on its edge is the boundary\'s badge');
    assert.equal(imported.spec.groups.find((group: {id: string}) => group.id === 'subnet').style, 'dotted');
  });

  it('routes edges as drawn, including waypoints in a container\'s coordinates, in the right lanes', () => {
    for (const edge of truth.edges) {
      const found = imported.spec.edges.find((item: {id: string}) => item.id === edge.id);
      assert.ok(found, edge.id);
      assert.equal(found.lane, edge.lane, edge.id);
      assert.equal(found.points.length, edge.points.length, edge.id);
      // draw.io ends an arrow at its icon's box; the hand transcription stopped a little short, so ends may differ by up to 20 px.
      found.points.forEach((point: number[], i: number) => assert.ok(near(point, edge.points[i], 21), `${edge.id} point ${i}: ${point}`));
      assert.equal(found.arrow, edge.arrow ?? true);
    }
  });

  it('pairs numbered badges with their text, and builds the legend', () => {
    for (const step of truth.steps) {
      const found = imported.spec.steps.find((item: {id: string}) => item.id === step.id);
      assert.ok(found && near(found.at, step.at, 1) && near(found.textAt, step.textAt, 1), step.id);
      assert.equal(found.text, step.text);
    }
    assert.deepEqual(imported.spec.legend.map((item: {lane: string; text: string}) => `${item.lane}:${item.text}`), ['read:Read flow', 'write:Write flow']);
    assert.deepEqual(imported.spec.labels.map((label: {text: string}) => label.text), ['Metrics and logs']);
  });

  it('saves embedded SVG icons, falls back for unknown stencils and reports both', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
    const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="custom" value="Custom" style="image;image=data:image/svg+xml,${encodeURIComponent(svg)};" vertex="1" parent="1"><mxGeometry x="10" y="10" width="40" height="40" as="geometry"/></mxCell>
      <mxCell id="odd" value="Mystery service" style="image;image=img/lib/azure2/other/Something_New.svg;" vertex="1" parent="1"><mxGeometry x="200" y="10" width="40" height="40" as="geometry"/></mxCell>
      <mxCell id="box" value="Worker" style="rounded=1;fillColor=#DAE8FC;strokeColor=#6C8EBF;" vertex="1" parent="1"><mxGeometry x="100" y="120" width="120" height="60" as="geometry"/></mxCell>
      </root></mxGraphModel>`;
    const {spec, assets, report} = importDrawio(xml);
    const custom = spec.nodes.find((node: {id: string}) => node.id === 'custom');
    assert.match(custom.icon, /^drawio\/[0-9a-f]{10}$/);
    assert.equal(assets[`icons/${custom.icon}.svg`], svg);
    assert.equal(spec.nodes.find((node: {id: string}) => node.id === 'odd').icon, FALLBACK_ICON);
    assert.deepEqual(report.unmappedIcons, ['img/lib/azure2/other/Something_New.svg']);
    // A plain box with text is a component drawn as its shape, its label inside.
    const box = spec.nodes.find((node: {id: string}) => node.id === 'box');
    assert.deepEqual(box.shape, {kind: 'rect', w: 120, h: 60, fill: '#dae8fc', stroke: '#6c8ebf', rounded: true});
    assert.deepEqual(box.at, box.labelAt);
    assert.ok(archSpecSchema.safeParse(spec).success);
  });
});

describe('the starter draft', () => {
  const show = {id: 'under-the-hood', name: 'Under the Hood', handle: '@UnderTheHood'};
  const draft = starterDraft({id: 'imported-cache-aside', title: 'Cache-aside on Azure', show, spec: archSpecSchema.parse(imported.spec), file: 'azure-cache-aside.drawio'});

  it('walks every numbered step along the route the hand-made episode uses', () => {
    const flows = draft.scenes.flatMap((scene: {primitive: {actions: {do: string; step?: string; edges?: string[]}[]}}) => scene.primitive.actions.filter((action) => action.do === 'flow'));
    const handMade = JSON.parse(fs.readFileSync(path.join(root, 'drafts/under-the-hood/azure-cache-aside.json'), 'utf8')).scenes
      .flatMap((scene: {primitive: {actions: {do: string; step?: string; edges?: string[]}[]}}) => scene.primitive.actions.filter((action) => action.do === 'flow'));
    assert.equal(flows.length, 10);
    for (const flow of handMade) assert.deepEqual(flows.find((item: {step?: string}) => item.step === flow.step)?.edges, flow.edges, flow.step);
    assert.equal(stepRoute(archSpecSchema.parse(imported.spec), imported.spec.steps.find((step: {id: string}) => step.id === 'r4')), 'read-db', 'a step in its own lane beats a closer monitoring route');
  });

  it('draws every route somewhere, and reveals every part', () => {
    type Action = {do: string; target?: string; edge?: string; edges?: string[]};
    const actions: Action[] = draft.scenes.flatMap((scene: {primitive: {actions: Action[]}}) => scene.primitive.actions);
    const drawn = new Set(actions.flatMap((action) => (action.do === 'connect' ? [action.edge] : action.do === 'flow' ? action.edges! : [])));
    assert.deepEqual(imported.spec.edges.map((edge: {id: string}) => edge.id).filter((id: string) => !drawn.has(id)), []);
    const revealed = new Set(actions.filter((action) => action.do === 'reveal').map((action) => action.target));
    for (const item of [...imported.spec.nodes, ...imported.spec.groups, ...imported.spec.labels]) assert.ok(revealed.has(item.id), item.id);
  });

  it('compiles as a 16:9 walkthrough without edits', () => {
    const {manifest} = compileEpisode(draft, {showId: 'under-the-hood'});
    assert.equal(manifest.direction.storyPattern, 'walkthrough');
    assert.deepEqual(manifest.format, {width: 1920, height: 1080, fps: 30});
    assert.deepEqual(manifest.scenes.map((scene: {id: string}) => scene.id), ['hook', 'setup-1', 'read-1', 'read-4', 'write-1', 'write-4', 'monitoring', 'verdict']);
    assert.ok(videoSchema.safeParse(manifest).success);
  });
});
