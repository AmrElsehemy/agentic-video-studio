import React, {useMemo} from 'react';
import {geoCentroid, geoMercator, geoPath, type GeoProjection} from 'd3-geo';
import {evolvePath} from '@remotion/paths';
import {Img, interpolate, staticFile} from 'remotion';
import {routeUntil, type GeoAnchor, type GeoMapPrimitive} from '../../../scripts/primitive-schema.mjs';
import type {ShotProps} from '../shots';
import {displayFont} from '../typography';
import {cameraAt, cameraKeys, continuesMap, episodeCameraKeys, MAP_SIZE, type BBox, type CameraKey, type Size} from './camera';
import {useGeoData, useReliefData, type GeoData} from './data';
import {RELIEF_STRENGTH, reliefPlacements} from './relief';
import {fitInside, labelBox, resolveLabels, type Box, type Placed} from './labels';
import {labelScale, pop} from './motion';
import {followView, followWeight, partialRoute, routeLine, routeProgress, type RouteLine} from './route';

// A map drawn entirely from the pinned data and the primitive: the camera flies
// between framings, places light up, labels, markers, arrows and routes appear. Nothing
// here knows which episode or country it is drawing.

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const SIZE: Size = MAP_SIZE;
/** Labels stay this far inside the edges so they never collide with the headline or caption. */
const SAFE = 48;
/** Frames an appearing layer takes to fade/draw in. */
const APPEAR = 12;
const TRACE_SHARE = .35;
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
    style={{fontFamily: displayFont, fontSize: size, letterSpacing: 3, fill: color, stroke: halo, strokeWidth: 10, paintOrder: 'stroke', strokeLinejoin: 'round'}}>{text}</text>;
  return scale === 1 ? label : <g transform={`translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`}>{label}</g>;
};

