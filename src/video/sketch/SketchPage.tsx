import {loadFont} from '@remotion/google-fonts/PatrickHandSC';
import {evolvePath} from '@remotion/paths';
import React from 'react';
import {interpolate} from 'remotion';
import {captionAt} from '../../../scripts/lib/captions.mjs';
import {laidOut, type VideoManifest, type VideoScene} from '../../schema';
import {viewTransform, type Size} from '../canvas/camera';
import {canvasState, type CanvasState} from '../diagram/state';
import {CIRCLE_RED, edgePlan, groupPlan, INK, markPlan, nodePlan, notePlan, partProgress, penTip, titlePlan, type Part, type Plan} from './plan';

// The notebook theme (#132): the diagram drawn by hand on a dotted page, the
// camera following the pen, then pulling back to the finished page on the
// desk. Everything is a function of the frame (./plan.ts, ../diagram/state.ts).

const {fontFamily: LETTERING} = loadFont('normal', {weights: ['400'], subsets: ['latin']});
export const FRAME: Size = {width: 1080, height: 1920};
const PAPER = '#f8f5ee';
const DOTS = '#bdb6a8';
const DESK = '#2b2622';
/** How long the pen takes to lift away once an element is finished. */
const LIFT = .45;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** One part of a plan, `share` of it drawn. */
const PartView: React.FC<{part: Part; share: number; id: string}> = ({part, share, id}) => {
  if (share <= 0) return null;
  if (part.type === 'text') {
    const top = part.y - part.size * 1.05;
    return <g>
      {share < 1 ? <defs><clipPath id={id}><rect x={part.x - 6} y={top} width={(part.width + 12) * share} height={part.size * 1.5} /></clipPath></defs> : null}
      <text x={part.x} y={part.y} textLength={part.width} lengthAdjust="spacing" fill={part.color} clipPath={share < 1 ? `url(#${id})` : undefined} style={{fontFamily: LETTERING, fontSize: part.size}}>{part.text}</text>
    </g>;
  }
  const style: React.CSSProperties = part.marker ? {mixBlendMode: 'multiply'} : {};
  const common = {d: part.d, fill: 'none', stroke: part.stroke, strokeWidth: part.width, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, opacity: part.opacity ?? 1, style};
  if (part.dash) return <path {...common} strokeDasharray={part.dash} opacity={(part.opacity ?? 1) * share} />;
  if (share >= 1) return <path {...common} />;
  const evolved = evolvePath(share, part.d);
  return <path {...common} strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} />;
};

const PlanView: React.FC<{plan: Plan; progress: number; id: string}> = ({plan, progress, id}) => {
  if (progress <= 0) return null;
  const shares = partProgress(plan, progress);
  return <g>{plan.parts.map((part, i) => <PartView key={i} part={part} share={shares[i]} id={`${id}-${i}`} />)}</g>;
};

/** A fineliner (or a marker, when colouring), its tip at the origin, pointing up and left like a right hand's. */
const Pen: React.FC<{marker?: string}> = ({marker}) => {
  const barrel = marker ?? '#262626';
  const body = <>
    <path d={marker ? 'M 0 0 L 30 -14 L 34 12 Z' : 'M 0 0 L 30 -6 L 30 6 Z'} />
    <rect x={28} y={-15} width={100} height={30} rx={6} />
    <rect x={124} y={-19} width={300} height={38} rx={10} />
    <rect x={420} y={-17} width={40} height={34} rx={14} />
  </>;
  return <g transform="rotate(52)">
    <g transform="translate(30 38)" fill="#000" opacity={.18} style={{filter: 'blur(9px)'}}>{body}</g>
    <path d={marker ? 'M 0 0 L 30 -14 L 34 12 Z' : 'M 0 0 L 30 -6 L 30 6 Z'} fill={marker ?? '#8f8f8f'} />
    <rect x={28} y={-15} width={100} height={30} rx={6} fill={marker ? '#d9d9d9' : '#1b1b1b'} />
    <rect x={124} y={-19} width={300} height={38} rx={10} fill={barrel} />
    <rect x={124} y={-19} width={300} height={10} rx={5} fill="#ffffff" opacity={.18} />
    <rect x={210} y={-12} width={110} height={24} rx={3} fill="#f2f2f2" opacity={marker ? .0 : .9} />
    <rect x={420} y={-17} width={40} height={34} rx={14} fill={marker ? '#efefef' : '#141414'} />
  </g>;
};

type Drawn = {plan: Plan; progress: number; start: number; end: number};

