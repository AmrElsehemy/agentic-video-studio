import React, {useEffect, useState} from 'react';
import {continueRender, delayRender, interpolate, staticFile} from 'remotion';
import type {ArchSpec} from '../../../scripts/diagram-arch-schema.mjs';
import type {ArchitectureDiagram, VideoManifest, VideoScene} from '../../schema';
import {viewTransform} from '../canvas/camera';
import {arrowHead, cached, generator, INK, partProgress, pathParts, roughStrokes, seedOf, text, type Part, type Plan} from '../sketch/plan';
import {DESK, DOTS, LETTERING, NotebookCaption, PAPER, PlanView, Pen, penState, STRIP, type Drawn} from '../sketch/SketchPage';
import {archState, edgePath, nodeBox, type ArchState} from './state';

// Sketch look for architecture walkthroughs (#132): the same picture, at the
// same coordinates, drawn by hand on a dotted page. Routes and boundaries in
// sketchy ink, labels lettered, the real icons coloured in with marker
// strokes, step badges filled with marker, and each flow a highlighter swipe
// the pen follows. A function of the frame, like the clean look (./ArchScene).

/** Ink for each lane: the source's colours, a touch deeper so they read as pen on paper. */
const INKS = {read: '#178a17', write: '#3a68c4', plain: INK, telemetry: '#9b968f'};
const MARKER = {read: '#2fa62f', write: '#4a7fe0'};
const LABEL = 17;
const LINE = 18;
const MARGIN = 50;

/** Lines of lettering centred on `at` (or starting there, for left-aligned text), each its own part. */
const lettering = (value: string, [x, y]: [number, number], weight: number, align: 'left' | 'center' | 'right' = 'center', color = INK, size = LABEL) => {
  const lines = value.split('\n');
  const total = lines.reduce((sum, line) => sum + line.length, 0) || 1;
  return lines.map((line, i) => {
    const width = line.length * size * .47;
    const cx = align === 'left' ? x + width / 2 : align === 'right' ? x - width / 2 : x;
    return text(line, cx, y - ((lines.length - 1) * LINE) / 2 + i * LINE + size * .35, size, weight * line.length / total, color);
  });
};

/** Marker hatching over a box, for colouring in (a tile, a badge, an icon). */
const hatch = (box: {x: number; y: number; w: number; h: number}, seed: number, color: string, gap: number, width: number) => generator.toPaths(generator.rectangle(box.x, box.y, box.w, box.h, {seed, roughness: 1.1, stroke: 'none', fill: color, fillStyle: 'hachure', hachureAngle: -40, hachureGap: gap, fillWeight: width}))
  .filter((path) => path.stroke !== 'none').map((path) => path.d);

type IconPlan = Plan & {icon?: {href: string; box: {x: number; y: number; w: number; h: number}; part: number; mask: string}};

/** A component: its grey tile, the icon coloured in, then its label lettered. */
const nodePlan = (spec: ArchSpec, id: string): IconPlan => cached(`arch-node:${id}`, () => {
  const node = spec.nodes.find((item) => item.id === id)!;
  const seed = seedOf(id);
  const box = nodeBox(node);
  if (node.shape) {
    // A plain box or ellipse: its outline in ink, a wash of marker if the source filled it, then its label.
    const {kind, fill, stroke} = node.shape;
    const ink = stroke === 'none' ? INK : stroke;
    const outline = generator.toPaths(kind === 'ellipse' ? generator.ellipse(node.at[0], node.at[1], box.w, box.h, {seed, roughness: 1, stroke: ink, strokeWidth: 2.2}) : generator.rectangle(box.x, box.y, box.w, box.h, {seed, roughness: 1, stroke: ink, strokeWidth: 2.2})).map((path) => path.d).slice(0, 1);
    const wash = fill !== 'none' && fill.toLowerCase() !== '#ffffff' ? pathParts(hatch({x: box.x + 4, y: box.y + 4, w: box.w - 8, h: box.h - 8}, seed + 3, fill, 7, 6), .25, {stroke: fill, width: 6, marker: true, opacity: .55}) : [];
    return {parts: [...pathParts(outline, wash.length ? .3 : .45, {stroke: ink, width: 2.2}), ...wash, ...lettering(node.label, node.labelAt, wash.length ? .45 : .55, node.align)]};
  }
  const tile = node.tile ? pathParts(hatch(node.tile, seed + 5, '#cfcac0', 8, 6), .18, {stroke: '#cfcac0', width: 6, marker: true, opacity: .7}) : [];
  // The icon is revealed through a mask of marker strokes; the strokes themselves are invisible, but the pen follows them.
  const strokes = hatch(box, seed, '#000', 5, 1);
  const mask = strokes.join(' ');
  const iconParts = pathParts([mask], node.tile ? .32 : .45, {stroke: MARKER.write, width: 9, marker: true, opacity: 0});
  const parts: Part[] = [...tile, ...iconParts, ...lettering(node.label, node.labelAt, node.tile ? .5 : .55, node.align)];
  return {parts, icon: {href: staticFile(`icons/${node.icon}.svg`), box, part: tile.length, mask}} as IconPlan;
});

