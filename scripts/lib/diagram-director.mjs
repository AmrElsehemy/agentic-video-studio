// Diagram Director (#129): gives every scene of a diagram episode its actions.
// The model chooses what happens on which spoken word (reveal, connect,
// highlight, annotate, flow, camera); it never writes coordinates, and it can
// only name elements the diagram defines. Each scene's actions are checked in
// order against the canvas the earlier scenes left. A scene whose actions break
// a rule gets the deterministic fallback instead, with the reason listed: the
// diagram's next stage (laid-out themes: the next rank of the graph; an
// architecture: its parts left to right, then each lane's numbered steps),
// anchored to the words the narration says, with the camera following.
import {z} from 'zod';
import {diagramActionProblems, diagramActionSchema, wordMatches} from '../diagram-schema.mjs';
import {archActionProblems} from '../diagram-arch-schema.mjs';
import {compileEpisode, estimatedSpeech} from './compiler.mjs';
import {ranks} from './diagram-layout.mjs';
import {stepRoute} from './drawio-draft.mjs';
import {parseJsonReply} from './fact-verifier.mjs';
import {styleGuideSection} from './shows.mjs';

/** The most actions a scene may have (the primitive's limit). */
const ACTIONS = 12;
/** The most elements a camera move may frame. */
const FOCUS = 8;
/** The most steps a fallback scene walks. */
const FLOWS = 3;
const actionsSchema = z.array(diagramActionSchema).min(1).max(ACTIONS);

/** Words too common to anchor an element to. */
const COMMON = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'then', 'each', 'every', 'your', 'their', 'data', 'step', 'flow', 'read', 'write', 'service', 'private', 'endpoint']);

const round = (value) => Math.round(value * 100) / 100;

/** What an element is called on screen, for the prompt and for matching narration. */
const elementsOf = (spec) => {
  const arch = spec.theme === 'architecture';
  const items = new Map();
  for (const node of spec.nodes) items.set(node.id, {kind: 'node', label: arch ? node.label.replace(/\n/g, ' ') : node.label, ...(arch ? {} : {detail: node.detail, group: node.group})});
  for (const group of spec.groups) items.set(group.id, {kind: 'group', label: group.label ?? group.id});
  for (const label of spec.labels ?? []) items.set(label.id, {kind: 'label', label: label.text.replace(/\n/g, ' ')});
  for (const step of spec.steps ?? []) items.set(step.id, {kind: 'step', label: step.text.replace(/\n/g, ' '), lane: step.lane, n: step.n});
  for (const edge of spec.edges) items.set(edge.id, {kind: 'edge', label: edge.label ?? '', lane: edge.lane});
  return items;
};

/** What is on the canvas after these scenes' actions (a cut starts a fresh one). */
export const canvasAfter = (spec, scenes) => {
  let shown = new Set();
  for (const scene of scenes) {
    const primitive = scene.primitive;
    if (primitive?.kind !== 'diagram') continue;
    if (primitive.cut) shown = new Set();
    for (const action of primitive.actions) {
      if (action.do === 'reveal') {
        shown.add(action.target);
        for (const node of spec.nodes) if (node.group === action.target) shown.add(node.id);
      } else if (action.do === 'connect') shown.add(action.edge);
      else if (action.do === 'flow') for (const id of [action.step, ...action.edges]) shown.add(id);
    }
  }
  return shown;
};

/**
 * What's wrong with these scenes' actions, as the compiler would say it, plus
 * what an architecture's checks don't cover: highlighting or annotating
 * something not yet on the picture.
 */
