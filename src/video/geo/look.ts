// Map looks: how the base map and the highlighted place are painted. "classic" is the original flat
// map (a solid sea, one land colour, a glowing flat highlight); the others are art directions with a
// gradient sea and graticule, land that varies country to country, an extruded gradient subject, a
// tilted stage and label chips. A look only changes paint: the camera, the data and every layer's
// timing are the same, so any episode can wear any look.

export type LookName = 'classic' | 'neon' | 'atlas' | 'terrain';

export type Look = {
  name: LookName;
  /** Sea: a radial gradient from the middle of the frame to its edges. */
  sea: {center: string; edge: string};
  /** Graticule (lat/lon grid) colour and opacity; 0 turns it off. */
  grid: {color: string; opacity: number; step: number};
  /** Land colours: a country takes one by its id, so neighbours differ but the same country never flickers. */
  land: string[];
  /** Land edge: colour, opacity, width. */
  border: {color: string; opacity: number; width: number};
  /** Light along the top of every landmass (px offset), and the soft shadow it casts. */
  shadow: {color: string; blur: number; dy: number; opacity: number};
  /** The highlighted place: a gradient, the slab it stands on, and a bright rim. */
  subject: {from: string; to: string; side: string; depth: number; rim: string; glow: number};
  /** Perspective tilt of the map plane in degrees, and how far it is scaled up so the tilt never shows an edge. */
  tilt: {degrees: number; scale: number; originY: number};
  /** A pill behind each label: colour and opacity; null for the classic halo only. */
  chip: {fill: string; opacity: number; text: string} | null;
  /** Darkening toward the frame's edges (0-1). */
  vignette: number;
  /** A slow band of light drifting over the sea (0-1). */
  shimmer: number;
  /** Lakes' fill, rivers' stroke, and the thin lines between states and provinces (shown only when zoomed in). */
  water: {lake: string; river: string; admin: string; adminOpacity: number};
  /** Shaded-relief texture blended over land and sea (0-1); 0 for none. */
  relief: number;
};

export const LOOKS: Record<LookName, Look> = {
  classic: {
    name: 'classic',
    sea: {center: '#0b1a2a', edge: '#0b1a2a'},
    grid: {color: '#ffffff', opacity: 0, step: 15},
    land: ['#23473d'],
    border: {color: '#f6f1e7', opacity: 0.25, width: 1.2},
    shadow: {color: '#000000', blur: 0, dy: 0, opacity: 0},
    subject: {from: '#e4b363', to: '#e4b363', side: '#e4b363', depth: 0, rim: '#e4b363', glow: 14},
    tilt: {degrees: 0, scale: 1, originY: 50},
    chip: null,
    vignette: 0,
    shimmer: 0,
    water: {lake: '#0b1a2a', river: '#6fa8dc', admin: '#f6f1e7', adminOpacity: 0.18},
    relief: 0,
  },
  neon: {
    name: 'neon',
    sea: {center: '#0d1b4a', edge: '#03040d'},
    grid: {color: '#58a6ff', opacity: 0.16, step: 10},
    land: ['#18284f', '#1b2d58', '#16254a', '#1d3160', '#142244'],
    border: {color: '#7fb4ff', opacity: 0.5, width: 1.3},
    shadow: {color: '#000010', blur: 18, dy: 12, opacity: 0.75},
    subject: {from: '#ff3d9a', to: '#ffb02e', side: '#a3156b', depth: 9, rim: '#fff3d6', glow: 26},
    tilt: {degrees: 24, scale: 1.1, originY: 0},
    chip: {fill: '#0a1030', opacity: 0.82, text: '#ffffff'},
    vignette: 0.55,
    shimmer: 0.1,
    water: {lake: '#0b1b4d', river: '#4cc3ff', admin: '#9cc7ff', adminOpacity: 0.3},
    relief: 0.45,
  },
  atlas: {
    name: 'atlas',
    sea: {center: '#58b8d6', edge: '#2a7fa6'},
    grid: {color: '#ffffff', opacity: 0.22, step: 15},
    land: ['#f4e3b8', '#f0cfa0', '#e8d9a6', '#f2c9a2', '#e2dba9', '#efd7b4'],
    border: {color: '#8a6a3a', opacity: 0.55, width: 1.4},
    shadow: {color: '#0c3a52', blur: 14, dy: 9, opacity: 0.45},
    subject: {from: '#ff7a59', to: '#ff4d6d', side: '#b82f4a', depth: 10, rim: '#fff7ea', glow: 10},
    tilt: {degrees: 22, scale: 1.1, originY: 0},
    chip: {fill: '#fff8ea', opacity: 0.94, text: '#1a2b3c'},
    vignette: 0.25,
    shimmer: 0.16,
    water: {lake: '#58b8d6', river: '#2f8fbf', admin: '#8a6a3a', adminOpacity: 0.4},
    relief: 0.5,
  },
  terrain: {
    name: 'terrain',
    sea: {center: '#10424d', edge: '#06161c'},
    grid: {color: '#9ee6d3', opacity: 0.1, step: 15},
    land: ['#2f5d3c', '#3a6a40', '#4a6f3a', '#5d7a3c', '#2c5a4a', '#47663a'],
    border: {color: '#e8f5c8', opacity: 0.4, width: 1.2},
    shadow: {color: '#021010', blur: 16, dy: 10, opacity: 0.7},
    subject: {from: '#ffd166', to: '#ef8a17', side: '#8a4a07', depth: 8, rim: '#fff6d8', glow: 20},
    tilt: {degrees: 26, scale: 1.1, originY: 0},
    chip: {fill: '#08201f', opacity: 0.85, text: '#f7f2dc'},
    vignette: 0.5,
    shimmer: 0.08,
    water: {lake: '#10424d', river: '#6fe0e8', admin: '#e8f5c8', adminOpacity: 0.25},
    relief: 0.75,
  },
};