const edgeD = (points: [number, number][]) => edgePath(points);

/** A route in its lane's ink, with a hand-drawn arrowhead. */
const edgePlan = (spec: ArchSpec, id: string): Plan => cached(`arch-edge:${id}`, () => {
  const edge = spec.edges.find((item) => item.id === id)!;
  const d = edgeD(edge.points);
  const seed = seedOf(id);
  const color = INKS[edge.lane];
  const line = roughStrokes(d, seed, {stroke: color, strokeWidth: 2.4, roughness: .55, bowing: .4}).slice(0, 1);
  return {parts: [...pathParts(line, edge.arrow ? .85 : 1, {stroke: color, width: 2.4}), ...(edge.arrow ? pathParts(arrowHead(d, seed + 1, .45), .15, {stroke: color, width: 2.4}) : [])]};
});

/** A boundary: a loose dashed outline and its name. */
const groupPlan = (spec: ArchSpec, id: string): Plan => cached(`arch-group:${id}`, () => {
  const group = spec.groups.find((item) => item.id === id)!;
  const {x, y, w, h} = group.box;
  const outline = generator.toPaths(generator.rectangle(x, y, w, h, {seed: seedOf(id), roughness: 1.2, bowing: .6, stroke: group.color, strokeWidth: 2})).map((path) => path.d).slice(0, 1);
  return {parts: [...pathParts(outline, group.label ? .75 : 1, {stroke: group.color, width: 2, dash: group.style === 'dashed' ? '10 7' : '3 6'}), ...(group.label && group.labelAt ? lettering(group.label, group.labelAt, .25, 'left') : [])]};
});

/** A numbered badge filled with marker in its lane colour, the number lettered in white. */
const badgeParts = (lane: 'read' | 'write', [x, y]: [number, number], n: number | undefined, seed: number, weight: number): Part[] => {
  const color = MARKER[lane];
  const shape = lane === 'read'
    ? generator.toPaths(generator.circle(x, y, 26, {seed, roughness: .8, stroke: INKS[lane], strokeWidth: 2, fill: color, fillStyle: 'hachure', hachureGap: 3, fillWeight: 3.4}))
    : generator.toPaths(generator.rectangle(x - 12, y - 12, 24, 24, {seed, roughness: .8, stroke: INKS[lane], strokeWidth: 2, fill: color, fillStyle: 'hachure', hachureGap: 3, fillWeight: 3.4}));
  const fill = shape.filter((path) => path.fill === 'none' && path.stroke === color).map((path) => path.d);
  const outline = shape.filter((path) => path.stroke === INKS[lane]).map((path) => path.d).slice(0, 1);
  return [
    ...pathParts(outline, weight * .3, {stroke: INKS[lane], width: 2}),
    ...pathParts(fill, weight * (n ? .45 : .7), {stroke: color, width: 3.4, marker: true}),
    ...(n ? [text(String(n), x, y + 6, 19, weight * .25, '#ffffff')] : []),
  ];
};

const stepPlan = (spec: ArchSpec, id: string): Plan => cached(`arch-step:${id}`, () => {
  const step = spec.steps.find((item) => item.id === id)!;
  return {parts: [...badgeParts(step.lane, step.at, step.n, seedOf(id), .4), ...lettering(step.text, step.textAt, .6)]};
});

const legendPlan = (spec: ArchSpec, lane: 'read' | 'write'): Plan => cached(`arch-legend:${lane}`, () => {
  const item = spec.legend.find((entry) => entry.lane === lane)!;
  return {parts: [...badgeParts(lane, item.at, undefined, seedOf(`legend-${lane}`), .4), ...lettering(item.text, [item.at[0] + 22, item.at[1]], .6, 'left')]};
});

const labelPlan = (spec: ArchSpec, id: string): Plan => cached(`arch-label:${id}`, () => {
  const label = spec.labels.find((item) => item.id === id)!;
  return {parts: lettering(label.text, label.at, 1)};
});