const problemsOf = (spec, scenes) => {
  if (spec.theme !== 'architecture') return diagramActionProblems(spec, scenes);
  const problems = archActionProblems(spec, scenes, wordMatches);
  const nodes = new Set(spec.nodes.map((node) => node.id));
  const before = [];
  for (const scene of scenes) {
    if (scene.primitive?.kind === 'diagram') {
      const shown = canvasAfter(spec, before);
      scene.primitive.actions.forEach((action, index) => {
        if ((action.do === 'highlight' || action.do === 'annotate') && !shown.has(action.target)) problems.push(`scene "${scene.id}" action ${index + 1} ${action.do === 'highlight' ? 'highlights' : 'annotates'} "${action.target}" before it is on screen`);
        if (action.do === 'highlight' && !nodes.has(action.target)) problems.push(`scene "${scene.id}" action ${index + 1} highlights "${action.target}"; only components can be highlighted`);
        if (action.do === 'reveal') {
          shown.add(action.target);
        } else if (action.do === 'connect') shown.add(action.edge);
        else if (action.do === 'flow') for (const id of [action.step, ...action.edges]) shown.add(id);
      });
    }
    before.push(scene);
  }
  return problems;
};

/**
 * Small, unambiguous repairs to the model's actions, each listed: a word's
 * "nth" beyond the times it is said is taken as its last time; highlighting
 * something not yet on the canvas reveals it; "revealing" a step walks it
 * (flow), unless the scene walks it anyway.
 */
export const repairActions = (actions, {spec, scene, previous}) => {
  const repairs = [];
  const tokens = scene.narration.split(/\s+/);
  const shown = canvasAfter(spec, previous);
  const steps = new Set((spec.steps ?? []).map((step) => step.id));
  const flowed = new Set(actions.filter((action) => action?.do === 'flow').map((action) => action.step));
  const anchor = (value, where) => {
    if (!value || typeof value !== 'object' || typeof value.word !== 'string' || !value.nth) return value;
    const said = tokens.filter((token) => wordMatches(token, value.word)).length;
    if (said >= 1 && value.nth > said) {
      repairs.push(`${where}: "${value.word}" is said ${said === 1 ? 'once' : `${said} times`}, not ${value.nth}`);
      return said > 1 ? {...value, nth: said} : {word: value.word};
    }
    return value;
  };
  const repaired = [];
  actions.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') { repaired.push(raw); return; }
    const where = `action ${index + 1}`;
    let action = {...raw, at: anchor(raw.at, where), ...(raw.until ? {until: anchor(raw.until, where)} : {})};
    if (action.do === 'reveal' && steps.has(action.target)) {
      if (flowed.has(action.target)) { repairs.push(`${where}: dropped the reveal of step "${action.target}", which the scene walks`); return; }
      repairs.push(`${where}: step "${action.target}" is walked (flow), not revealed`);
      action = {do: 'flow', step: action.target, at: action.at};
      flowed.add(action.step);
    }
    if (action.do === 'highlight' && typeof action.target === 'string' && !shown.has(action.target) && spec.nodes.some((node) => node.id === action.target)) {
      repairs.push(`${where}: "${action.target}" isn't on the picture yet, so it is revealed instead of highlighted`);
      action = {do: 'reveal', target: action.target, at: action.at};
    }
    if (action.do === 'reveal') {
      shown.add(action.target);
      for (const node of spec.nodes) if (node.group === action.target) shown.add(node.id);
    } else if (action.do === 'connect') shown.add(action.edge);
    else if (action.do === 'flow') for (const id of [action.step, ...(action.edges ?? [])]) shown.add(id);
    repaired.push(action);
  });
  return {actions: repaired, repairs};
};

/**
 * Turn the model's actions for one scene into checked actions, or throw with
 * the reason. A flow may leave out its edges: the step's nearest route in its
 * lane is used, as the importer does. Returns the primitive and any repairs.
 */
