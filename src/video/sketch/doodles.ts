// Hand-drawn doodles for the notebook theme (#132): simple line drawings in a
// 100×100 box, drawn stroke by stroke and roughened (./plan.ts), so they read
// as drawn with a fineliner rather than as icons. One per DOODLES entry in
// scripts/diagram-schema.mjs; a node without one gets its kind's.

const circle = (cx: number, cy: number, r: number) => `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`;

/** Each doodle is its strokes, in drawing order. */
export const DOODLE_PATHS: Record<string, string[]> = {
  person: [circle(50, 24, 11), 'M 50 35 L 50 63', 'M 31 47 L 50 41 L 69 47', 'M 50 63 L 38 86', 'M 50 63 L 62 86', 'M 70 14 L 86 8 M 72 22 L 90 20'],
  robot: ['M 28 32 L 72 32 L 72 72 L 28 72 Z', 'M 40 48 L 44 48 M 56 48 L 60 48', 'M 40 61 L 60 61', 'M 50 32 L 50 18', circle(50, 15, 3)],
  compass: [circle(50, 50, 36), 'M 50 22 L 58 50 L 50 78 L 42 50 Z', 'M 50 22 L 50 50', 'M 50 8 L 50 14 M 50 86 L 50 92 M 8 50 L 14 50 M 86 50 L 92 50'],
  pencil: ['M 24 76 L 68 32 L 80 44 L 36 88 Z', 'M 24 76 L 17 95 L 36 88', 'M 68 32 L 75 25 L 87 37 L 80 44', 'M 30 82 L 74 38'],
  film: ['M 12 28 L 88 28 L 88 72 L 12 72 Z', 'M 37 28 L 37 72 M 63 28 L 63 72', 'M 18 20 L 24 20 M 32 20 L 38 20 M 46 20 L 52 20 M 60 20 L 66 20 M 74 20 L 80 20', 'M 18 80 L 24 80 M 32 80 L 38 80 M 46 80 L 52 80 M 60 80 L 66 80 M 74 80 L 80 80', 'M 18 60 L 25 46 L 31 60 M 44 60 L 50 40 L 56 60 M 69 60 L 75 50 L 81 60'],
  microphone: ['M 40 22 A 10 10 0 0 1 60 22 L 60 48 A 10 10 0 0 1 40 48 Z', 'M 30 44 Q 30 68 50 68 Q 70 68 70 44', 'M 50 68 L 50 86 M 36 86 L 64 86', 'M 44 26 L 56 26 M 44 34 L 56 34'],
  notes: ['M 26 72 A 8 6 -20 1 0 42 70 A 8 6 -20 1 0 26 72', 'M 42 70 L 42 26 L 76 18 L 76 62', 'M 60 64 A 8 6 -20 1 0 76 62 A 8 6 -20 1 0 60 64', 'M 42 36 L 76 28'],
  clapper: ['M 16 44 L 84 44 L 84 86 L 16 86 Z', 'M 16 44 L 80 24 L 84 38', 'M 30 40 L 36 29 M 46 35 L 52 24 M 62 30 L 68 20', 'M 26 58 L 74 58'],
  magnifier: [circle(44, 40, 23), 'M 61 57 L 84 82', 'M 34 41 L 42 49 L 56 32'],
  play: ['M 32 10 L 68 10 Q 75 10 75 17 L 75 83 Q 75 90 68 90 L 32 90 Q 25 90 25 83 L 25 17 Q 25 10 32 10 Z', 'M 44 36 L 61 50 L 44 64 Z', 'M 44 81 L 56 81'],
  gear: [circle(50, 50, 17), 'M 50 18 L 50 30 M 50 70 L 50 82 M 18 50 L 30 50 M 70 50 L 82 50 M 27 27 L 36 36 M 64 64 L 73 73 M 73 27 L 64 36 M 36 64 L 27 73', circle(50, 50, 5)],
  wrench: ['M 28 80 L 60 48', 'M 60 48 A 15 15 0 1 1 74 26 L 66 34 L 70 40 L 76 38 L 82 30 A 15 15 0 0 1 60 48'],
  page: ['M 30 12 L 60 12 L 74 26 L 74 88 L 30 88 Z', 'M 60 12 L 60 26 L 74 26', 'M 38 40 L 66 40 M 38 52 L 66 52 M 38 64 L 58 64'],
  database: ['M 28 26 A 22 8 0 1 0 72 26 A 22 8 0 1 0 28 26', 'M 28 26 L 28 74 A 22 8 0 0 0 72 74 L 72 26', 'M 28 50 A 22 8 0 0 0 72 50'],
  brain: ['M 50 22 Q 30 16 25 34 Q 14 50 27 62 Q 30 82 50 77 Q 70 82 73 62 Q 86 50 75 34 Q 70 16 50 22', 'M 50 22 L 50 77', 'M 34 42 Q 42 46 40 54 M 66 42 Q 58 46 60 54'],
  plug: ['M 40 16 L 40 32 M 60 16 L 60 32', 'M 30 32 L 70 32 L 70 48 Q 70 66 50 66 Q 30 66 30 48 Z', 'M 50 66 Q 50 80 64 86'],
};

/** The doodle a node gets when it doesn't name one. */
export const KIND_DOODLE: Record<string, string> = {user: 'person', agent: 'robot', tool: 'wrench', process: 'gear', artifact: 'page', store: 'database', model: 'brain', api: 'plug'};

/** Marker colours, in the order nodes take them: the reference page's red, yellow, green and blue first. */
export const MARKERS = ['#e5383b', '#f6c026', '#6fbf4a', '#3e8ed0', '#f28c28', '#9b6bc6', '#2bb5a8', '#e86aa6'];