/** A flow: a highlighter swipe along its routes, under the ink. */
const flowPlan = (spec: ArchSpec, step: string, edges: string[], lane: 'read' | 'write'): Plan => cached(`arch-flow:${step}`, () => {
  const ds = edges.map((id) => edgeD(spec.edges.find((edge) => edge.id === id)!.points));
  return {parts: pathParts(ds, 1, {stroke: MARKER[lane], width: 15, marker: true, opacity: .32})};
});

/** Holds the render until the icons have loaded, so a frame never shows a blank where an icon will be. */
const useIcons = (hrefs: string[]) => {
  const [handle] = useState(() => delayRender('Loading architecture icons'));
  useEffect(() => {
    Promise.all(hrefs.map((href) => new Promise((resolve) => { const image = new Image(); image.onload = image.onerror = resolve; image.src = href; }))).then(() => continueRender(handle));
  }, []);
};

const IconView: React.FC<{plan: IconPlan; progress: number; id: string}> = ({plan, progress, id}) => {
  if (!plan.icon || progress <= 0) return null;
  const share = partProgress(plan, progress)[plan.icon.part];
  if (share <= 0) return null;
  const {box, href, mask} = plan.icon;
  // The mask is the marker strokes drawn so far, thick enough to cover the icon between them.
  return <g>
    <defs><mask id={id} maskUnits="userSpaceOnUse" x={box.x - 4} y={box.y - 4} width={box.w + 8} height={box.h + 8}>
      <path d={mask} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" pathLength={1} strokeDasharray={share >= 1 ? undefined : 1} strokeDashoffset={share >= 1 ? undefined : 1 - share} />
    </mask></defs>
    <image href={href} x={box.x} y={box.y} width={box.w} height={box.h} mask={share >= 1 ? undefined : `url(#${id})`} />
  </g>;
};

const Page: React.FC<{spec: ArchSpec; state: ArchState; fps: number}> = ({spec, state, fps}) => {
  useIcons(spec.nodes.filter((node) => node.icon).map((node) => staticFile(`icons/${node.icon}.svg`)));
  const drawn: Drawn[] = [];
  const add = (plan: Plan, entry: {progress: number; start: number; end: number}) => { drawn.push({plan, ...entry}); return plan; };
  const nodes = spec.nodes.filter((node) => state.nodes[node.id]);
  const groups = spec.groups.filter((group) => state.groups[group.id]);
  const edges = spec.edges.filter((edge) => state.edges[edge.id]);
  const steps = spec.steps.filter((step) => state.steps[step.id]);
  const labels = spec.labels.filter((label) => state.labels[label.id]);
  const legend = spec.legend.filter((item) => state.legend[item.lane] > 0);
  const flows = state.flows.filter((flow) => flow.progress > 0);
  for (const group of groups) add(groupPlan(spec, group.id), state.groups[group.id]);
  for (const flow of flows) add(flowPlan(spec, flow.step, flow.edges, flow.lane), flow);
  for (const edge of edges) add(edgePlan(spec, edge.id), state.edges[edge.id]);
  for (const node of nodes) add(nodePlan(spec, node.id), state.nodes[node.id]);
  for (const step of steps) add(stepPlan(spec, step.id), {...state.steps[step.id], end: Math.max(state.steps[step.id].end, state.steps[step.id].start + 1)});
  for (const label of labels) add(labelPlan(spec, label.id), state.labels[label.id]);
  // The legend is lettered as its lane's first step starts.
  const legendStart = (lane: 'read' | 'write') => Math.min(...state.flows.filter((flow) => flow.lane === lane).map((flow) => flow.start));
  for (const item of legend) add(legendPlan(spec, item.lane), {progress: Math.min(1, Math.max(0, (state.time - legendStart(item.lane)) / .9)), start: legendStart(item.lane), end: legendStart(item.lane) + .9});
  const pen = penState(drawn, state.time, fps);
  const progressOf = (plan: Plan) => drawn.find((item) => item.plan === plan)?.progress ?? 0;
  const {width, height} = spec.source;
  return <svg width={width} height={height} overflow="visible" style={{position: 'absolute', left: 0, top: 0}}>
    <defs>
      <pattern id="arch-dots" width={24} height={24} patternUnits="userSpaceOnUse"><circle cx={12} cy={12} r={1.4} fill={DOTS} /></pattern>
      <filter id="arch-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={11} />
        <feColorMatrix values="0 0 0 0 .35  0 0 0 0 .3  0 0 0 0 .25  0 0 0 .08 0" />
      </filter>
    </defs>
    <rect x={-MARGIN - 4} y={-MARGIN + 14} width={width + MARGIN * 2 + 8} height={height + MARGIN * 2} fill="#000" opacity={.45} style={{filter: 'blur(18px)'}} />
    <rect x={-MARGIN} y={-MARGIN} width={width + MARGIN * 2} height={height + MARGIN * 2} fill={PAPER} />
    <rect x={-MARGIN + 20} y={-MARGIN + 20} width={width + MARGIN * 2 - 40} height={height + MARGIN * 2 - 40} fill="url(#arch-dots)" />
    <rect x={-MARGIN} y={-MARGIN} width={width + MARGIN * 2} height={height + MARGIN * 2} filter="url(#arch-grain)" />
    {groups.map((group) => <PlanView key={group.id} plan={groupPlan(spec, group.id)} progress={state.groups[group.id].progress} id={`ag-${group.id}`} />)}
    {flows.map((flow, i) => <PlanView key={`f-${i}`} plan={flowPlan(spec, flow.step, flow.edges, flow.lane)} progress={flow.progress} id={`af-${flow.step}`} />)}
    {edges.map((edge) => <PlanView key={edge.id} plan={edgePlan(spec, edge.id)} progress={state.edges[edge.id].progress} id={`ae-${edge.id}`} />)}
    {nodes.map((node) => {
      const plan = nodePlan(spec, node.id);
      return <g key={node.id}>
        <PlanView plan={plan} progress={state.nodes[node.id].progress} id={`an-${node.id}`} />
        <IconView plan={plan} progress={state.nodes[node.id].progress} id={`ai-${node.id}`} />
      </g>;
    })}
    {steps.map((step) => <PlanView key={step.id} plan={stepPlan(spec, step.id)} progress={progressOf(stepPlan(spec, step.id))} id={`as-${step.id}`} />)}
    {labels.map((label) => <PlanView key={label.id} plan={labelPlan(spec, label.id)} progress={state.labels[label.id].progress} id={`al-${label.id}`} />)}
    {legend.map((item) => <PlanView key={item.lane} plan={legendPlan(spec, item.lane)} progress={progressOf(legendPlan(spec, item.lane))} id={`alg-${item.lane}`} />)}
    {pen ? <g transform={`translate(${pen.x + pen.lift * 40} ${pen.y + pen.lift * 60}) scale(.42)`} opacity={1 - pen.lift}><Pen marker={pen.marker} /></g> : null}
  </svg>;
};