export const shotToActions = (shot, {spec, scene, previous}) => {
  if (!shot || typeof shot !== 'object' || !Array.isArray(shot.actions)) throw new Error('no actions');
  const arch = spec.theme === 'architecture';
  const steps = new Map((spec.steps ?? []).map((step) => [step.id, step]));
  const {actions: repaired, repairs} = repairActions(shot.actions, {spec, scene, previous});
  const actions = repaired.map((action) => {
    if (arch && action?.do === 'flow' && steps.has(action.step) && (!Array.isArray(action.edges) || !action.edges.length)) {
      const route = stepRoute(spec, steps.get(action.step));
      return route ? {...action, edges: [route]} : action;
    }
    return action;
  });
  const parsed = actionsSchema.safeParse(actions);
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => `actions${issue.path.length ? `[${issue.path.join('.')}]` : ''}: ${issue.message}`).join('; '));
  if (!arch && parsed.data.some((action) => action.do === 'flow')) throw new Error('"flow" walks the numbered steps of an architecture; this diagram has none');
  const directed = {...scene, primitive: {kind: 'diagram', actions: parsed.data, ...(shot.cut === true ? {cut: true} : {})}};
  const problems = problemsOf(spec, [...previous, directed]).filter((problem) => problem.startsWith(`scene "${scene.id}"`));
  if (problems.length) throw new Error(problems.join('; '));
  return {primitive: directed.primitive, repairs};
};

/**
 * The fallback's plan for the whole episode: units in the order they should
 * appear. Laid-out diagrams go rank by rank down the graph (a node in a group
 * brings its group); architectures go left to right through their parts, then
 * each lane's steps in order.
 */
const agendaOf = (spec) => {
  if (spec.theme === 'architecture') {
    const reading = (at) => at[0] * 10000 + at[1];
    const parts = [
      ...spec.groups.map((group) => ({id: group.id, kind: 'reveal', order: reading([group.box.x, group.box.y])})),
      ...spec.nodes.map((node) => ({id: node.id, kind: 'reveal', order: reading(node.at)})),
      ...(spec.labels ?? []).map((label) => ({id: label.id, kind: 'reveal', order: reading(label.at)})),
    ].sort((a, b) => a.order - b.order);
    const steps = ['read', 'write'].flatMap((lane) => (spec.steps ?? []).filter((step) => step.lane === lane).sort((a, b) => a.n - b.n)).map((step) => ({id: step.id, kind: 'flow'}));
    return [...parts.map((part) => [part]), ...steps.map((step) => [step])];
  }
  const rank = ranks(spec);
  const stages = new Map();
  spec.nodes.forEach((node) => {
    const at = rank.get(node.id);
    if (!stages.has(at)) stages.set(at, []);
    stages.get(at).push({id: node.id, kind: 'reveal'});
  });
  return [...stages.keys()].sort((a, b) => a - b).map((at) => stages.get(at));
};

