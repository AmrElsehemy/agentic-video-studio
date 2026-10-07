// A starter draft for an imported architecture (#120): the diagram, and a
// walkthrough of it that compiles as is. The picture assembles, each lane's
// numbered steps are followed in order, monitoring routes (if any) draw in,
// and the episode ends on the whole picture. The narration is placeholder
// text built from the diagram's own words: rewrite it, then anchor actions to
// the words you write ({"word": ...}) for tight sync.

const ACTIONS = 12;
const FLOW_SCENES = 7;

const firstLine = (text) => text.split('\n')[0];
const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
const sentence = (text) => `${text.replace(/[.:;,]+$/, '')}.`;
const chunk = (items, size) => Array.from({length: Math.ceil(items.length / size)}, (_, i) => items.slice(i * size, i * size + size));

/** Distance from a point to a route (its nearest segment). */
const distanceTo = ([px, py], points) => Math.min(...points.slice(1).map(([x2, y2], i) => {
  const [x1, y1] = points[i];
  const length = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / length));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}));

/**
 * The route a step's dot should travel: the nearest route, counting one in the
 * step's own lane as much closer, one another step already took as further,
 * and monitoring routes as a last resort.
 */
export const stepRoute = (spec, step, taken = new Set()) => spec.edges
  .map((edge) => ({edge, score: distanceTo(step.at, edge.points) + (edge.lane === step.lane ? 0 : 150) + (taken.has(edge.id) ? 100 : 0) + (edge.lane === 'telemetry' ? 400 : 0)}))
  .sort((a, b) => a.score - b.score)[0]?.edge.id;

/**
 * The starter draft. `spec` is an imported architecture spec; `title`, `show`
 * ({id, name, handle}) and `id` name the episode; `file` is the source file.
 */