/** The pen glides between strokes instead of jumping: its position is a weighted average over the last few frames. */
const GLIDE = [.36, .24, .16, .11, .08, .05];

const penState = (drawn: Drawn[], time: number, fps: number) => {
  const samples = GLIDE.map((weight, i) => ({weight, pen: penAt(drawn, time - i / fps)})).filter((sample) => sample.pen);
  if (!samples.length || !penAt(drawn, time)) return null;
  const total = samples.reduce((sum, sample) => sum + sample.weight, 0);
  const mean = (key: 'x' | 'y' | 'lift') => samples.reduce((sum, sample) => sum + sample.pen![key] * sample.weight, 0) / total;
  return {x: mean('x'), y: mean('y'), lift: mean('lift'), marker: penAt(drawn, time)!.marker};
};

/** What the pen is drawing at `time`, or what it last finished (so it can lift away from it). */
const penAt = (drawn: Drawn[], time: number) => {
  const at = drawn.map((item) => ({...item, progress: item.end > item.start ? clamp01((time - item.start) / (item.end - item.start)) : time >= item.start ? 1 : 0}));
  const active = at.filter((item) => item.progress > 0 && item.progress < 1).sort((a, b) => b.start - a.start)[0];
  if (active) {
    const tip = penTip(active.plan, active.progress, time * 13);
    return tip ? {...tip, lift: 0} : null;
  }
  const last = at.filter((item) => item.progress >= 1 && time - item.end < LIFT).sort((a, b) => b.end - a.end)[0];
  if (!last) return null;
  const tip = penTip(last.plan, .999, 0);
  return tip ? {...tip, lift: clamp01((time - last.end) / LIFT)} : null;
};

const Page: React.FC<{manifest: VideoManifest; state: CanvasState; fps: number}> = ({manifest, state, fps}) => {
  const {spec, layout} = laidOut(manifest);
  const title = titlePlan(spec, layout);
  const drawn: Drawn[] = [];
  const nodes = spec.nodes.filter((node) => state.nodes[node.id]).map((node) => {
    const entry = state.nodes[node.id];
    drawn.push({plan: nodePlan(spec, layout, node.id), progress: entry.progress, start: entry.start, end: entry.end});
    if (entry.mark > 0) drawn.push({plan: markPlan(layout, node.id), progress: entry.mark, start: entry.markStart, end: entry.markEnd});
    return node;
  });
  const edges = spec.edges.filter((edge) => state.edges[edge.id]).map((edge) => {
    const entry = state.edges[edge.id];
    drawn.push({plan: edgePlan(spec, layout, edge.id), progress: entry.progress, start: entry.start, end: entry.end});
    if (entry.mark > 0) drawn.push({plan: markPlan(layout, edge.id), progress: entry.mark, start: entry.markStart, end: entry.markEnd});
    return edge;
  });
  const groups = spec.groups.filter((group) => state.groups[group.id] && layout.groups[group.id]);
  for (const group of groups) drawn.push({plan: groupPlan(spec, layout, group.id), progress: state.groups[group.id].progress, start: state.groups[group.id].start, end: state.groups[group.id].end});
  if (title) drawn.push({plan: title, progress: state.title.progress, start: state.title.start, end: state.title.end});
  for (const note of state.notes) drawn.push({plan: notePlan(layout, note.target, note.text), progress: note.progress, start: note.start, end: note.end});
  const pen = penState(drawn, state.time, fps);
  return <svg width={layout.width} height={layout.height} overflow="visible" style={{position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: viewTransform(state.camera, FRAME)}}>
    <defs>
      <pattern id="sketch-dots" width={36} height={36} patternUnits="userSpaceOnUse"><circle cx={18} cy={18} r={2.3} fill={DOTS} /></pattern>
      <filter id="sketch-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves={2} seed={7} />
        <feColorMatrix values="0 0 0 0 .35  0 0 0 0 .3  0 0 0 0 .25  0 0 0 .09 0" />
      </filter>
    </defs>
    {/* The sheet on the desk: a soft shadow, the paper, its dot grid and a little grain. */}
    <rect x={-6} y={22} width={layout.width + 12} height={layout.height} fill="#000" opacity={.45} style={{filter: 'blur(26px)'}} />
    <rect x={0} y={0} width={layout.width} height={layout.height} fill={PAPER} />
    <rect x={36} y={36} width={layout.width - 72} height={layout.height - 72} fill="url(#sketch-dots)" />
    <rect x={0} y={0} width={layout.width} height={layout.height} filter="url(#sketch-grain)" />
    {title ? <PlanView plan={title} progress={state.title.progress} id="title" /> : null}
    {/* Highlighter goes under the ink, so the arrows show through it. */}
    {edges.filter((edge) => state.edges[edge.id].mark > 0).map((edge) => <PlanView key={`hl-${edge.id}`} plan={markPlan(layout, edge.id)} progress={state.edges[edge.id].mark} id={`hl-${edge.id}`} />)}
    {groups.map((group) => <PlanView key={group.id} plan={groupPlan(spec, layout, group.id)} progress={state.groups[group.id].progress} id={`g-${group.id}`} />)}
    {edges.map((edge) => <PlanView key={edge.id} plan={edgePlan(spec, layout, edge.id)} progress={state.edges[edge.id].progress} id={`e-${edge.id}`} />)}
    {nodes.map((node) => <PlanView key={node.id} plan={nodePlan(spec, layout, node.id)} progress={state.nodes[node.id].progress} id={`n-${node.id}`} />)}
    {state.notes.map((note, i) => <PlanView key={`note-${i}`} plan={notePlan(layout, note.target, note.text)} progress={note.progress} id={`note-${i}`} />)}
    {nodes.filter((node) => state.nodes[node.id].mark > 0).map((node) => <PlanView key={`ring-${node.id}`} plan={markPlan(layout, node.id)} progress={state.nodes[node.id].mark} id={`ring-${node.id}`} />)}
    {pen ? <g transform={`translate(${pen.x + pen.lift * 90} ${pen.y + pen.lift * 140})`} opacity={1 - pen.lift}><Pen marker={pen.marker} /></g> : null}
  </svg>;
};