/** Words of a label worth anchoring to: not common, and naming at most `most` elements of the diagram. */
const distinctWords = (spec) => {
  const counts = new Map();
  for (const item of elementsOf(spec).values()) {
    for (const key of new Set(String(item.label).toLowerCase().split(/[^a-z0-9]+/))) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (label, most = 2) => String(label).split(/[^A-Za-z0-9]+/).filter((word) => word.length >= 3 && !COMMON.has(word.toLowerCase()) && (counts.get(word.toLowerCase()) ?? 0) <= most);
};

/** Narration tokens, each to be used as an anchor at most once. */
const wordPicker = (narration, wordsOf) => {
  const tokens = narration.split(/\s+/).filter(Boolean);
  const used = new Set();
  const find = (label, most) => {
    for (const word of wordsOf(label, most)) {
      const index = tokens.findIndex((token, i) => !used.has(i) && wordMatches(token, word));
      if (index !== -1) return {word, index};
    }
    return undefined;
  };
  const pick = (label) => {
    const found = find(label);
    if (!found) return undefined;
    used.add(found.index);
    const nth = tokens.slice(0, found.index + 1).filter((token) => wordMatches(token, found.word)).length;
    return nth > 1 ? {word: found.word, nth} : {word: found.word};
  };
  return Object.assign(pick, {says: (label, most) => Boolean(find(label, most)), lane: () => {
    const read = tokens.some((token) => /^(read|reads|reading|hit|miss)\W*$/i.test(token));
    const write = tokens.some((token) => /^(write|writes|writing|update|updates)\W*$/i.test(token));
    return read === write ? undefined : read ? 'read' : 'write';
  }});
};

/**
 * The fallback actions for one scene, given what is already on the canvas and
 * how many scenes are left (this one included). Takes this scene's share of
 * the agenda; the last scene takes the rest and pulls back to the whole picture.
 */
export const fallbackActions = (spec, scene, {shown, scenesLeft, first = false, previousLane}) => {
  const arch = spec.theme === 'architecture';
  const items = elementsOf(spec);
  const last = scenesLeft <= 1;
  const pick = wordPicker(scene.narration, distinctWords(spec));
  const pending = agendaOf(spec).map((stage) => stage.filter((unit) => !shown.has(unit.id))).filter((stage) => stage.length);
  const share = last ? pending.length : Math.ceil(pending.length / scenesLeft);
  // Room for the camera and, on laid-out diagrams, an arrow per new node.
  const limit = arch ? ACTIONS - 1 : (ACTIONS - 1) / 2;
  // The opening builds the picture; later scenes about a lane walk it, and a scene that names no lane carries on the previous one's.
  const lane = arch && !first ? pick.lane() ?? previousLane : undefined;
  // About one new element a second of narration, so each can be seen arriving.
  const budget = Math.max(2, Math.min(ACTIONS - 1, Math.floor(estimatedSpeech(scene.narration, 1))));
  const steps = new Map((spec.steps ?? []).map((step) => [step.id, step]));
  const laneOk = (unit) => unit.kind !== 'flow' || !lane || steps.get(unit.id).lane === lane;
  // A scene about a lane walks that lane (its parts come only when named); a scene about neither builds the picture first.
  const fits = (stage) => !arch || last || stage.every((unit) => (unit.kind === 'flow' ? laneOk(unit) && (lane || !pending.some((other) => other[0].kind === 'reveal')) : !lane));
  let ordered = pending.filter(fits);
  if (arch) {
    // What the narration names comes first; a named step brings the earlier steps of its lane, so a lane is always walked in order.
    const named = new Set();
    for (const stage of pending) {
      const [unit] = stage;
      // A step is pulled in by name only in a scene about its lane; elsewhere its words are just words.
      // Steps share words ("miss", "request"), so a step is named only by a word no other element uses.
      if (!pick.says(items.get(unit.id).label, unit.kind === 'flow' ? 1 : 2) || (unit.kind === 'flow' && (!lane || !laneOk(unit)))) continue;
      if (unit.kind === 'flow') {
        const {lane: own, n} = steps.get(unit.id);
        for (const earlier of pending) if (earlier[0].kind === 'flow' && steps.get(earlier[0].id).lane === own && steps.get(earlier[0].id).n <= n) named.add(earlier);
      } else named.add(stage);
    }
    ordered = [...pending.filter((stage) => named.has(stage)), ...ordered.filter((stage) => !named.has(stage))];
    ordered.named = named.size;
  }
  const chosen = [];
  for (const stage of ordered) {
    // A scene that names elements shows those; one that names none takes its share of what comes next.
    if (!last && chosen.length >= (ordered.named || share)) break;
    if (chosen.length && chosen.length + stage.length > limit) break;
    // At most three steps a scene, so each dot can be followed (the last scene finishes whatever is left).
    if (!last && stage[0].kind === 'flow' && chosen.filter((unit) => unit.kind === 'flow').length >= FLOWS) continue;
    chosen.push(...stage);
  }
  const now = new Set(shown);
  const planned = [];
  const groups = new Map(spec.nodes.filter((node) => node.group).map((node) => [node.id, node.group]));
  const revealedBy = new Map();
  const taken = new Set([...shown].filter((id) => spec.edges.some((edge) => edge.id === id)));
  // An architecture's part arrives inside its boundaries, and a step's dot runs between parts already drawn.
  const inside = (point) => spec.groups.filter((group) => group.box && point[0] >= group.box.x && point[0] <= group.box.x + group.box.w && point[1] >= group.box.y && point[1] <= group.box.y + group.box.h).sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h).map((group) => group.id);
  const nearest = (point) => spec.nodes.map((node) => ({id: node.id, d: Math.hypot(node.at[0] - point[0], node.at[1] - point[1])})).sort((a, b) => a.d - b.d)[0]?.id;
  const reveal = (id) => {
    if (now.has(id)) return;
    if (arch) {
      const node = spec.nodes.find((item) => item.id === id);
      if (node) for (const group of inside(node.at)) reveal(group);
    }
    // A node in a group that isn't on the canvas yet arrives with its group.
    const group = !arch && groups.get(id);
    const target = group && !now.has(group) ? group : id;
    planned.push({action: {do: 'reveal', target}, word: pick(items.get(id).label) ?? (target !== id ? pick(items.get(target).label) : undefined), focus: [id]});
    now.add(target);
    revealedBy.set(target, target);
    for (const node of spec.nodes) if (node.group === target) { now.add(node.id); revealedBy.set(node.id, target); }
    if (target !== id) revealedBy.set(id, target);
  };
  for (const unit of chosen) {
    if (now.has(unit.id)) continue;
    if (planned.length >= budget && !last) break;
    if (unit.kind === 'flow') {
      const step = steps.get(unit.id);
      const route = stepRoute(spec, step, taken);
      if (!route) continue;
      const {points} = spec.edges.find((edge) => edge.id === route);
      for (const end of [nearest(points[0]), nearest(points.at(-1))]) if (end) reveal(end);
      taken.add(route);
      planned.push({action: {do: 'flow', step: step.id, edges: [route]}, word: pick(step.text), focus: [step.id, route]});
      now.add(step.id);
      now.add(route);
      continue;
    }
    reveal(unit.id);
  }
  // Arrows whose ends are both on the canvas now: laid-out edges by their ends; an architecture's unused routes only at the end.
  const connects = [];
  if (!arch) {
    for (const edge of spec.edges) {
      if (now.has(edge.id) || !now.has(edge.from) || !now.has(edge.to)) continue;
      const after = revealedBy.get(edge.to) ?? revealedBy.get(edge.from);
      connects.push({do: 'connect', edge: edge.id, at: after ? {after} : .85});
      now.add(edge.id);
    }
  } else {
    // An architecture's other routes (monitoring, plain links) draw when the narration names a part at their end, and at the end.
    const named = new Set(spec.nodes.filter((node) => now.has(node.id) && pick.says(node.label)).map((node) => node.id));
    for (const edge of spec.edges) {
      if (now.has(edge.id) || (edge.lane !== 'telemetry' && edge.lane !== 'plain')) continue;
      if (last || named.has(nearest(edge.points[0])) || named.has(nearest(edge.points.at(-1)))) { connects.push({do: 'connect', edge: edge.id}); now.add(edge.id); }
    }
    if (last) for (const edge of spec.edges) if (!now.has(edge.id)) { connects.push({do: 'connect', edge: edge.id}); now.add(edge.id); }
  }
  // Timing: on a spoken word where the narration names the element, else spread across the scene in order.
  let at = .05;
  const timed = planned.map((step, index) => {
    const spread = round(.05 + .75 * index / Math.max(1, planned.length));
    at = Math.max(at, spread);
    return {...step.action, at: step.word ?? at};
  });
  const room = ACTIONS - 1 - timed.length;
  const arrows = connects.slice(0, Math.max(0, room)).map((connect, index, all) => (connect.at === undefined ? {...connect, at: round(.15 + .6 * index / Math.max(1, all.length))} : connect));
  const newFocus = [...new Set(planned.flatMap((step) => step.focus))];
  let camera;
  if (last || !newFocus.length) {
    // Nothing new: frame what the narration names, or the whole picture.
    const said = !last && [...now].filter((id) => items.get(id)?.kind === 'node' && pick.says(items.get(id).label));
    camera = said && said.length ? {do: 'camera', focus: said.slice(0, FOCUS), at: 0} : {do: 'camera', focus: 'all', padding: arch ? .03 : .08, at: 0};
    if (said && said.length && !timed.length) timed.push({do: 'highlight', target: said[0], at: pick(items.get(said[0]).label) ?? .3});
  } else {
    // Frame the new elements with what they connect to.
    const neighbours = arch ? [] : spec.edges.filter((edge) => newFocus.includes(edge.to) && now.has(edge.from)).map((edge) => edge.from);
    camera = {do: 'camera', focus: [...new Set([...neighbours, ...newFocus])].slice(0, FOCUS), padding: arch ? .08 : .14, at: 0};
  }
  return {kind: 'diagram', actions: [camera, ...timed, ...arrows]};
};

