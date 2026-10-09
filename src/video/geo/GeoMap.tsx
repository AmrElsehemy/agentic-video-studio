import React, {useMemo} from 'react';
import {geoCentroid, geoDistance, geoGraticule, geoOrthographic, geoPath, type GeoProjection} from 'd3-geo';
import {evolvePath} from '@remotion/paths';
import {Img, interpolate, staticFile} from 'remotion';
import {paletteMode} from '../../../scripts/lib/palette.mjs';
import {routeUntil, type GeoAnchor, type GeoMapPrimitive} from '../../../scripts/primitive-schema.mjs';
import type {ShotProps} from '../shots';
import {displayFont} from '../typography';
import {cameraAt, cameraKeys, continuesMap, episodeCameraKeys, MAP_SIZE, type BBox, type CameraKey, type Size, type View} from './camera';
import {useGeoData, useReliefData, type GeoData} from './data';
import {RELIEF_STRENGTH, reliefPlacements} from './relief';
import {fitInside, labelBox, resolveLabels, type Box, type Placed} from './labels';
import {labelScale, pop} from './motion';
import {COUNT_FRAMES, countUp, flash, MARCH, marchOffset, ripple} from './effects';
import {barRows, DataBars, PANEL_FRAMES, panelHeight} from './DataBars';
import {TIMELINE_HEIGHT, TimelineStrip} from './TimelineStrip';
import {reconstruction, rotateGeometry} from '../../../scripts/lib/plates.mjs';
import {hasSphereOutline, makeProjection, type ProjectionKind} from './projections';
import {adminVisibility, lookOf, maxLakeRank, maxRiverRank, pickByHash, tiltPoint} from './look';
import {blurSamples, shutterFor, viewShift} from './blur';
import {followView, followWeight, partialRoute, routeLine, routeProgress, type RouteLine} from './route';

// A map drawn entirely from the pinned data and the primitive: the camera flies
// between framings, places light up, labels, markers, arrows and routes appear. Nothing
// here knows which episode or country it is drawing.

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const SIZE: Size = MAP_SIZE;
/** A globe is at least this big (px): one whole planet across the frame. */
const GLOBE_RADIUS = 440;
/** Labels stay this far inside the edges so they never collide with the headline or caption. */
const SAFE = 48;
/** Frames an appearing layer takes to fade/draw in. */
const APPEAR = 12;
const TRACE_SHARE = .35;
/** How old the reconstruction is `t` of the way through the scene: `from` easing to `to` between its start and its end. */
const reconstructionAge = (annotation: Extract<GeoMapPrimitive['annotations'][number], {type: 'reconstruction'}>, t: number) => {
  const end = annotation.until ?? Math.min(1, annotation.at + .8);
  const raw = Math.max(0, Math.min(1, (t - annotation.at) / Math.max(.05, end - annotation.at)));
  const eased = raw < .5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
  return annotation.from + (annotation.to - annotation.from) * eased;
};
/** The age counter's words. */
const ageText = (age: number) => (Math.round(age) <= 0 ? 'TODAY' : `${Math.round(age)} MILLION YEARS AGO`);

/** Frames a meridian or parallel takes to draw itself across the map. */
const LINE_FRAMES = 40;
/** Space an arrow leaves around an anchor without a label (at its start; 60% of it before its target). */
const ARROW_GAP = 60;
const LABEL_SIZE = 46;
/** Marker and route labels are a little smaller, and sit this far above their point. */
const POINT_LABEL_SIZE = 38;
const MARKER_LIFT = 58;
const ROUTE_LIFT = 60;
const BOUNDS = {width: MAP_SIZE.width, height: MAP_SIZE.height, safe: SAFE};
/** Frames relief takes to fade in or out where a continuing map turns it on or off. */
const RELIEF_FADE = 18;

type Route = Extract<GeoMapPrimitive['annotations'][number], {type: 'route'}>;

const sameAnchor = (a: GeoAnchor, b: GeoAnchor) => (typeof a === 'string' || typeof b === 'string' ? a === b : a.lon === b.lon && a.lat === b.lat);

const targetBox = (target: Exclude<GeoMapPrimitive['camera'][number]['target'], 'world'>, data: GeoData): BBox => {
  if (typeof target === 'object') return target.bbox;
  const entity = data.entities.get(target);
  // A city is a point: frame about 2° × 1.5° around it.
  if (entity?.kind === 'city') {
    const [lon, lat] = entity.label ?? [entity.bbox[0], entity.bbox[1]];
    return [lon - 1, lat - 0.75, lon + 1, lat + 0.75];
  }
  // A place's camera frame leaves out remote islands (see frameOf in scripts/lib/geo-data.mjs).
  if (entity) return entity.frame ?? entity.bbox;
  const feature = data.features.get(target);
  if (!feature) throw new Error(`Unknown geo entity ${target}`);
  const [[west, south], [east, north]] = geoPath().bounds(feature);
  return [west, south, east, north];
};

/** Where an anchor sits in [lon, lat]: a country's label point, a sea's centroid, or a point. */
const anchorLonLat = (anchor: GeoAnchor, data: GeoData): [number, number] => {
  if (typeof anchor === 'object') return [anchor.lon, anchor.lat];
  const entity = data.entities.get(anchor);
  if (entity?.label) return entity.label;
  const feature = data.features.get(anchor);
  if (!feature) throw new Error(`Unknown geo entity ${anchor}`);
  return geoCentroid(feature);
};

/**
 * Whether a place's box can be on screen: the frame's corners and edge midpoints,
 * inverted to lon/lat, give the visible range (with a margin). Wide views
 * (more than half the globe) draw everything.
 */
const visibleFilter = (projection: GeoProjection) => {
  const points = [[0, 0], [SIZE.width / 2, 0], [SIZE.width, 0], [SIZE.width, SIZE.height / 2], [SIZE.width, SIZE.height], [SIZE.width / 2, SIZE.height], [0, SIZE.height], [0, SIZE.height / 2]]
    .map(([x, y]) => projection.invert?.([x, y]))
    .filter((point): point is [number, number] => Boolean(point));
  const [centreLon] = projection.invert?.([SIZE.width / 2, SIZE.height / 2]) ?? [0];
  const offsets = points.map(([lon]) => ((lon - centreLon + 540) % 360) - 180);
  const halfSpan = Math.max(...offsets.map(Math.abs));
  if (points.length < 8 || halfSpan > 90) return () => true;
  const margin = halfSpan * .25 + 1;
  const [south, north] = [Math.min(...points.map(([, lat]) => lat)) - margin, Math.max(...points.map(([, lat]) => lat)) + margin];
  return (bbox?: BBox) => {
    if (!bbox) return true;
    const [west, bSouth, east, bNorth] = bbox;
    if (bNorth < south || bSouth > north) return false;
    // Longitudes relative to the centre, so boxes across the antimeridian compare correctly.
    const rel = (lon: number) => ((lon - centreLon + 540) % 360) - 180;
    const [w, e] = [rel(west), rel(east)];
    if (w > e) return true;
    return e >= -(halfSpan + margin) && w <= halfSpan + margin;
  };
};