/** The look a manifest asks for ("classic" when it names none or an unknown one). */
export const lookOf = (name?: string): Look => LOOKS[(name as LookName) in LOOKS ? (name as LookName) : 'classic'];

/** A stable 0..n-1 pick from an id, so a country keeps its colour from frame to frame and episode to episode. */
export const pickByHash = (id: string, count: number) => {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) % count;
};

/** Which lakes and rivers are worth drawing at a zoom (view scale): only the great ones from far, more as the camera closes in. */
export const maxLakeRank = (scale: number) => (scale < 400 ? 1 : scale < 1200 ? 3 : 5);
export const maxRiverRank = (scale: number) => (scale < 500 ? 2 : scale < 1500 ? 4 : 6);
/** How visible state and province lines are at a zoom: none from far, full close up. */
export const adminVisibility = (scale: number) => Math.max(0, Math.min(1, (scale - 700) / 500));

/** The CSS perspective distance (px) the tilted stage is drawn with. */
export const PERSPECTIVE = 1500;

/**
 * Where the tilted stage puts a point of the flat map on screen: the same maths as the CSS transform
 * `perspective(1500px) rotateX(d) scale(s)` about the stage's transform-origin. Labels are placed
 * here, in frame space, and drawn upright above the stage, so a tilt can never push one off screen.
 */
export const tiltPoint = (look: Look, [x, y]: [number, number], size: {width: number; height: number}): [number, number] => {
  const {degrees, scale, originY} = look.tilt;
  if (!degrees) return [x, y];
  const radians = (degrees * Math.PI) / 180;
  const ox = size.width / 2;
  const oy = (size.height * originY) / 100;
  const dy = scale * (y - oy);
  const x1 = ox + scale * (x - ox);
  const y1 = oy + dy * Math.cos(radians);
  const k = 1 / (1 - (dy * Math.sin(radians)) / PERSPECTIVE);
  const [qx, qy] = [size.width / 2, size.height / 2];
  return [qx + (x1 - qx) * k, qy + (y1 - qy) * k];
};