export const GeoMapVisual: React.FC<ShotProps & {data: GeoMapPrimitive}> = ({data: primitive, scene, manifest, frame, durationInFrames, accent, seams}) => {
  const data = useGeoData();
  const relief = useReliefData(Boolean(primitive.relief));
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
  if (!data || !keys || (primitive.relief && !relief)) return null;

  const t = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;
  // A followed route pulls the camera's centre onto its marker while it draws.
  const followedIndex = primitive.annotations.findIndex((annotation) => annotation.type === 'route' && annotation.follow);
  const followed = followedIndex >= 0 ? primitive.annotations[followedIndex] as Route : undefined;
  const view = followed
    ? followView(cameraAt(keys, t), partialRoute(routes.get(followedIndex)!, routeProgress(t, followed.at, routeUntil(followed))).head, followWeight(t, followed.at, routeUntil(followed)))
    : cameraAt(keys, t);
  const projection: GeoProjection = geoMercator().rotate([-view.lon, 0]).center([0, view.lat]).scale(view.scale).translate([SIZE.width / 2, SIZE.height / 2]);
  const path = geoPath(projection);
  const appear = (at: number, frames = APPEAR) => interpolate(frame, [at * durationInFrames, at * durationInFrames + frames], [0, 1], clamp);
  /** Spring progress (motion.ts) of an entrance at `at`: 0 before, a small overshoot, then 1. */
  const springIn = (at: number) => pop(frame, at * durationInFrames, manifest.format.fps);
  /** A marker or label with an `until` fades out, finishing then. */
  const vanish = (until?: number) => (until === undefined ? 1 : interpolate(frame, [until * durationInFrames - APPEAR, until * durationInFrames], [1, 0], clamp));
  const point = (lonLat: [number, number]) => projection(lonLat) as [number, number];
  const {palette} = manifest;
  // Projecting every country each frame is the render's main cost; skip those whose box is off screen.
  const onScreen = visibleFilter(projection);
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
    if (annotation.type === 'arrow' || !annotation.text) return;
    if (annotation.type === 'route') {
      if (t < annotation.at) return;
      const [hx, hy] = point(routeStates.get(index)!.head);
      texts.set(index, {box: fitInside(labelBox(hx, hy - ROUTE_LIFT, annotation.text, POINT_LABEL_SIZE), BOUNDS), anchorY: hy, priority: -1, opacity: appear(annotation.at), size: POINT_LABEL_SIZE});
      return;
    }
    const projected = point(anchorLonLat(annotation.anchor, data));
    if (farOffFrame(projected)) return;
    const [x, y] = keepInside(projected);
    const size = annotation.type === 'marker' ? POINT_LABEL_SIZE : LABEL_SIZE;
    texts.set(index, {box: fitInside(labelBox(x, annotation.type === 'marker' ? y - MARKER_LIFT : y, annotation.text, size), BOUNDS), anchorY: projected[1], priority: annotation.at, opacity: appear(annotation.at) * vanish(annotation.until), size});
  });
  const legendBox: Box | undefined = primitive.data?.legend ? {x: LEGEND.x + LEGEND.width / 2, y: SIZE.height - SAFE - 112 + 47, halfWidth: LEGEND.width / 2 + 18, halfHeight: 65} : undefined;
  const placed = [...texts.values(), ...(legendBox ? [{box: legendBox, priority: Infinity, opacity: primitive.data ? appear(primitive.data.at) : 0}] : [])];
  const resolved = resolveLabels(placed, BOUNDS);
  const boxes = new Map([...texts.keys()].map((index, order) => [index, resolved.boxes[order]]));
  const fades = new Map([...texts.keys()].map((index, order) => [index, resolved.fades[order]]));
  const textOf = (index: number, text: string, opacity: number, rise = opacity, scale = 1) => {
    const [item, box] = [texts.get(index), boxes.get(index)];
    return item && box ? <Label x={box.x} y={box.y} text={text} opacity={opacity * (fades.get(index) ?? 1)} rise={rise} scale={scale} color={palette.ink} halo={palette.background} size={item.size} /> : null;
  };

  const highlights = primitive.highlights.map((highlight, index) => {
      const feature = data.features.get(highlight.entity);
      if (!feature) throw new Error(`Unknown geo entity ${highlight.entity}`);
      const d = path(feature) ?? '';
      const color = highlight.color ?? accent;
      const disputed = highlight.entity.startsWith('disputed:');
      if (highlight.style === 'trace') {
        const progress = interpolate(frame, [highlight.at * durationInFrames, (highlight.at + TRACE_SHARE) * durationInFrames], [0, 1], clamp);
        const {strokeDasharray, strokeDashoffset} = evolvePath(progress, d);
        return <g key={index}>
          <path d={d} fill={color} opacity={.22 * progress} />
          <path d={d} fill="none" stroke={color} strokeWidth={7} strokeLinejoin="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} style={{filter: `drop-shadow(0 0 10px ${color})`}} />
        </g>;
      }
      const shown = appear(highlight.at);
      // The border springs to its width, a touch thicker for a moment, as the place lights up.
      const border = springIn(highlight.at);
      return <path key={index} d={d} fill={highlight.style === 'fill' ? (disputed ? 'url(#geo-hatch)' : color) : 'none'} fillOpacity={.85 * shown}
        stroke={color} strokeOpacity={shown} strokeWidth={(highlight.style === 'outline' ? 6 : 3) * border} strokeLinejoin="round" style={{filter: `drop-shadow(0 0 ${14 * shown}px ${color})`}} />;
    });
  // Routes go underneath, so labels and markers on their stops stay readable.
  const annotations = primitive.annotations.map((annotation, index) => [annotation, index] as const).sort(([a], [b]) => Number(b.type === 'route') - Number(a.type === 'route')).map(([annotation, index]) => {
      const shown = appear(annotation.at) * (annotation.type === 'marker' || annotation.type === 'label' ? vanish(annotation.until) : 1);
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
        const from = keepInside(point(anchorLonLat(annotation.from, data)));
        const to = keepInside(point(anchorLonLat(annotation.to, data)));
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
        const [lx, ly] = keepInside([control[0], control[1] - 34]);
        return <g key={index}>
          <path d={d} fill="none" stroke={palette.ink} strokeWidth={8} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
          <polygon points="0,-16 30,0 0,16" fill={palette.ink} opacity={progress > .95 ? 1 : 0} transform={`translate(${end[0]} ${end[1]}) rotate(${angle})`} />
          {annotation.text ? <Label x={lx} y={ly} text={annotation.text} opacity={progress} color={palette.ink} halo={palette.background} size={36} /> : null}
        </g>;
      }
      const projected = point(anchorLonLat(annotation.anchor, data));
      if (farOffFrame(projected)) return null;
      const [x, y] = keepInside(projected);
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
    if ((annotation.type !== 'label' && annotation.type !== 'marker') || !annotation.text) return null;
    const shown = appear(annotation.at) * vanish(annotation.until);
    // A marker's text sat inside its faded group, so it appears at shown².
    const grow = springIn(annotation.at);
    return <React.Fragment key={`text-${index}`}>{textOf(index, annotation.text, annotation.type === 'marker' ? shown * shown : shown, grow, labelScale(grow))}</React.Fragment>;
  });
  const frameStyle = {position: 'absolute' as const, inset: 0, borderRadius: 36, overflow: 'hidden' as const};

  // A data map (#91): each place shaded by its sourced value, from faint (lowest) to strong (highest),
  // under the highlights; the legend sits with the labels.
  const dataShown = primitive.data ? appear(primitive.data.at) : 0;
  const dataRange = primitive.data ? valueRange(primitive.data.values.map(({value}) => value)) : undefined;
  const dataFills = primitive.data && dataRange ? primitive.data.values.map(({entity, value}) => {
    const feature = data.features.get(entity);
    if (!feature) throw new Error(`Unknown geo entity ${entity}`);
    return <path key={`data-${entity}`} d={path(feature) ?? ''} fill={accent} fillOpacity={dataShown * shade(value, dataRange)} />;
  }) : null;
  const legend = primitive.data?.legend && dataRange
    ? <DataLegend label={primitive.data.label} unit={primitive.data.unit} range={dataRange} accent={accent} ink={palette.ink} backdrop={palette.background} opacity={dataShown} />
    : null;

  const baseLayers = <>
    <defs>
      <pattern id="geo-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="14" height="14" fill={accent} opacity=".25" />
        <line x1="0" y1="0" x2="0" y2="14" stroke={accent} strokeWidth="5" />
      </pattern>
    </defs>
    {/* Water is the background; land is every country, drawn from the pinned data. */}
    <rect width={SIZE.width} height={SIZE.height} fill={palette.background} />
    <rect width={SIZE.width} height={SIZE.height} fill={palette.secondary} opacity=".12" />
    <g>
      {data.countries.filter((feature) => onScreen(data.entities.get(String(feature.id))?.bbox)).map((feature) => <path key={String(feature.id)} d={path(feature) ?? ''} fill={palette.surface} stroke={palette.ink} strokeOpacity=".28" strokeWidth={1.2} />)}
    </g>
  </>;

  if (!relief) {
    return <svg width={SIZE.width} height={SIZE.height} viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} style={frameStyle}>
    {baseLayers}
    <g opacity={outro}>
    {dataFills}
    {highlights}
    {annotations}
    {pointTexts}
    {legend}
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
      <g opacity={outro}>{annotations}{pointTexts}{legend}</g>
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
/** The data map's key: its label, a bar from faint to strong, and the lowest and highest values. */
const DataLegend: React.FC<{label: string; unit?: string; range: [number, number]; accent: string; ink: string; backdrop: string; opacity: number}> = ({label, unit, range, accent, ink, backdrop, opacity}) => {
  const top = SIZE.height - SAFE - 112;
  const text = {fontFamily: displayFont, letterSpacing: 2, fill: ink};
  return <g opacity={opacity}>
    <defs>
      <linearGradient id="geo-data-ramp" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor={accent} stopOpacity={shade(range[0], range)} />
        <stop offset="1" stopColor={accent} stopOpacity={shade(range[1], range)} />
      </linearGradient>
    </defs>
    <rect x={LEGEND.x - 18} y={top - 18} width={LEGEND.width + 36} height={130} rx={18} fill={backdrop} opacity={.78} />
    <text x={LEGEND.x} y={top + 22} style={{...text, fontSize: 30}}>{label}</text>
    <rect x={LEGEND.x} y={top + 42} width={LEGEND.width} height={LEGEND.bar} rx={LEGEND.bar / 2} fill="url(#geo-data-ramp)" stroke={ink} strokeOpacity={.35} />
    <text x={LEGEND.x} y={top + 92} style={{...text, fontSize: 26}}>{formatValue(range[0], unit)}</text>
    <text x={LEGEND.x + LEGEND.width} y={top + 92} textAnchor="end" style={{...text, fontSize: 26}}>{formatValue(range[1], unit)}</text>
  </g>;
};