const describe = (spec) => {
  const items = elementsOf(spec);
  const lines = [];
  for (const [id, item] of items) {
    if (item.kind === 'node') lines.push(`- ${id} (component): ${item.label}${item.detail ? ` — ${item.detail}` : ''}${item.group ? ` [in group ${item.group}]` : ''}`);
    else if (item.kind === 'group') lines.push(`- ${id} (group): ${item.label}`);
    else if (item.kind === 'label') lines.push(`- ${id} (text on the picture): ${item.label}`);
    else if (item.kind === 'step') lines.push(`- ${id} (${item.lane} step ${item.n}): ${item.label}`);
  }
  if (spec.theme === 'architecture') {
    const nearest = (point) => spec.nodes.map((node) => ({node, d: Math.hypot(node.at[0] - point[0], node.at[1] - point[1])})).sort((a, b) => a.d - b.d)[0]?.node.id;
    for (const edge of spec.edges) lines.push(`- ${edge.id} (${edge.lane} route): from near ${nearest(edge.points[0])} to near ${nearest(edge.points.at(-1))}`);
  } else {
    for (const edge of spec.edges) lines.push(`- ${edge.id} (arrow): ${edge.from} → ${edge.to}${edge.label ? ` "${edge.label}"` : ''}`);
  }
  return lines.join('\n');
};

