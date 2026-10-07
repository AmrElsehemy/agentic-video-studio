# Architecture explainers: narrated diagrams (#120)

A diagram that builds up across an episode, each element appearing as the narrator names it. Rendering is deterministic: the same draft and narration always give the same frames. No generated video.

## Where things live

| Piece | File | Issue |
| --- | --- | --- |
| Spec and `diagram` primitive schema, semantic checks | `scripts/diagram-schema.mjs` | #121 |
| Layout at compile time (stored in the manifest) | `scripts/lib/diagram-layout.mjs` | #122 |
| Planar camera | `src/video/canvas/camera.ts` | #123 |
| Canvas state (a fold over the run's actions) and SVG renderer | `src/video/diagram/` | #124 |
| Word-anchored timing, resolved in the render props | `scripts/lib/diagram-timing.mjs` | #125 |
| Prototype episode | `drafts/under-the-hood/how-avs-works.json` | #126 |

## Authoring

The draft's `diagram` says what exists; it never has coordinates.

```json
"diagram": {
  "nodes": [{"id": "planner", "label": "Planner", "kind": "agent", "detail": "picks the angle"}],
  "edges": [{"id": "e1", "from": "prompt", "to": "planner", "label": "brief"}],
  "groups": [{"id": "assets", "label": "Assets"}]
}
```

- Node `kind`: user, agent, tool, process, artifact, store, model or api. It is shown as the node's tag.
- `label` is up to 24 characters and `detail` up to 36. Edge labels are up to 20.
- Nodes join a group with `"group": "<id>"`.
- The graph must not loop. Feedback edges come with #131.

Each scene's primitive says what happens when:

```json
{"kind": "diagram", "actions": [
  {"do": "camera", "focus": ["prompt", "planner"], "at": 0},
  {"do": "reveal", "target": "planner", "at": {"word": "planner"}},
  {"do": "connect", "edge": "e1", "at": {"after": "planner"}},
  {"do": "highlight", "target": "planner", "at": {"word": "shape"}}
]}
```

| Verb | Does | Fields |
| --- | --- | --- |
| `reveal` | A node or group appears. A group brings its members with it. | `target`, `anim`: `draw` (default), `pop` or `fade` |
| `connect` | An edge's arrow draws along its path. | `edge` |
| `highlight` | A node or edge glows in the accent colour; a highlighted edge carries a pulse. | `target`, `until` (default: the end of the scene) |
| `camera` | The camera moves to frame these elements. | `focus`: ids or `"all"`, `padding` |

Every action has `at` and an optional `dur` (seconds). `at` takes one of four forms:

- a fraction of the scene, e.g. `0.4`;
- a spoken word, `{"word": "planner", "nth": 1}`. A plural or possessive of the word also matches;
- a chain, `{"after": "<action id or target>", "delay": 0.2}`;
- `"scene-end"`.

Consecutive diagram scenes are one canvas, so each scene opens on what the previous one left. Set `"cut": true` to start fresh.

## Checks

The compiler checks everything below before any render:

- ids are unique, and every reference points at something that exists;
- the graph has no loops;
- boxes don't overlap, nothing leaves the canvas, edges don't run through boxes, and groups don't cover outsiders;
- an arrow is never drawn before both of its ends are on screen;
- nothing is highlighted before it is shown;
- every word anchor is actually said in its scene's narration.

At render time, anchors resolve against the aligned word times (`npm run captions:align -- <id>`), so visuals start 60 ms before their word.

## Architecture walkthroughs (an existing diagram, 16:9)

To explain a diagram that already exists, such as an Azure reference architecture or your own draw.io file, set `"theme": "architecture"` and `"format": "landscape"` in the draft. The picture keeps its own coordinates, because viewers recognise it. `drafts/under-the-hood/azure-cache-aside.json` is the example.

- `source` records where the coordinates came from: `"image"`, read once by a vision pass and checked by a person, or `"drawio"` (see "Importing from draw.io" below). Its `width` and `height` are the source's pixel size.
- `nodes` have an `icon` from `public/icons/`, a centre `at`, a `size`, a `labelAt` and an optional grey `tile`. Azure icons follow Microsoft's terms in `public/icons/azure/NOTICE.md`.
- `groups` are the dashed or dotted boundaries, such as a virtual network or a subnet.
- `edges` are routes exactly as drawn (start, corners, end) in a lane: `read` (green), `write` (blue), `plain` or `telemetry` (grey).
- `steps` are the numbered badges: a green circle for reads, a blue square for writes, with their text. `legend` and free `labels` complete the picture.

Scenes use `reveal`, `connect` and `camera`, plus `flow`, which walks a step:

```json
{"do": "flow", "step": "r2", "edges": ["read-cache"], "at": {"word": "cache"}}
```

The step's badge pops in, and a dot in its lane colour travels the listed edges in order, drawing any that aren't on the picture yet. Camera focus can name nodes, groups, steps, edges or labels. The camera zooms up to 2.6× so the source's small labels can be read on a 1080p frame.

A landscape episode isn't a Short, so a scene can run up to 12 s and the episode up to 3 minutes. The video critic reads the chapter at the top left and the captions along the bottom. The cover is the finished diagram, with the hook's headline on a card.

### Two looks for the same picture

`"look": "clean"` (the default) draws the diagram as its source does: a white page, real icons and a serif face. `"look": "sketch"` draws it by hand on the notebook page instead, at the same coordinates:
- routes and boundaries in sketchy ink, in each lane's colour;
- labels lettered in Patrick Hand SC;
- the real icons coloured in with marker strokes, and grey tiles hatched;
- step badges filled with marker, and each flow a highlighter swipe that the pen follows.

The sketch draws each element a little slower, so it can be seen being drawn.

A sketch version is a twin of the clean one: give it `"twinOf"` the clean episode, the same scenes and narration, and its own title (`drafts/under-the-hood/azure-cache-aside-sketch.json`). It plays the clean episode's narration, so it costs nothing extra to voice. Twins may differ by palette or by look.

## Importing from draw.io

```
npm run diagram:import -- path/to/system.drawio --id my-system --title "My System" [--look sketch] [--page "Page-1"] [--show under-the-hood]
```

This reads the diagram and writes `drafts/<show>/<id>.json`: the picture as an architecture spec, at its own coordinates, plus a starter walkthrough that compiles without edits. Plain and compressed pages both work. Pass `--spec-only` to print the spec and write nothing.

What it recognises:

| In draw.io | In the spec |
| --- | --- |
| Icon shapes: draw.io's Azure stencils (`azure2`, `mscae`) and SVG images embedded in the file | components, with their icons |
| Plain boxes and ellipses with text | components drawn as that shape, with the label inside |
| Containers, and unfilled boxes around other shapes | boundaries: dashed, or dotted when the dash pattern is short |
| A small unlabelled icon on a boundary's edge | that boundary's badge (the virtual network sign) |
| A filled box behind a single icon | that component's grey tile |
| Edges, with waypoints and fixed exit and entry points, in any container | routes. Green strokes are reads, blue are writes, grey is telemetry, anything else is plain |
| Small filled circles or squares with a number | numbered steps. Each takes the nearest text beside it, and the fill sets the lane |
| The same badges without a number, with text beside them | the legend |
| Any other text | free labels |

A label is the shape's own text, or a text box right beside it.

The importer lists anything it had to guess, for example a route drawn by draw.io's router with no waypoints, or a badge that isn't green or blue. It also lists stencils it has no icon for. Those are drawn with `public/icons/generic/component.svg` until you add the icon under `public/icons/` and map it in `AZURE_ICONS` in `scripts/lib/drawio.mjs`.

The starter walkthrough uses the `walkthrough` story shape:

1. a hook revealing the first parts;
2. setup scenes revealing the rest;
3. each lane's steps in order, up to three a scene, each with its dot travelling the nearest route in its lane;
4. a monitoring scene, if the diagram has telemetry routes;
5. the whole picture, drawing any routes no step used.

Its narration is placeholder text built from the step labels. Rewrite it, anchor actions to the words you write, and replace the placeholder sources before you voice it.

`test/fixtures/drawio/azure-cache-aside.drawio` was saved by draw.io itself. The tests import it and check the result against the hand-made `azure-cache-aside` spec.
