import {loadFont} from '@remotion/google-fonts/Tinos';
import {evolvePath} from '@remotion/paths';
import React from 'react';
import {Img, interpolate, spring, staticFile} from 'remotion';
import {captionAt} from '../../../scripts/lib/captions.mjs';
import {LANE_COLORS, type ArchSpec} from '../../../scripts/diagram-arch-schema.mjs';
import type {ArchitectureDiagram, VideoManifest, VideoScene} from '../../schema';
import {viewTransform, type Size} from '../canvas/camera';
import {bodyFont} from '../typography';
import {archState, dotAt, edgePath, nodeBox, TEXT, type ArchState} from './state';

// Architecture scenes (#120): an existing reference diagram replayed as it
// was drawn (white page, real icons, dashed boundaries, numbered steps), the
// camera moving from step to step while dots in each lane's colour travel
// the arrows. Everything is a function of the frame (./state.ts).

const {fontFamily: SERIF} = loadFont('normal', {weights: ['400', '700'], subsets: ['latin']});
const INK = '#1b1b1b';
const TILE = '#e6e6e6';
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Source text: centred lines in the diagram's serif, like the original labels. */
const Lines: React.FC<{text: string; at: [number, number]; align?: 'left' | 'center' | 'right'; opacity?: number; weight?: number}> = ({text, at: [x, y], align = 'center', opacity = 1, weight = 400}) => {
  const lines = text.split('\n');
  const first = y - ((lines.length - 1) * TEXT.line) / 2 + TEXT.size * .35;
  return <text x={x} y={first} textAnchor={align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'} fill={INK} opacity={opacity} style={{fontFamily: SERIF, fontSize: TEXT.size, fontWeight: weight}}>
    {lines.map((line, i) => <tspan key={i} x={x} dy={i ? TEXT.line : 0}>{line}</tspan>)}
  </text>;
};

/** An arrowhead at the end of a route, along its last segment. */
const head = (points: [number, number][]) => {
  const [[x1, y1], [x2, y2]] = points.slice(-2);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const wing = (turn: number): [number, number] => [x2 - Math.cos(angle + turn) * 10, y2 - Math.sin(angle + turn) * 10];
  const [a, b] = [wing(.42), wing(-.42)];
  return `M ${x2} ${y2} L ${a[0]} ${a[1]} L ${b[0]} ${b[1]} Z`;
};

const Edge: React.FC<{edge: ArchSpec['edges'][number]; progress: number}> = ({edge, progress}) => {
  if (progress <= 0) return null;
  const d = edgePath(edge.points);
  const color = LANE_COLORS[edge.lane];
  const width = edge.lane === 'read' ? 2 : edge.lane === 'telemetry' ? 1.3 : 1.6;
  const evolved = progress < 1 ? evolvePath(progress, d) : null;
  return <g>
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="miter" {...(evolved ? {strokeDasharray: evolved.strokeDasharray, strokeDashoffset: evolved.strokeDashoffset} : {})} />
    {edge.arrow ? <path d={head(edge.points)} fill={color} opacity={clamp01((progress - .9) / .1)} /> : null}
  </g>;
};

/** A step's badge: a green circle for reads, a blue square for writes, as in the source's legend. */
const Badge: React.FC<{lane: 'read' | 'write'; n?: number; at: [number, number]; pop: number}> = ({lane, n, at: [x, y], pop}) => {
  const color = LANE_COLORS[lane];
  return <g transform={`translate(${x} ${y}) scale(${pop})`} opacity={clamp01(pop * 2)}>
    {lane === 'read' ? <circle r={12} fill={color} /> : <rect x={-12} y={-12} width={24} height={24} fill={color} />}
    {n ? <text y={4.5} textAnchor="middle" fill="#fff" style={{fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 13, fontWeight: 700}}>{n}</text> : null}
  </g>;
};

const Picture: React.FC<{spec: ArchSpec; state: ArchState; fps: number; frame: number}> = ({spec, state, fps}) => {
  // Pops use the run clock, so a badge settles the same way whatever scene it falls in.
  const pop = (start: number) => spring({frame: Math.round((state.time - start) * fps), fps, config: {damping: 14, stiffness: 190, mass: .7}});
  const fade = (start: number, dur = .35) => clamp01((state.time - start) / dur);
  return <>
    <svg width={spec.source.width} height={spec.source.height} overflow="visible" style={{position: 'absolute', left: 0, top: 0}}>
      {spec.nodes.filter((node) => node.tile && state.nodes[node.id]).map((node) => <rect key={`tile-${node.id}`} {...node.tile!} width={node.tile!.w} height={node.tile!.h} fill={TILE} opacity={fade(state.nodes[node.id].start)} />)}
      {spec.groups.filter((group) => state.groups[group.id]).map((group) => {
        const {progress, start} = state.groups[group.id];
        return <g key={group.id}>
          <rect x={group.box.x} y={group.box.y} width={group.box.w} height={group.box.h} rx={group.style === 'dashed' ? 8 : 0} fill="none" stroke={group.color} strokeWidth={group.style === 'dashed' ? 1.3 : 1} strokeDasharray={group.style === 'dashed' ? '5 4' : '2 3'} opacity={clamp01(progress * 1.4)}
            style={{clipPath: `inset(0 ${100 - progress * 100}% 0 0)`}} />
          {group.label && group.labelAt ? <Lines text={group.label} at={group.labelAt} align="left" opacity={fade(start + .2)} /> : null}
        </g>;
      })}
      {spec.edges.filter((edge) => state.edges[edge.id]).map((edge) => <Edge key={edge.id} edge={edge} progress={state.edges[edge.id].progress} />)}
      {/* A plain box or ellipse from the source, drawn with its own colours. */}
      {spec.nodes.filter((node) => node.shape && state.nodes[node.id]).map((node) => {
        const box = nodeBox(node);
        const {kind, fill, stroke, rounded} = node.shape!;
        const p = pop(state.nodes[node.id].start);
        const props = {fill: fill === 'none' ? '#ffffff' : fill, stroke: stroke === 'none' ? 'none' : stroke, strokeWidth: 1.4, opacity: clamp01(p * 1.5), transform: `translate(${node.at[0]} ${node.at[1]}) scale(${.7 + .3 * p}) translate(${-node.at[0]} ${-node.at[1]})`};
        return kind === 'ellipse' ? <ellipse key={`shape-${node.id}`} cx={node.at[0]} cy={node.at[1]} rx={box.w / 2} ry={box.h / 2} {...props} /> : <rect key={`shape-${node.id}`} x={box.x} y={box.y} width={box.w} height={box.h} rx={rounded ? 8 : 0} {...props} />;
      })}
      {spec.labels.filter((label) => state.labels[label.id]).map((label) => <Lines key={label.id} text={label.text} at={label.at} opacity={fade(state.labels[label.id].start)} />)}
      {spec.nodes.filter((node) => state.nodes[node.id]).map((node) => <Lines key={`label-${node.id}`} text={node.label} at={node.labelAt} align={node.align} opacity={fade(state.nodes[node.id].start + .15)} />)}
      {spec.steps.filter((step) => state.steps[step.id]).map((step) => <g key={step.id}>
        <Badge lane={step.lane} n={step.n} at={step.at} pop={pop(state.steps[step.id].start)} />
        <Lines text={step.text} at={step.textAt} opacity={fade(state.steps[step.id].start + .15)} />
      </g>)}
      {spec.legend.filter((item) => state.legend[item.lane] > 0).map((item) => <g key={item.lane} opacity={state.legend[item.lane]}>
        <Badge lane={item.lane} at={item.at} pop={1} />
        <Lines text={item.text} at={[item.at[0] + 22, item.at[1]]} align="left" />
      </g>)}
      {/* Each flow's dot, while it travels; a soft ring makes it readable over the lines. */}
      {state.flows.filter((flow) => flow.progress > 0 && state.time < flow.end + .25).map((flow, i) => {
        const dot = dotAt(spec, flow);
        if (!dot) return null;
        const color = LANE_COLORS[flow.lane];
        const out = 1 - clamp01((state.time - flow.end) / .25);
        return <g key={`dot-${i}`} opacity={out}>
          <circle cx={dot.x} cy={dot.y} r={13} fill={color} opacity={.22} />
          <circle cx={dot.x} cy={dot.y} r={6.5} fill={color} stroke="#fff" strokeWidth={2} />
        </g>;
      })}
    </svg>
    {spec.nodes.filter((node) => node.icon && state.nodes[node.id]).map((node) => {
      const p = pop(state.nodes[node.id].start);
      const glow = state.nodes[node.id].highlight;
      return <Img key={`icon-${node.id}`} src={staticFile(`icons/${node.icon}.svg`)} style={{position: 'absolute', left: node.at[0] - node.size / 2, top: node.at[1] - node.size / 2, width: node.size, height: node.size, opacity: clamp01(p * 1.5), transform: `scale(${.55 + .45 * p})`, filter: glow ? `drop-shadow(0 0 ${8 * glow}px #4472c4)` : undefined}} />;
    })}
    {spec.groups.filter((group) => group.icon && group.iconAt && state.groups[group.id]).map((group) => <Img key={`gicon-${group.id}`} src={staticFile(`icons/${group.icon}.svg`)} style={{position: 'absolute', left: group.iconAt![0] - 18, top: group.iconAt![1] - 18, width: 36, height: 36, opacity: fade(state.groups[group.id].end - .2)}} />)}
  </>;
};

/** Narration a phrase at a time, the spoken word in the write-flow blue. */
const Caption: React.FC<{words: NonNullable<VideoScene['words']>; seconds: number}> = ({words, seconds}) => {
  const caption = captionAt(words, seconds);
  if (!caption) return null;
  return <div style={{display: 'inline-flex', gap: '0 .3em', flexWrap: 'wrap', justifyContent: 'center', padding: '12px 30px 14px', borderRadius: 12, background: '#ffffff', boxShadow: '0 6px 24px #0000001f, 0 0 0 1px #00000010', fontFamily: bodyFont, fontWeight: 700, fontSize: 44, color: INK}}>
    {caption.words.map((word, i) => <span key={i} style={{color: i === caption.active ? LANE_COLORS.write : undefined}}>{word.text}</span>)}
  </div>;
};

export const ARCH_FRAME: Size = {width: 1920, height: 1080};

/** A scene of an architecture walkthrough: the diagram fills the frame, the chapter sits top left, captions at the bottom. */
export const ArchScene: React.FC<{scene: VideoScene; manifest: VideoManifest; sceneIndex: number; frame: number; fps: number; durationInFrames: number; fadeOut: boolean; chrome?: boolean}> = ({scene, manifest, sceneIndex, frame, fps, durationInFrames, fadeOut, chrome = true}) => {
  const {spec} = manifest.diagram as ArchitectureDiagram;
  const size = {width: manifest.format.width, height: manifest.format.height};
  const state = archState(manifest, sceneIndex, frame, fps, size);
  const exit = fadeOut ? interpolate(frame, [Math.max(0, durationInFrames - 8), durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
  const chapter = interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});
  return <div style={{position: 'absolute', inset: 0, overflow: 'hidden', background: '#ffffff', opacity: exit}}>
    <div style={{position: 'absolute', left: 0, top: 0, width: spec.source.width, height: spec.source.height, transformOrigin: '0 0', transform: viewTransform(state.camera, size)}}>
      <Picture spec={spec} state={state} fps={fps} frame={frame} />
    </div>
    {chrome ? <>
    <div style={{position: 'absolute', left: 56, top: 44, padding: '14px 22px', borderRadius: 10, background: '#ffffffeb', boxShadow: '0 4px 18px #0000001a', fontFamily: bodyFont, opacity: chapter}}>
      {scene.eyebrow ? <div style={{fontSize: 20, fontWeight: 700, letterSpacing: 3, color: LANE_COLORS.write}}>{scene.eyebrow}</div> : null}
      <div style={{fontSize: 38, fontWeight: 900, color: INK, marginTop: 2}}>{scene.headline}</div>
    </div>
    {/* The diagram fades to white under the captions, so they read cleanly over any part of the picture. */}
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 210, background: 'linear-gradient(#ffffff00, #ffffff 58%)'}} />
    <div style={{position: 'absolute', left: 120, right: 120, bottom: 48, display: 'flex', justifyContent: 'center', textAlign: 'center'}}>
      {scene.words?.length ? <Caption words={scene.words} seconds={frame / fps} /> : <div style={{padding: '12px 30px 14px', borderRadius: 12, background: '#ffffff', boxShadow: '0 6px 24px #0000001f, 0 0 0 1px #00000010', fontFamily: bodyFont, fontWeight: 700, fontSize: 44, color: INK}}>{scene.caption}</div>}
    </div>
    </> : null}
  </div>;
};