export const buildDiagramDirectorPrompt = ({draft, showId = draft.show?.id}) => {
  const spec = draft.diagram;
  const arch = spec.theme === 'architecture';
  return {
    system: `You are the diagram director of ${draft.show?.name ?? 'an explainer series'}: videos where a diagram builds up in sync with the narration. Give EVERY scene the actions that show what its narration says, timed to the words that say it.

A scene's actions are JSON:
{"id": "<scene id>",
 "actions": [   // 1-12, in the order they happen
   {"do": "camera", "focus": ["<id>", ...] | "all", "padding": 0.1, "at": 0},   // frame up to 8 elements; start each scene with one
   {"do": "reveal", "target": "<${arch ? 'component, group or text' : 'node or group'} id>", "at": A},${arch ? '' : '   // a group brings its nodes with it'}
   {"do": "connect", "edge": "<${arch ? 'route' : 'arrow'} id>", "at": A},
   {"do": "highlight", "target": "<${arch ? 'component' : 'node or arrow'} id>", "at": A},${arch ? `
   {"do": "flow", "step": "<step id>", "edges": ["<route id>", ...], "at": A},   // the step's badge appears and a dot travels the routes in order, drawing them` : `
   {"do": "annotate", "target": "<node id>", "text": "short side note, max 44 chars", "at": A},   // drawn on notebook pages`}
 ],
 "why": "one sentence"}

A (when) is one of:
- {"word": "cache"}: the moment that word is spoken. It must be a word of THIS scene's narration, spelled as said (a plural also matches). Add "nth": 2 for its second time.
- {"after": "<id of an earlier action's target in this scene>", "delay": 0.2}: right after it.
- a fraction of the scene, 0 to 1.
- "scene-end".