const keepInside = ([x, y]: [number, number]): [number, number] => [Math.max(SAFE, Math.min(SIZE.width - SAFE, x)), Math.max(SAFE, Math.min(SIZE.height - SAFE, y))];
/**
 * A label or marker whose place has left the frame by more than this is hidden rather
 * than pinned to the edge, where it would point at the wrong place (a camera following a route).
 */
const OFF_FRAME = 160;
const farOffFrame = ([x, y]: [number, number]) => x < -OFF_FRAME || x > SIZE.width + OFF_FRAME || y < -OFF_FRAME || y > SIZE.height + OFF_FRAME;

/**
 * `rise` (0–1) lifts the label into place as it appears; fading for an overlap doesn't move it.
 * `scale` grows it from its centre as it springs in (motion.ts).
 */
const Label: React.FC<{x: number; y: number; text: string; opacity: number; color: string; halo: string; size?: number; rise?: number; scale?: number}> = ({x, y, text, opacity, color, halo, size = LABEL_SIZE, rise = opacity, scale = 1}) => {
  const label = <text x={x} y={y + (1 - rise) * 14} textAnchor="middle" dominantBaseline="middle" opacity={opacity}
    style={{fontFamily: displayFont, fontSize: size, letterSpacing: 3, fontVariantNumeric: 'tabular-nums', fill: color, stroke: halo, strokeWidth: 10, paintOrder: 'stroke', strokeLinejoin: 'round'}}>{text}</text>;
  return scale === 1 ? label : <g transform={`translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`}>{label}</g>;
};

type GeoMapProps = ShotProps & {data: GeoMapPrimitive};

/** The camera's path through a shot: its keyframes, its routes, and where it looks at scene time t (0–1). */
const useCameraPath = ({data: primitive, scene, manifest, seams}: GeoMapProps) => {
  const data = useGeoData();
  const keys = useMemo<CameraKey[] | undefined>(() => {
    if (!data) return undefined;
    const boxOf = (target: Exclude<GeoMapPrimitive['camera'][number]['target'], 'world'>) => targetBox(target, data);
    // A scene that continues the previous map starts the camera where that scene ended.
    if (seams?.in) return episodeCameraKeys(manifest.scenes, manifest.scenes.findIndex((item) => item.id === scene.id), boxOf, SIZE);
    return cameraKeys(primitive.camera, boxOf, SIZE);
  }, [data, primitive, seams?.in, manifest, scene.id]);
  // Routes are computed once per shot: great circles through their stops.
  const routes = useMemo(() => {
    const lines = new Map<number, RouteLine>();
    if (data) primitive.annotations.forEach((annotation, index) => {
      if (annotation.type === 'route') lines.set(index, routeLine(annotation.path.map((stop) => anchorLonLat(stop, data))));
    });
    return lines;
  }, [data, primitive]);
  // A followed route pulls the camera's centre onto its marker while it draws.
  const followedIndex = primitive.annotations.findIndex((annotation) => annotation.type === 'route' && annotation.follow);
  const followed = followedIndex >= 0 ? primitive.annotations[followedIndex] as Route : undefined;
  const viewAt = (t: number): View => (followed
    ? followView(cameraAt(keys!, t), partialRoute(routes.get(followedIndex)!, routeProgress(t, followed.at, routeUntil(followed))).head, followWeight(t, followed.at, routeUntil(followed)))
    : cameraAt(keys!, t));
  return {data, keys, routes, viewAt};
};

/**
 * A map shot. A fast camera move is motion-blurred (blur.ts): the frame is drawn
 * at a few times across part of a frame and averaged, each layer at opacity
 * 1/(n+1) over those below, which weighs every render equally. `blur: false`
 * draws the single frame (a still such as the cover).
 */
export const GeoMapVisual: React.FC<GeoMapProps & {blur?: boolean}> = ({blur = true, ...props}) => {
  const {data, keys, viewAt} = useCameraPath(props);
  if (!blur || !data || !keys) return <GeoMapFrame {...props} />;
  const {frame, durationInFrames} = props;
  const timeOf = (at: number) => (durationInFrames > 1 ? Math.max(0, Math.min(1, at / (durationInFrames - 1))) : 0);
  // Speed in px per frame, measured across the frame itself.
  const speed = viewShift(viewAt(timeOf(frame - .5)), viewAt(timeOf(frame + .5)), SIZE);
  const samples = blurSamples(frame, shutterFor(speed), durationInFrames - 1);
  if (samples.length === 1) return <GeoMapFrame {...props} />;
  return <div style={{position: 'absolute', inset: 0}}>
    {samples.map((sample, index) => <div key={index} style={{position: 'absolute', inset: 0, opacity: 1 / (index + 1)}}><GeoMapFrame {...props} frame={sample} /></div>)}
  </div>;
};