export const starterDraft = ({id, title, show, spec, file}) => {
  const byReading = [...spec.nodes].sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
  const scenes = [];
  const shown = new Set();
  const name = (node) => firstLine(node.label);
  const plainEdges = spec.edges.filter((edge) => edge.lane === 'plain');
  // An edge is drawn once both its ends are on the picture (an end is its nearest node).
  const nearestNode = (point) => spec.nodes.map((node) => ({node, d: Math.hypot(node.at[0] - point[0], node.at[1] - point[1])})).sort((a, b) => a.d - b.d)[0]?.node.id;
  const connectable = () => plainEdges.filter((edge) => !shown.has(edge.id) && shown.has(nearestNode(edge.points[0])) && shown.has(nearestNode(edge.points.at(-1))));

  // Hook: the first parts, left to right.
  const opening = byReading.slice(0, 2);
  opening.forEach((node) => shown.add(node.id));
  const hookEdges = connectable().slice(0, 2);
  hookEdges.forEach((edge) => shown.add(edge.id));
  scenes.push({
    id: 'hook', beat: 'hook', eyebrow: 'ARCHITECTURE', headline: title.toUpperCase().slice(0, 70), caption: title.slice(0, 120),
    narration: sentence(`Here's how ${title.charAt(0).toLowerCase()}${title.slice(1)} works`),
    primitive: {kind: 'diagram', actions: [
      {do: 'camera', focus: opening.map((node) => node.id), padding: .12, at: 0, dur: .1},
      ...opening.map((node, i) => ({do: 'reveal', target: node.id, at: .05 + i * .3})),
      ...hookEdges.map((edge) => ({do: 'connect', edge: edge.id, at: .7})),
    ]},
  });

  // Setup: boundaries, the remaining parts and their plain links, a scene per screenful.
  const rest = [...spec.groups.map((group) => ({id: group.id, label: group.label ?? group.id, kind: 'group'})), ...byReading.slice(2).map((node) => ({id: node.id, label: name(node), kind: 'node'})), ...spec.labels.map((label) => ({id: label.id, label: label.text, kind: 'label'}))];
  chunk(rest, ACTIONS - 2).slice(0, 3).forEach((items, index, all) => {
    const actions = [{do: 'camera', focus: 'all', padding: .04, at: 0}];
    items.forEach((item, i) => {
      actions.push({do: 'reveal', target: item.id, at: Math.round((.05 + .7 * i / items.length) * 100) / 100});
      shown.add(item.id);
    });
    for (const edge of connectable().slice(0, ACTIONS - actions.length)) {
      actions.push({do: 'connect', edge: edge.id, at: .85});
      shown.add(edge.id);
    }
    const names = [...new Set(items.filter((item) => item.kind === 'node').map((item) => item.label))].slice(0, 5);
    scenes.push({
      id: `setup-${index + 1}`, beat: 'setup', eyebrow: 'THE PARTS', headline: all.length > 1 ? `THE PARTS, ${index + 1} OF ${all.length}` : 'THE PARTS', caption: 'THE PARTS',
      narration: sentence(names.length ? `It's built from ${list(names)}` : 'Here is how it is laid out'),
      primitive: {kind: 'diagram', actions},
    });
  });

  // Flows: each lane's steps in order, up to three a scene (more when a long walkthrough needs fewer scenes).
  const lanes = ['read', 'write'].map((lane) => spec.steps.filter((step) => step.lane === lane).sort((a, b) => a.n - b.n)).filter((steps) => steps.length);
  const totalSteps = lanes.reduce((sum, steps) => sum + steps.length, 0);
  const perScene = Math.max(3, Math.ceil(totalSteps / FLOW_SCENES));
  for (const steps of lanes) {
    const taken = new Set();
    for (const group of chunk(steps, perScene)) {
      const lane = group[0].lane;
      const routes = group.map((step) => {
        const route = stepRoute(spec, step, taken);
        if (route) taken.add(route);
        return route;
      });
      // Frame the steps and the routes their dots travel.
      const actions = [{do: 'camera', focus: [...new Set([...group.map((step) => step.id), ...routes.filter(Boolean)])].slice(0, 8), padding: .08, at: 0}];
      group.forEach((step, i) => {
        if (routes[i]) actions.push({do: 'flow', step: step.id, edges: [routes[i]], at: Math.round((.05 + .85 * i / group.length) * 100) / 100});
      });
      const span = group.length > 1 ? `STEPS ${group[0].n}–${group.at(-1).n}` : `STEP ${group[0].n}`;
      scenes.push({
        id: `${lane}-${group[0].n}`, beat: 'flow', eyebrow: `${lane.toUpperCase()} FLOW`, headline: `${lane.toUpperCase()} FLOW · ${span}`, caption: `${lane.toUpperCase()} FLOW`,
        narration: group.map((step) => sentence(`Step ${step.n}: ${step.text.replace(/\n/g, ' ')}`)).join(' ').slice(0, 260),
        primitive: {kind: 'diagram', actions},
      });
    }
  }

  // Monitoring routes, then the whole picture.
  const telemetry = spec.edges.filter((edge) => edge.lane === 'telemetry').slice(0, ACTIONS - 1);
  if (telemetry.length) {
    scenes.push({
      id: 'monitoring', beat: 'wrap', eyebrow: 'OBSERVABILITY', headline: 'METRICS AND LOGS', caption: 'METRICS AND LOGS',
      narration: 'Metrics and logs from every part are collected for monitoring.',
      primitive: {kind: 'diagram', actions: [{do: 'camera', focus: 'all', padding: .04, at: 0}, ...telemetry.map((edge, i) => ({do: 'connect', edge: edge.id, at: Math.round((.1 + .5 * i / telemetry.length) * 100) / 100}))]},
    });
  }
  // Any route no step travelled (and that isn't plain or monitoring) draws in as the camera pulls back.
  const drawn = new Set(scenes.flatMap((scene) => scene.primitive.actions.flatMap((action) => (action.do === 'connect' ? [action.edge] : action.do === 'flow' ? action.edges : []))));
  const leftover = spec.edges.filter((edge) => !drawn.has(edge.id)).slice(0, ACTIONS - 1);
  scenes.push({
    id: 'verdict', beat: 'verdict', eyebrow: 'THE WHOLE PICTURE', headline: 'THE WHOLE PICTURE', caption: 'WHAT WOULD YOU CHANGE?',
    narration: 'That is the whole picture. What would you change?',
    primitive: {kind: 'diagram', actions: [{do: 'camera', focus: 'all', padding: .03, at: 0}, ...leftover.map((edge, i) => ({do: 'connect', edge: edge.id, at: Math.round((.1 + .4 * i / leftover.length) * 100) / 100}))]},
  });

  return {
    id, title, storyPattern: 'walkthrough', numberRelevant: false,
    premise: `A walkthrough of ${title}, drawn from its architecture diagram.`.slice(0, 140),
    audiencePromise: 'Follow each numbered step through the architecture, as it is drawn.',
    openLoop: 'How do the parts of this system work together?',
    payoff: 'Every flow, step by step, ending on the whole picture.',
    targetEmotion: 'curiosity', engagementQuestion: 'What would you change?',
    show, subject: {name: title, category: 'Architecture'}, format: 'landscape',
    rights: {
      releaseStatus: 'internal-prototype', publicReleaseApproved: false,
      ownershipNotice: `Diagram imported from ${file}. Narration and checks are original.`,
      nonAffiliationNotice: 'An independent explainer. Product names belong to their owners.',
      assets: [{kind: 'diagram', sourceUrl: 'https://example.com/replace-with-the-diagram-source', owner: `Diagram source: ${file}`, licenseStatus: 'owned', publicReleaseApproved: false, notes: 'Imported from draw.io. Replace the source URL, confirm ownership and the icons\' terms before release.'}],
    },
    diagram: spec,
    scenes,
    sources: [{label: `Source diagram: ${file} (replace with the system's docs or repository)`, url: 'https://example.com/replace-with-a-real-source'}],
  };
};