Rules:
- Use only the ids listed below. Never write coordinates.
- Consecutive scenes are one canvas: what earlier scenes showed stays. Never reveal something twice.
- ${arch ? 'Highlight only components an earlier action already put on the picture; to show something new, reveal it. Steps are shown only by "flow" (never reveal a step), and a flow draws its routes, so routes a step travels need no connect. "edges" may be left out: the step\'s own route is used.' : 'An arrow can be drawn only when both its ends are on screen. Highlight or annotate only what is already shown.'}
- A word anchor must be a word of THIS scene's narration. Use "nth" only when that word is said more than once in the scene; to time two actions off one word, chain the second with "after".
- Reveal an element on the word that names it; show what the narration talks about, in the order it says it. About one new element per second of narration: leave the rest for later scenes.
- Start each scene with a camera move framing what it is about. Pull back to "all" only in the last scene (or when a scene is about the whole picture).
- By the last scene, everything the story needs should be on the picture.

Reply with a JSON object only: {"scenes": [<scene>, ...]}${showId ? styleGuideSection(showId) : ''}`,
    messages: [{role: 'user', content: `Diagram elements (id (kind): label):\n${describe(spec)}\n\nScenes:\n${JSON.stringify(draft.scenes.map((scene) => ({id: scene.id, beat: scene.beat, headline: scene.headline, narration: scene.narration})), null, 2)}`}],
  };
};

/**
 * Direct a diagram episode. Every scene gets the model's actions when they
 * pass every check against the canvas so far, otherwise the fallback (listed
 * in `fallbacks` with the reason). Without a model every scene falls back.
 * Returns the directed draft and its manifest.
 */
export const directDiagram = async ({draft, complete, showId = draft.show?.id}) => {
  const spec = draft.diagram;
  if (!spec) throw new Error(`${draft.id} has no diagram to direct.`);
  const shots = new Map();
  let modelError;
  if (complete) {
    try {
      const reply = parseJsonReply(await complete(buildDiagramDirectorPrompt({draft, showId})));
      const items = Array.isArray(reply) ? reply : Array.isArray(reply?.scenes) ? reply.scenes : [];
      for (const item of items) if (typeof item?.id === 'string' && !shots.has(item.id)) shots.set(item.id, item);
    } catch (error) {
      modelError = error instanceof Error ? error.message : String(error);
    }
  }
  const assigned = [];
  const fallbacks = [...shots.keys()].filter((id) => !draft.scenes.some((scene) => scene.id === id)).map((id) => ({id, reason: 'no such scene'}));
  const scenes = [];
  draft.scenes.forEach((scene, index) => {
    const shot = shots.get(scene.id);
    let primitive;
    if (shot) {
      try {
        const result = shotToActions(shot, {spec, scene, previous: scenes});
        primitive = result.primitive;
        assigned.push({id: scene.id, why: typeof shot.why === 'string' ? shot.why : '', ...(result.repairs.length ? {repairs: result.repairs} : {})});
      } catch (error) {
        fallbacks.push({id: scene.id, reason: error instanceof Error ? error.message : String(error)});
      }
    } else fallbacks.push({id: scene.id, reason: complete ? 'the model gave no actions' : 'no model'});
    // The lane the story is on: the last step walked so far.
    const lastFlow = scenes.flatMap((done) => done.primitive.actions.filter((action) => action.do === 'flow')).at(-1);
    const previousLane = lastFlow ? spec.steps?.find((step) => step.id === lastFlow.step)?.lane : undefined;
    primitive ??= fallbackActions(spec, scene, {shown: canvasAfter(spec, scenes), scenesLeft: draft.scenes.length - index, first: index === 0, previousLane});
    scenes.push({...scene, primitive});
  });
  const directed = {...draft, scenes};
  const {manifest} = compileEpisode(directed, {showId});
  return {draft: directed, manifest, assigned, fallbacks, ...(modelError ? {modelError} : {})};
};