/** A paper strip for lettering laid over the page: headlines and captions. */
const STRIP: React.CSSProperties = {padding: '10px 28px 16px', background: `${PAPER}f2`, borderRadius: 14, boxShadow: '0 10px 30px #0006', fontFamily: LETTERING, lineHeight: 1.05, color: INK, textAlign: 'center'};

/** The narration a few words at a time, lettered on a paper strip; the spoken word is underlined in red marker. */
const NotebookCaption: React.FC<{words: NonNullable<VideoScene['words']>; seconds: number}> = ({words, seconds}) => {
  const caption = captionAt(words, seconds);
  if (!caption) return null;
  return <div style={{...STRIP, display: 'inline-flex', flexWrap: 'wrap', gap: '0 .3em', fontSize: 66}}>
    {caption.words.map((word, index) => <span key={index} style={{position: 'relative'}}>
      {word.text}
      {index === caption.active ? <span style={{position: 'absolute', left: -4, right: -4, bottom: 4, height: 9, borderRadius: 6, background: CIRCLE_RED, opacity: .8}} /> : null}
    </span>)}
  </div>;
};

/** A notebook diagram scene: the full frame is the desk and the page; captions sit on a paper strip. */
export const SketchScene: React.FC<{scene: VideoScene; manifest: VideoManifest; sceneIndex: number; frame: number; fps: number; durationInFrames: number; fadeOut: boolean}> = ({scene, manifest, sceneIndex, frame, fps, durationInFrames, fadeOut}) => {
  const state = canvasState(manifest, sceneIndex, frame, fps, FRAME);
  const exit = fadeOut ? interpolate(frame, [Math.max(0, durationInFrames - 8), durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
  return <div style={{position: 'absolute', inset: 0, overflow: 'hidden', opacity: exit, background: `radial-gradient(ellipse at 50% 40%, #463e37 0%, ${DESK} 70%)`}}>
    <Page manifest={manifest} state={state} fps={fps} />
    {/* Light falls from the top; the edges of the frame are a touch darker, as under a desk lamp. */}
    <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 30%, transparent 55%, #00000038 100%)', pointerEvents: 'none'}} />
    {/* The scene's headline on a paper tab at the top, like a page heading pinned above the work. */}
    <div style={{position: 'absolute', left: 50, right: 50, top: 120, display: 'flex', justifyContent: 'center'}}>
      <div style={{...STRIP, fontSize: 70}}>{scene.headline}</div>
    </div>
    <div style={{position: 'absolute', left: 50, right: 50, bottom: 110, display: 'flex', justifyContent: 'center', textAlign: 'center'}}>
      {/* Without narration (a preview or CI) the scene's own caption line stands in for the spoken words. */}
      {scene.words?.length ? <NotebookCaption words={scene.words} seconds={frame / fps} /> : <div style={{...STRIP, fontSize: 66}}>{scene.caption}</div>}
    </div>
  </div>;
};