/** An architecture scene in the sketch look: the page on the desk, the chapter on a paper strip, captions lettered at the bottom. */
export const ArchSketchScene: React.FC<{scene: VideoScene; manifest: VideoManifest; sceneIndex: number; frame: number; fps: number; durationInFrames: number; fadeOut: boolean; chrome?: boolean}> = ({scene, manifest, sceneIndex, frame, fps, durationInFrames, fadeOut, chrome = true}) => {
  const {spec} = manifest.diagram as ArchitectureDiagram;
  const size = {width: manifest.format.width, height: manifest.format.height};
  const state = archState(manifest, sceneIndex, frame, fps, size);
  const exit = fadeOut ? interpolate(frame, [Math.max(0, durationInFrames - 8), durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
  return <div style={{position: 'absolute', inset: 0, overflow: 'hidden', opacity: exit, background: `radial-gradient(ellipse at 50% 40%, #463e37 0%, ${DESK} 75%)`}}>
    <div style={{position: 'absolute', left: 0, top: 0, width: spec.source.width, height: spec.source.height, transformOrigin: '0 0', transform: viewTransform(state.camera, size)}}>
      <Page spec={spec} state={state} fps={fps} />
    </div>
    <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 35%, transparent 60%, #00000030 100%)', pointerEvents: 'none'}} />
    {chrome ? <>
      <div style={{position: 'absolute', left: 50, top: 40}}>
        <div style={{...STRIP, textAlign: 'left', fontSize: 50, padding: '8px 24px 12px'}}>{scene.headline}</div>
      </div>
      <div style={{position: 'absolute', left: 120, right: 120, bottom: 44, display: 'flex', justifyContent: 'center', textAlign: 'center'}}>
        {scene.words?.length ? <NotebookCaption words={scene.words} seconds={frame / fps} /> : <div style={{...STRIP, fontSize: 60}}>{scene.caption}</div>}
      </div>
    </> : null}
  </div>;
};