const GeoMapFrame: React.FC<GeoMapProps> = (props) => {
  const {data: primitive, scene, manifest, frame, durationInFrames, accent, seams} = props;
  const {data, keys, routes, viewAt} = useCameraPath(props);
  const look = lookOf(manifest.look);
  // Relief imagery is stored in Web Mercator, so it only fits a flat Mercator map.
  const mercatorFlat = !primitive.globe && (primitive.projection ?? 'mercator') === 'mercator';
  const wantsRelief = mercatorFlat && (Boolean(primitive.relief) || look.relief > 0);
  const relief = useReliefData(wantsRelief);
  if (!data || !keys || (wantsRelief && !relief)) return null;

  const t = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;
  const view = viewAt(t);
  // A ranked bar chart (data view "bars"/"both") takes the bottom of the frame; the map slides up to leave room for it.
  const barsOn = Boolean(primitive.data && primitive.data.view !== 'map');
  const barsStart = primitive.data ? primitive.data.at * durationInFrames : 0;
  const barsPanel = barsOn && primitive.data ? panelHeight(barRows(primitive.data.values.map(({entity, value}) => ({id: entity, name: entity, value, subject: false}))).length) : 0;
  const timelineAnnotation = primitive.annotations.find((annotation): annotation is Extract<GeoMapPrimitive['annotations'][number], {type: 'timeline'}> => annotation.type === 'timeline');
  const timelineStart = timelineAnnotation ? timelineAnnotation.at * durationInFrames : 0;
  const timelineOn = Boolean(timelineAnnotation) && !barsOn;
  const barsShift = Math.max(
    barsOn ? (barsPanel / 2) * interpolate(frame, [barsStart, barsStart + PANEL_FRAMES], [0, 1], clamp) : 0,
    timelineOn ? (TIMELINE_HEIGHT / 2) * interpolate(frame, [timelineStart, timelineStart + 12], [0, 1], clamp) : 0,
  );
  // A globe (orthographic) draws the same layers on a sphere that spins to the camera's centre; its radius follows
  // the camera's zoom but never less than a whole planet filling the frame.
  const globe = Boolean(primitive.globe);
  const flatKind: ProjectionKind = primitive.projection ?? 'mercator';
  const globeRadius = Math.max(view.scale, GLOBE_RADIUS);
  const projection: GeoProjection = globe
    ? geoOrthographic().rotate([-view.lon, -view.lat]).scale(globeRadius).translate([SIZE.width / 2, SIZE.height / 2 - barsShift]).clipAngle(90)
    : makeProjection(flatKind, view, SIZE, barsShift);
  const path = geoPath(projection);
  // Equal Earth and azimuthal maps are drawn as a shape of their own (an egg, a disc) on a darker ground.
  const sphereOutline = !globe && hasSphereOutline(flatKind) ? path({type: 'Sphere'}) ?? '' : '';
  const appear = (at: number, frames = APPEAR) => interpolate(frame, [at * durationInFrames, at * durationInFrames + frames], [0, 1], clamp);
  /** Spring progress (motion.ts) of an entrance at `at`: 0 before, a small overshoot, then 1. */
  const springIn = (at: number) => pop(frame, at * durationInFrames, manifest.format.fps);
  /** A marker or label with an `until` fades out, finishing then. */
  const vanish = (until?: number) => (until === undefined ? 1 : interpolate(frame, [until * durationInFrames - APPEAR, until * durationInFrames], [1, 0], clamp));
  // On a globe a place on the far side is out of sight, so its labels and markers go off screen.
  const point = (lonLat: [number, number]): [number, number] => (globe && geoDistance([view.lon, view.lat], lonLat) > Math.PI / 2 - 0.02 ? [-9999, -9999] : projection(lonLat) as [number, number]);
  const {palette} = manifest;
  const styled = look.name !== 'classic';
  // On a tilted stage text is placed in screen space (where the tilt puts each point) and drawn upright above the
  // stage, so it can never be pushed off screen or stretched; `flat` collects those texts.
  const tilted = styled && look.tilt.degrees > 0 && !globe;
  const toScreen = (p: [number, number]): [number, number] => (tilted ? tiltPoint(look, p, SIZE) : p);
  const flat: React.ReactNode[] = [];
  const bounds = BOUNDS;
  const keepIn = keepInside;
  // A glow reads as light on a dark map; on a light one (#92) it smudges, so it stays tight and faint there.
  const glow = (radius: number, color: string) => paletteMode(palette) === 'light' ? `drop-shadow(0 0 ${radius * .4}px ${color}66)` : `drop-shadow(0 0 ${radius}px ${color})`;
  // Projecting every country each frame is the render's main cost; skip those whose box is off screen.
  const onScreen = globe ? () => true : visibleFilter(projection);
  // When the next scene continues this map, the map stays on screen and only this scene's layers fade out.
  const outro = seams?.out ? interpolate(frame, [Math.max(0, durationInFrames - 8), durationInFrames], [1, 0], clamp) : 1;
  const labels = primitive.annotations.filter((annotation): annotation is Extract<GeoMapPrimitive['annotations'][number], {type: 'label'}> => annotation.type === 'label');

  // Relief fades in when the map it continues had none, and out when the map continuing it drops it,
  // so it never pops on or off mid-flight.
  const sceneIndex = manifest.scenes.findIndex((item) => item.id === scene.id);
  const hasRelief = (index: number) => Boolean((manifest.scenes[index]?.primitive as GeoMapPrimitive | undefined)?.relief);
  const reliefFade = Math.min(
    seams?.in && !hasRelief(sceneIndex - 1) ? interpolate(frame, [0, RELIEF_FADE], [0, 1], clamp) : 1,
    seams?.out && continuesMap(manifest.scenes, sceneIndex + 1) && !hasRelief(sceneIndex + 1) ? interpolate(frame, [durationInFrames - RELIEF_FADE, durationInFrames], [1, 0], clamp) : 1,
  );

  // Where each route has got to this frame.
  const routeStates = new Map([...routes.entries()].map(([index, line]) => {
    const annotation = primitive.annotations[index] as Route;
    const progress = routeProgress(t, annotation.at, routeUntil(annotation));
    return [index, {line, progress, ...partialRoute(line, progress)}];
  }));
  // Every label's place, kept inside the frame; where two overlap the weaker moves aside, or fades (labels.ts).
  // Newer labels win (they are what the narration is on now), the legend always does, and a
  // route's moving label gives way to everything.
  const texts = new Map<number, Placed & {size: number}>();
  primitive.annotations.forEach((annotation, index) => {
    if (annotation.type === 'line') {
      if (!annotation.text) return;
      // The text sits where the line crosses the middle of the frame.
      const projected = point(annotation.kind === 'meridian' ? [annotation.degrees, view.lat] : [view.lon, annotation.degrees]);
      if (farOffFrame(projected)) return;
      const screen = toScreen(projected);
      const [x, y] = keepIn(screen);
      texts.set(index, {box: fitInside(labelBox(x, y, annotation.text, LABEL_SIZE), bounds), anchorY: screen[1], priority: annotation.at, opacity: appear(annotation.at + LINE_FRAMES / 2 / durationInFrames, 14) * vanish(annotation.until), size: LABEL_SIZE});
      return;
    }
    if (annotation.type === 'timeline' || annotation.type === 'reconstruction') return;
    if (annotation.type === 'arrow' || !annotation.text) return;
    if (annotation.type === 'route') {
      if (t < annotation.at) return;
      const [hx, hy] = toScreen(point(routeStates.get(index)!.head));
      texts.set(index, {box: fitInside(labelBox(hx, hy - ROUTE_LIFT, annotation.text, POINT_LABEL_SIZE), bounds), anchorY: hy, priority: -1, opacity: appear(annotation.at), size: POINT_LABEL_SIZE});
      return;
    }
    const projected = point(anchorLonLat(annotation.anchor, data));
    if (farOffFrame(projected)) return;
    const screen = toScreen(projected);
    const [x, y] = keepIn(screen);
    const size = annotation.type === 'marker' ? POINT_LABEL_SIZE : LABEL_SIZE;
    texts.set(index, {box: fitInside(labelBox(x, annotation.type === 'marker' ? y - MARKER_LIFT : y, annotation.text, size), bounds), anchorY: screen[1], priority: annotation.at, opacity: appear(annotation.at) * vanish(annotation.until), size});
  });
  const keyWidth = primitive.data ? legendWidth(valueRange(primitive.data.values.map(({value}) => value)), primitive.data.unit) : LEGEND.width;
  const legendBox: Box | undefined = primitive.data?.legend ? {x: LEGEND.x + keyWidth / 2, y: SIZE.height - SAFE - 112 + 47, halfWidth: keyWidth / 2 + 18, halfHeight: 65} : undefined;
  const placed = [...texts.values(), ...(legendBox ? [{box: legendBox, priority: Infinity, opacity: primitive.data ? appear(primitive.data.at) : 0}] : [])];
  const resolved = resolveLabels(placed, bounds);
  const boxes = new Map([...texts.keys()].map((index, order) => [index, resolved.boxes[order]]));
  const fades = new Map([...texts.keys()].map((index, order) => [index, resolved.fades[order]]));
  /** Text on a tilted stage is drawn upright in the flat layer above it; elsewhere it is drawn in place. */
  const out = (node: React.ReactNode) => {
    if (!tilted) return node;
    flat.push(<React.Fragment key={`flat-${flat.length}`}>{node}</React.Fragment>);
    return null;
  };
  const textOf = (index: number, text: string, opacity: number, rise = opacity, scale = 1) => {
    const [item, box] = [texts.get(index), boxes.get(index)];
    if (!item || !box) return null;
    const shown = opacity * (fades.get(index) ?? 1);
    if (styled && look.chip) {
      // A pill behind the text, drawn and scaled with it.
      return out(<g transform={`translate(${box.x} ${box.y}) scale(${scale}) translate(${-box.x} ${-box.y})`}>
        <rect x={box.x - box.halfWidth - 10} y={box.y - box.halfHeight - 4} width={2 * box.halfWidth + 20} height={2 * box.halfHeight + 8} rx={box.halfHeight + 4} fill={look.chip.fill} opacity={look.chip.opacity * shown} />
        <Label x={box.x} y={box.y} text={text} opacity={shown} rise={rise} color={look.chip.text} halo={look.chip.fill} size={item.size} />
      </g>);
    }
    return out(<Label x={box.x} y={box.y} text={text} opacity={shown} rise={rise} scale={scale} color={palette.ink} halo={palette.background} size={item.size} />);
  };

  const highlights = primitive.highlights.map((highlight, index) => {
      const feature = data.features.get(highlight.entity);
      if (!feature) throw new Error(`Unknown geo entity ${highlight.entity}`);
      const d = path(feature) ?? '';
      const color = highlight.color ?? accent;
      const disputed = highlight.entity.startsWith('disputed:');
      const isLine = feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString';
      if (highlight.style === 'trace' || isLine) {
        const progress = interpolate(frame, [highlight.at * durationInFrames, (highlight.at + TRACE_SHARE) * durationInFrames], [0, 1], clamp);
        const {strokeDasharray, strokeDashoffset} = evolvePath(progress, d);
        return <g key={index}>
          {isLine ? null : <path d={d} fill={color} opacity={.22 * progress} />}
          <path d={d} fill="none" stroke={color} strokeWidth={isLine ? 6 : 7} strokeLinejoin="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} style={{filter: glow(10, color)}} />
        </g>;
      }
      const shown = appear(highlight.at);
      // The border springs to its width, a touch thicker for a moment, as the place lights up.
      const border = springIn(highlight.at);
      const start = highlight.at * durationInFrames;
      // A ripple spreads from the place's centre as it lights up (not for hatched disputed areas).
      const ring = disputed ? null : ripple(frame, start);
      const [cx, cy] = ring ? path.centroid(feature) : [NaN, NaN];
      const lit = highlight.style === 'fill' ? Math.min(1, .85 * shown + .15 * flash(frame, start)) : .85 * shown;
      // A place only a few pixels wide (the Maldives, the Vatican) gets a pulsing ring, so the viewer can find it.
      // (For a small place of several parts, such as an atoll chain, each small part gets one.)
      const smallPlace = styled && !disputed && shown > 0 && Math.abs(path.area(feature)) < 2500;
      const locator = smallPlace ? (() => {
        const parts = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates.map((coordinates) => ({type: 'Polygon' as const, coordinates})) : [feature.geometry];
        const pulse = 1 + .18 * Math.sin((frame - start) / 6);
        const lookColor = look.subject.from;
        const rings = parts.flatMap((part) => {
          const [[x0, y0], [x1, y1]] = path.bounds(part);
          const [lx, ly] = path.centroid(part);
          return Number.isFinite(lx) && Number.isFinite(x0) && Math.max(x1 - x0, y1 - y0) < 40 && lx > 0 && lx < SIZE.width && ly > 0 && ly < SIZE.height ? [[lx, ly] as const] : [];
        }).slice(0, 16);
        return <g opacity={shown}>{rings.map(([lx, ly], ringIndex) => <g key={ringIndex}>
          <circle cx={lx} cy={ly} r={30 * pulse} fill="none" stroke={lookColor} strokeWidth={5} strokeOpacity={.95} style={{filter: glow(12, lookColor)}} />
          <circle cx={lx} cy={ly} r={50 * pulse} fill="none" stroke={lookColor} strokeWidth={2.5} strokeOpacity={.45} />
          <circle cx={lx} cy={ly} r={4} fill={lookColor} />
        </g>)}</g>;
      })() : null;
      // A fill that floods the whole viewport (the camera is inside the place) is only a faint wash with a rim.
      const floods = styled && Math.abs(path.area(feature)) > 1.3 * SIZE.width * SIZE.height;
      if (styled && highlight.style === 'fill' && !disputed) {
        // A slab: the shape stacked a few px lower in a darker colour, then a gradient face and a bright rim.
        const id = `geo-subject-${index}`;
        return <g key={index}>
          <defs>
            <path id={`${id}-shape`} d={d} />
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={look.subject.from} /><stop offset="1" stopColor={look.subject.to} /></linearGradient>
          </defs>
          {/* Land stands on a slab; water doesn't (a lifted sea makes no sense). */}
          {Array.from({length: floods || highlight.entity.startsWith('water:') || highlight.entity.startsWith('lake:') ? 0 : look.subject.depth}, (_, step) => <use key={step} href={`#${id}-shape`} transform={`translate(0 ${(step + 1) * 1.5 * shown})`} fill={look.subject.side} opacity={shown} />)}
          <g style={{filter: glow(look.subject.glow * shown, look.subject.from)}}>
            <use href={`#${id}-shape`} fill={`url(#${id})`} fillOpacity={floods ? .2 * shown : Math.min(1, shown + .15 * flash(frame, start))} stroke={look.subject.rim} strokeOpacity={.9 * shown} strokeWidth={2.6 * border} strokeLinejoin="round" />
          </g>
          {ring && Number.isFinite(cx) && Number.isFinite(cy) ? <circle cx={cx} cy={cy} r={ring.radius} fill="none" stroke={look.subject.rim} strokeOpacity={ring.opacity * outro} strokeWidth={ring.width} /> : null}
          {locator}
        </g>;
      }
      return <g key={index}>
        <path d={d} fill={highlight.style === 'fill' ? (disputed ? 'url(#geo-hatch)' : color) : 'none'} fillOpacity={lit}
          stroke={color} strokeOpacity={shown} strokeWidth={(highlight.style === 'outline' ? 6 : 3) * border} strokeLinejoin="round" style={{filter: glow(14 * shown, color)}} />
        {highlight.style === 'outline' && !disputed && shown > .99 ? <path d={d} fill="none" stroke={palette.ink} strokeOpacity={.5} strokeWidth={2.5} strokeLinejoin="round" strokeDasharray={`${MARCH.dash} ${MARCH.gap}`} strokeDashoffset={marchOffset(frame)} /> : null}
        {ring && Number.isFinite(cx) && Number.isFinite(cy) ? <circle cx={cx} cy={cy} r={ring.radius} fill="none" stroke={color} strokeOpacity={ring.opacity * outro} strokeWidth={ring.width} /> : null}
        {locator}
      </g>;
    });
  // Routes go underneath, so labels and markers on their stops stay readable.
  const annotations = primitive.annotations.map((annotation, index) => [annotation, index] as const).sort(([a], [b]) => Number(b.type === 'route') - Number(a.type === 'route')).map(([annotation, index]) => {
      const shown = appear(annotation.at) * (annotation.type === 'marker' || annotation.type === 'label' ? vanish(annotation.until) : 1);
      if (annotation.type === 'line') {
        if (t < annotation.at) return null;
        // Sampled along the grid line; north to south (west to east for a parallel) unless reversed.
        const coordinates: [number, number][] = annotation.kind === 'meridian'
          ? Array.from({length: 86}, (_, step) => [annotation.degrees, annotation.reverse ? -85 + step * 2 : 85 - step * 2] as [number, number])
          : Array.from({length: 91}, (_, step) => [annotation.reverse ? 180 - step * 4 : -180 + step * 4, annotation.degrees] as [number, number]);
        const d = path({type: 'LineString', coordinates}) ?? '';
        if (!d) return null;
        const progress = interpolate(frame, [annotation.at * durationInFrames, annotation.at * durationInFrames + LINE_FRAMES], [0, 1], clamp);
        const {strokeDasharray, strokeDashoffset} = evolvePath(progress, d);
        const colour = styled ? look.subject.from : accent;
        const core = styled ? look.subject.rim : palette.ink;
        return <g key={index} opacity={vanish(annotation.until)}>
          <path d={d} fill="none" stroke={colour} strokeOpacity={.28} strokeWidth={22} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
          <path d={d} fill="none" stroke={colour} strokeWidth={8} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} style={{filter: glow(12, colour)}} />
          <path d={d} fill="none" stroke={core} strokeOpacity={.85} strokeWidth={2.4} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
        </g>;
      }
      if (annotation.type === 'route') {
        if (t < annotation.at) return null;
        const {line, progress, points, head} = routeStates.get(index)!;
        const travelled = progress * line.distances[line.distances.length - 1];
        const d = points.length > 1 ? path({type: 'LineString', coordinates: points}) ?? '' : '';
        const [hx, hy] = point(head);
        const onFrame = hx >= 0 && hx <= SIZE.width && hy >= 0 && hy <= SIZE.height;
        const pulse = 1 + .3 * Math.abs(Math.sin((frame - annotation.at * durationInFrames) / 7));
        return <g key={index} opacity={shown}>
          <path d={d} fill="none" stroke={accent} strokeOpacity={.3} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke={accent} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
          {/* Each stop gets a dot once the route reaches it. */}
          {line.stops.map((at, stop) => {
            if (travelled + 1e-9 < line.distances[at]) return null;
            const [sx, sy] = point(line.points[at]);
            return <circle key={stop} cx={sx} cy={sy} r={10} fill={palette.ink} stroke={accent} strokeWidth={5} />;
          })}
          {annotation.marker && onFrame ? <>
            <circle cx={hx} cy={hy} r={24 * pulse} fill={accent} opacity={.25} />
            <circle cx={hx} cy={hy} r={13} fill={accent} stroke={palette.ink} strokeWidth={4} />
          </> : null}
          {annotation.text ? textOf(index, annotation.text, shown) : null}
        </g>;
      }
      if (annotation.type === 'arrow') {
        // Measured from where the anchors are drawn (labels are kept inside the frame).
        const from = keepIn(point(anchorLonLat(annotation.from, data)));
        const to = keepIn(point(anchorLonLat(annotation.to, data)));
        // A gentle upward arc (away from the caption) that leaves room at both ends:
        // the start clears any label on its anchor, the end stops short of the target.
        const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
        const length = Math.hypot(dx, dy) || 1;
        const [ux, uy] = [dx / length, dy / length];
        // Start and end just outside any label sitting on the anchor, or a fixed gap.
        const clearance = (anchor: GeoAnchor) => {
          const label = labels.find((item) => sameAnchor(item.anchor, anchor));
          if (!label) return ARROW_GAP;
          // Display-font capitals with 3px tracking run about 0.36em per character, halved.
          const [halfWidth, halfHeight] = [label.text.length * LABEL_SIZE * .36 + 20, LABEL_SIZE * .5 + 16];
          return Math.min(Math.abs(ux) > 1e-6 ? halfWidth / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? halfHeight / Math.abs(uy) : Infinity);
        };
        const startGap = Math.min(clearance(annotation.from), length * .62);
        const endGap = Math.min(clearance(annotation.to) * .6, length * .2);
        const start: [number, number] = [from[0] + ux * startGap, from[1] + uy * startGap];
        const end: [number, number] = [to[0] - ux * endGap, to[1] - uy * endGap];
        // Of the two perpendiculars, bend towards the one pointing up the screen.
        const [px, py] = ux <= 0 ? [uy, -ux] : [-uy, ux];
        const up: [number, number] = py <= 0 ? [px, py] : [-px, -py];
        const lift = Math.hypot(end[0] - start[0], end[1] - start[1]) * .28;
        const control: [number, number] = [(start[0] + end[0]) / 2 + up[0] * lift, (start[1] + end[1]) / 2 + up[1] * lift];
        const d = `M ${start[0]} ${start[1]} Q ${control[0]} ${control[1]} ${end[0]} ${end[1]}`;
        const progress = interpolate(frame, [annotation.at * durationInFrames, annotation.at * durationInFrames + 20], [0, 1], clamp);
        const {strokeDasharray, strokeDashoffset} = evolvePath(progress, d);
        const angle = Math.atan2(end[1] - control[1], end[0] - control[0]) * 180 / Math.PI;
        const [lx, ly] = keepIn([control[0], control[1] - 34]);
        return <g key={index}>
          <path d={d} fill="none" stroke={palette.ink} strokeWidth={8} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
          <polygon points="0,-16 30,0 0,16" fill={palette.ink} opacity={progress > .95 ? 1 : 0} transform={`translate(${end[0]} ${end[1]}) rotate(${angle})`} />
          {annotation.text ? <Label x={lx} y={ly} text={annotation.text} opacity={progress} color={palette.ink} halo={palette.background} size={36} /> : null}
        </g>;
      }
      // A timeline is drawn as the flat strip (see `timeline`), not on the map.
      if (annotation.type === 'timeline') return null;
      if (annotation.type === 'reconstruction') {
        if (t < annotation.at || !data.plates) return null;
        const age = reconstructionAge(annotation, t);
        const fixedPlate = data.plates.entityPlates[annotation.fixed];
        const colour = styled ? look.subject.from : accent;
        const core = styled ? look.subject.rim : palette.ink;
        return <g key={index}>
          {annotation.entities.map((id) => {
            const feature = data.features.get(id);
            const plate = data.plates.entityPlates[id];
            const q = feature && plate && fixedPlate ? reconstruction(data.plates.table, plate, fixedPlate, age) : null;
            if (!feature || !q) return null;
            const moved = {type: 'Feature' as const, properties: {}, geometry: rotateGeometry(feature.geometry as {type: 'Polygon' | 'MultiPolygon'; coordinates: never}, q)};
            return <g key={id}>
              {/* Where it ends up, so the drift has a destination. */}
              <path d={path(feature) ?? ''} fill="none" stroke={core} strokeOpacity={.55} strokeWidth={3} strokeDasharray="12 9" strokeLinejoin="round" />
              <path d={path(moved as never) ?? ''} fill={colour} fillOpacity={.88} stroke={core} strokeOpacity={.9} strokeWidth={3} strokeLinejoin="round" style={{filter: glow(14, colour)}} />
            </g>;
          })}
        </g>;
      }
      const projected = point(anchorLonLat(annotation.anchor, data));
      if (farOffFrame(projected)) return null;
      const [x, y] = keepIn(projected);
      if (annotation.type === 'marker') {
        const pulse = 1 + .35 * Math.abs(Math.sin((frame - annotation.at * durationInFrames) / 8));
        const grow = springIn(annotation.at);
        return <g key={index} opacity={shown}>
          <circle cx={x} cy={y} r={22 * pulse * grow} fill={accent} opacity={.25} />
          <circle cx={x} cy={y} r={11 * grow} fill={accent} stroke={palette.ink} strokeWidth={4} />
        </g>;
      }
      return null;
    });
  // Label and marker text on top of every route and marker, so none is drawn over.
  const pointTexts = primitive.annotations.map((annotation, index) => {
    if (annotation.type === 'reconstruction') {
      // The age counter: a chip along the top of the map, counting down as the landmass drifts home.
      if (t < annotation.at) return null;
      const text = ageText(reconstructionAge(annotation, t));
      const width = text.length * 25 + 60;
      const [cx, cy] = [SIZE.width / 2, SAFE + 62];
      const fill = styled && look.chip ? look.chip.fill : palette.background;
      const ink = styled && look.chip ? look.chip.text : palette.ink;
      return <React.Fragment key={`age-${index}`}>{out(<g opacity={appear(annotation.at, 10)}>
        <rect x={cx - width / 2} y={cy - 42} width={width} height={84} rx={42} fill={fill} opacity={.9} />
        <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="middle" style={{fontFamily: displayFont, fontSize: 46, letterSpacing: 3, fontVariantNumeric: 'tabular-nums', fill: ink}}>{text}</text>
      </g>)}</React.Fragment>;
    }
    if (annotation.type === 'line') {
      return annotation.text ? <React.Fragment key={`text-${index}`}>{textOf(index, annotation.text, appear(annotation.at + LINE_FRAMES / 2 / durationInFrames, 14) * vanish(annotation.until))}</React.Fragment> : null;
    }
    if ((annotation.type !== 'label' && annotation.type !== 'marker') || !annotation.text) return null;
    const shown = appear(annotation.at) * vanish(annotation.until);
    // A marker's text sat inside its faded group, so it appears at shown².
    const grow = springIn(annotation.at);
    return <React.Fragment key={`text-${index}`}>{textOf(index, annotation.type === 'label' ? countUp(annotation.text, appear(annotation.at, COUNT_FRAMES)) : annotation.text, annotation.type === 'marker' ? shown * shown : shown, grow, labelScale(grow))}</React.Fragment>;
  });
  const frameStyle = {position: 'absolute' as const, inset: 0, borderRadius: 36, overflow: 'hidden' as const};

  // A data map (#91): each place shaded by its sourced value, from faint (lowest) to strong (highest),
  // under the highlights; the legend sits with the labels.
  const dataShown = primitive.data ? appear(primitive.data.at) : 0;
  const dataRange = primitive.data ? valueRange(primitive.data.values.map(({value}) => value)) : undefined;
  const dataFills = primitive.data && dataRange ? primitive.data.values.map(({entity, value}) => {
    const feature = data.features.get(entity);
    if (!feature) throw new Error(`Unknown geo entity ${entity}`);
    // In a bars view the compared places are tinted to match their bars: the subject lit, the rest muted.
    if (primitive.data!.view === 'bars') {
      const subjectPlace = entity === manifest.subject.attributes?.geoEntity;
      return <path key={`data-${entity}`} d={path(feature) ?? ''} fill={subjectPlace ? (styled ? look.subject.from : accent) : (styled ? look.subject.side : palette.ink)} fillOpacity={dataShown * (subjectPlace ? .9 : .38)} />;
    }
    return <path key={`data-${entity}`} d={path(feature) ?? ''} fill={accent} fillOpacity={dataShown * shade(value, dataRange)} />;
  }) : null;
  const legend = primitive.data?.legend && dataRange && primitive.data.view !== 'bars'
    ? <DataLegend label={primitive.data.label} unit={primitive.data.unit} range={dataRange} accent={accent} ink={palette.ink} backdrop={palette.background} opacity={dataShown} />
    : null;

  const bars = barsOn && primitive.data ? <DataBars label={primitive.data.label + (primitive.data.unit && !/per/i.test(primitive.data.label) ? ` (${primitive.data.unit})` : '')}
    rows={primitive.data.values.map(({entity, value}) => ({id: entity, name: data.entities.get(entity)?.name ?? entity, value, subject: entity === manifest.subject.attributes?.geoEntity}))}
    frame={frame} startFrame={barsStart} fps={manifest.format.fps} width={SIZE.width} height={SIZE.height} accent={styled ? look.subject.from : accent} ink={styled && look.chip ? look.chip.text : palette.ink} backdrop={styled && look.chip ? look.chip.fill : palette.background} muted={styled ? look.subject.side : palette.ink} /> : null;

  const timeline = timelineOn && timelineAnnotation ? <TimelineStrip steps={timelineAnnotation.steps} active={timelineAnnotation.active} frame={frame} startFrame={timelineStart} fps={manifest.format.fps} width={SIZE.width} height={SIZE.height}
    accent={styled ? look.subject.from : accent} ink={styled && look.chip ? look.chip.text : palette.ink} backdrop={styled && look.chip ? look.chip.fill : palette.background} muted={styled ? look.subject.side : palette.ink} /> : null;

  const baseLayers = <>
    <defs>
      <pattern id="geo-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="14" height="14" fill={accent} opacity=".25" />
        <line x1="0" y1="0" x2="0" y2="14" stroke={accent} strokeWidth="5" />
      </pattern>
    </defs>
    {/* Water is the background; land is every country, drawn from the pinned data. */}
    <rect width={SIZE.width} height={SIZE.height} fill={palette.background} />
    {sphereOutline ? <rect width={SIZE.width} height={SIZE.height} fill="#000" opacity=".5" /> : null}
    {sphereOutline ? <path d={sphereOutline} fill={palette.background} /> : null}
    {sphereOutline ? <path d={sphereOutline} fill={palette.secondary} opacity=".12" /> : <rect width={SIZE.width} height={SIZE.height} fill={palette.secondary} opacity=".12" />}
    <g>
      {data.countries.filter((feature) => onScreen(data.entities.get(String(feature.id))?.bbox)).map((feature) => <path key={String(feature.id)} d={path(feature) ?? ''} fill={palette.surface} stroke={palette.ink} strokeOpacity=".28" strokeWidth={1.2} />)}
    </g>
  </>;

  if (globe) {
    // A planet in space: stars, an atmosphere, a sea sphere darkening toward its edge, then land and every layer on top.
    const seaColor = look.name === 'classic' ? '#14304d' : look.sea.center;
    const spaceColor = look.name === 'classic' ? '#04070d' : look.sea.edge;
    const centreY = SIZE.height / 2 - barsShift;
    let seed = 7;
    const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const stars = Array.from({length: 90}, () => ({x: random() * SIZE.width, y: random() * SIZE.height, r: 0.6 + random() * 1.6, o: 0.25 + random() * 0.6}));
    const atmosphere = look.name === 'classic' ? accent : look.subject.from;
    const gratPath = path(geoGraticule().step([15, 15])()) ?? '';
    return <div style={{...frameStyle, background: spaceColor}}>
      <svg width={SIZE.width} height={SIZE.height} viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} style={{position: 'absolute', inset: 0}}>
        <defs>
          <pattern id="geo-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="14" height="14" fill={accent} opacity=".25" />
            <line x1="0" y1="0" x2="0" y2="14" stroke={accent} strokeWidth="5" />
          </pattern>
          <radialGradient id="globe-sea" cx="38%" cy="32%" r="85%"><stop offset="0" stopColor={seaColor} /><stop offset="1" stopColor={spaceColor} /></radialGradient>
          <radialGradient id="globe-limb" cx="40%" cy="34%" r="75%"><stop offset=".62" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".62" /></radialGradient>
        </defs>
        {stars.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.r} fill="#fff" opacity={star.o} />)}
        <circle cx={SIZE.width / 2} cy={centreY} r={globeRadius * 1.025} fill="none" stroke={atmosphere} strokeOpacity={.4} strokeWidth={10} style={{filter: glow(26, atmosphere)}} />
        <circle cx={SIZE.width / 2} cy={centreY} r={globeRadius} fill="url(#globe-sea)" />
        <path d={gratPath} fill="none" stroke="#ffffff" strokeOpacity={.12} strokeWidth={1.2} />
        <g>
          {data.countries.map((feature) => <path key={String(feature.id)} d={path(feature) ?? ''} fill={look.name === 'classic' ? palette.surface : look.land[pickByHash(String(feature.id), look.land.length)]} stroke={look.name === 'classic' ? palette.ink : look.border.color} strokeOpacity={look.name === 'classic' ? .3 : look.border.opacity} strokeWidth={1} strokeLinejoin="round" />)}
        </g>
        {adminVisibility(globeRadius) > 0 && styled ? <g fill="none" stroke={look.water.admin} strokeOpacity={look.water.adminOpacity * adminVisibility(globeRadius)} strokeWidth={1}>
          {data.admin1.map((feature) => <path key={String(feature.id)} d={path(feature) ?? ''} />)}
        </g> : null}
        {styled ? <g fill="none" stroke={look.water.river} strokeOpacity={.8} strokeLinecap="round" strokeWidth={1.4}>
          {data.rivers.filter((feature) => (feature.properties as {rank: number}).rank <= maxRiverRank(globeRadius)).map((feature) => <path key={String(feature.id)} d={path(feature) ?? ''} />)}
        </g> : null}
        <circle cx={SIZE.width / 2} cy={centreY} r={globeRadius} fill="url(#globe-limb)" />
        <g opacity={outro}>
          {dataFills}
          {highlights}
          {annotations}
          {pointTexts}
          {legend}
          {bars}
          {timeline}
        </g>
      </svg>
    </div>;
  }

  if (styled) {
    const shimmerX = ((frame * 4) % (SIZE.width * 2.4)) - SIZE.width * 0.7;
    const gratPath = look.grid.opacity > 0 ? path(geoGraticule().step([look.grid.step, look.grid.step]).extent([[-180, -80], [180, 80]])()) ?? '' : '';
    const stage = <svg width={SIZE.width} height={SIZE.height} viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} style={{position: 'absolute', inset: 0}}>
      <defs>
        <pattern id="geo-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="14" height="14" fill={accent} opacity=".25" />
          <line x1="0" y1="0" x2="0" y2="14" stroke={accent} strokeWidth="5" />
        </pattern>
        <radialGradient id="geo-sea" cx="50%" cy="46%" r="75%"><stop offset="0" stopColor={look.sea.center} /><stop offset="1" stopColor={look.sea.edge} /></radialGradient>
        <linearGradient id="geo-shimmer" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <filter id="geo-land-shadow" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy={look.shadow.dy} stdDeviation={look.shadow.blur / 2} floodColor={look.shadow.color} floodOpacity={look.shadow.opacity} /></filter>
      </defs>
      {sphereOutline ? <rect width={SIZE.width} height={SIZE.height} fill={look.sea.edge} /> : null}
      {sphereOutline ? <path d={sphereOutline} fill="url(#geo-sea)" /> : <rect width={SIZE.width} height={SIZE.height} fill="url(#geo-sea)" />}
      {look.shimmer > 0 ? <rect x={shimmerX} y={-SIZE.height * 0.2} width={SIZE.width * 0.6} height={SIZE.height * 1.5} fill="url(#geo-shimmer)" opacity={look.shimmer} transform={`rotate(-18 ${shimmerX} 0)`} /> : null}
      {gratPath ? <path d={gratPath} fill="none" stroke={look.grid.color} strokeOpacity={look.grid.opacity} strokeWidth={1.4} /> : null}
      <g filter="url(#geo-land-shadow)">
        {data.countries.filter((feature) => onScreen(data.entities.get(String(feature.id))?.bbox)).map((feature) => <path key={String(feature.id)} d={path(feature) ?? ''} fill={look.land[pickByHash(String(feature.id), look.land.length)]} stroke={look.border.color} strokeOpacity={look.border.opacity} strokeWidth={look.border.width} strokeLinejoin="round" />)}
      </g>
      {adminVisibility(view.scale) > 0 ? <g fill="none" stroke={look.water.admin} strokeOpacity={look.water.adminOpacity * adminVisibility(view.scale)} strokeWidth={1.1} strokeLinejoin="round">
        {data.admin1.filter((feature) => onScreen(data.entities.get(String(feature.id))?.bbox)).map((feature) => <path key={String(feature.id)} d={path(feature) ?? ''} />)}
      </g> : null}
      <g fill={look.water.lake} stroke={look.border.color} strokeOpacity={.25} strokeWidth={1}>
        {data.lakes.filter((feature) => (feature.properties as {rank: number}).rank <= maxLakeRank(view.scale) && onScreen(data.entities.get(String(feature.id))?.bbox)).map((feature) => <path key={String(feature.id)} d={path(feature) ?? ''} />)}
      </g>
      <g fill="none" stroke={look.water.river} strokeOpacity={.85} strokeLinecap="round" strokeLinejoin="round" strokeWidth={Math.max(1.3, Math.min(3.4, 1 + view.scale / 1800))}>
        {data.rivers.filter((feature) => (feature.properties as {rank: number}).rank <= maxRiverRank(view.scale) && onScreen(data.entities.get(String(feature.id))?.bbox)).map((feature) => <path key={String(feature.id)} d={path(feature) ?? ''} />)}
      </g>
      <g opacity={outro}>
        {dataFills}
        {highlights}
      </g>
    </svg>;
    const reliefStrength = primitive.relief ? RELIEF_STRENGTH * reliefFade : look.relief;
    const labelLayer = <svg width={SIZE.width} height={SIZE.height} viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} style={{position: 'absolute', inset: 0}}>
      <g opacity={outro}>{annotations}</g>
    </svg>;
    return <div style={{...frameStyle, perspective: 1500, background: look.sea.edge}}>
      <div style={{position: 'absolute', inset: 0, transform: `rotateX(${look.tilt.degrees}deg) scale(${look.tilt.scale})`, transformOrigin: `50% ${look.tilt.originY}%`, isolation: 'isolate'}}>
        {stage}
        {relief && reliefStrength > 0 ? <div style={{position: 'absolute', inset: 0, mixBlendMode: 'soft-light', opacity: reliefStrength}}>
          {reliefPlacements(relief, view).map((placement) => <Img key={placement.key} src={staticFile(`geo/relief/${placement.file}`)} style={{position: 'absolute', left: placement.left, top: placement.top, width: placement.width, height: placement.height, maxWidth: 'none'}} />)}
        </div> : null}
        {labelLayer}
      </div>
      {look.vignette > 0 ? <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 48%, transparent 45%, rgba(0,0,0,${look.vignette}) 100%)`}} /> : null}
      <svg width={SIZE.width} height={SIZE.height} viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} style={{position: 'absolute', inset: 0}}><g opacity={outro}>{pointTexts}{flat}{legend}{bars}{timeline}</g></svg>
    </div>;
  }

  if (!relief) {
    return <svg width={SIZE.width} height={SIZE.height} viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} style={frameStyle}>
    {baseLayers}
    <g opacity={outro}>
    {dataFills}
    {highlights}
    {annotations}
    {pointTexts}
    {legend}
    {bars}
    {timeline}
    </g>
  </svg>;
  }

  // Relief (#91): the base map, then the shaded relief blended over land and highlights, then
  // labels, markers and routes on top so their text stays crisp.
  return <div style={{...frameStyle, isolation: 'isolate'}}>
    <svg width={SIZE.width} height={SIZE.height} viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} style={{position: 'absolute', inset: 0}}>
    {baseLayers}
    <g opacity={outro}>{dataFills}{highlights}</g>
    </svg>
    <div style={{position: 'absolute', inset: 0, mixBlendMode: 'soft-light', opacity: RELIEF_STRENGTH * reliefFade}}>
      {reliefPlacements(relief, view).map((placement) => <Img key={placement.key} src={staticFile(`geo/relief/${placement.file}`)} style={{position: 'absolute', left: placement.left, top: placement.top, width: placement.width, height: placement.height, maxWidth: 'none'}} />)}
    </div>
    <svg width={SIZE.width} height={SIZE.height} viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} style={{position: 'absolute', inset: 0}}>
      <g opacity={outro}>{annotations}{pointTexts}{legend}{bars}{timeline}</g>
    </svg>
  </div>;
};

/** The lowest and highest value of a data map. */
const valueRange = (values: number[]): [number, number] => [Math.min(...values), Math.max(...values)];
/** Fill opacity for a value: faint at the lowest, strong at the highest. */
const shade = (value: number, [low, high]: [number, number]) => .12 + .78 * (high > low ? (value - low) / (high - low) : .5);
/** "1,400 M": a value as the legend shows it. */
export const formatValue = (value: number, unit?: string) => `${value.toLocaleString('en-US')}${unit ? ` ${unit.toUpperCase()}` : ''}`;

const LEGEND = {x: SAFE, width: 340, bar: 20};
/** About how wide one 26 px legend character is, letter spacing included, and the space kept between the two values. */
const LEGEND_CHAR = 15;
const LEGEND_GAP = 48;
/** The key's width: long values ("2,166,086 KM²") widen it so its two ends don't run into each other; short ones keep it as it was. */
const legendWidth = (range: [number, number], unit?: string) => Math.max(LEGEND.width, range.map((value) => formatValue(value, unit).length).reduce((sum, length) => sum + length, 0) * LEGEND_CHAR + LEGEND_GAP);
/** The data map's key: its label, a bar from faint to strong, and the lowest and highest values. */
const DataLegend: React.FC<{label: string; unit?: string; range: [number, number]; accent: string; ink: string; backdrop: string; opacity: number}> = ({label, unit, range, accent, ink, backdrop, opacity}) => {
  const top = SIZE.height - SAFE - 112;
  const [low, high] = range.map((value) => formatValue(value, unit));
  const width = legendWidth(range, unit);
  const text = {fontFamily: displayFont, letterSpacing: 2, fill: ink};
  return <g opacity={opacity}>
    <defs>
      <linearGradient id="geo-data-ramp" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor={accent} stopOpacity={shade(range[0], range)} />
        <stop offset="1" stopColor={accent} stopOpacity={shade(range[1], range)} />
      </linearGradient>
    </defs>
    <rect x={LEGEND.x - 18} y={top - 18} width={width + 36} height={130} rx={18} fill={backdrop} opacity={.78} />
    <text x={LEGEND.x} y={top + 22} style={{...text, fontSize: 30}}>{label}</text>
    <rect x={LEGEND.x} y={top + 42} width={width} height={LEGEND.bar} rx={LEGEND.bar / 2} fill="url(#geo-data-ramp)" stroke={ink} strokeOpacity={.35} />
    <text x={LEGEND.x} y={top + 92} style={{...text, fontSize: 26}}>{low}</text>
    <text x={LEGEND.x + width} y={top + 92} textAnchor="end" style={{...text, fontSize: 26}}>{high}</text>
  </g>;
};
