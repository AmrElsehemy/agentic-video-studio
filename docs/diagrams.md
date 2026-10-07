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
| Diagram Director: actions from the narration | `scripts/lib/diagram-director.mjs` | #129 |
| Walkthrough writer: the script from the diagram | `scripts/lib/walkthrough-writer.mjs` | #128 |
| Diagram QA after render, in the video critic | `src/video/diagram/audit.ts` | #130 |

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
| `annotate` | A callout beside a node. The clean looks draw a card with a leader line, on whichever side is clear of the other parts; the clean canvas frames the node and its card as the card appears. Paper draws a handwritten note with an arrow. | `target`, `text` (up to 44 characters) |
| `circle` | A hand-drawn ring round a node, seeded so every render draws the same ring. | `target`, `until` |
| `dim` | Everything else fades back while the narration is about these elements. | `keep`: up to 8 ids, `until` |
| `pulse` | Dots stream along an edge, as data flowing. | `edge`, `until` |

Every action has `at` and an optional `dur` (seconds). `circle`, `dim` and `pulse` last until their `until` anchor, or the end of their scene, and then fade out. A circle drawn on paper stays on the page. Architecture walkthroughs take all four of these actions as well, on components and routes.

Golden frames: `npm run diagram:golden` renders each of these four actions in each look and compares the frames with `test/golden/diagram/`. The looks are clean and notebook laid-out diagrams, and clean and sketch architectures. Pass `--update` to accept intended changes. CI runs it whenever diagram rendering changes. `at` takes one of four forms:

- a fraction of the scene, e.g. `0.4`;
- a spoken word, `{"word": "planner", "nth": 1}`. A plural or possessive of the word also matches;
- a chain, `{"after": "<action id or target>", "delay": 0.2}`;
- `"scene-end"`.

Consecutive diagram scenes are one canvas, so each scene opens on what the previous one left. Set `"cut": true` to start fresh.

## Directing: actions from the narration

Once a draft has its diagram and narration, the director writes every scene's actions:

```
npm run diagram:direct -- url-shortener            # writes out/url-shortener.diagram-directed.json
npm run diagram:direct -- url-shortener --write    # replaces the draft's actions
npm run diagram:direct -- url-shortener --offline  # no model: the fallback for every scene
```

The model sees the diagram's ids, labels and steps, and each scene's narration. It picks which actions happen on which spoken words; it never writes coordinates. Each scene is checked against the canvas the earlier scenes left, with the compiler's own checks.

A few mistakes have only one reading, so they are repaired and listed:
- an `nth` beyond the times a word is said becomes its last time;
- highlighting something not yet on the picture reveals it;
- "revealing" a step walks it instead;
- an anchor of several words ("Cosmos DB") waits for the first of them the narration says;
- a part, step, boundary or label the scene draws outside every camera framing is added to the last one.

A scene with any other problem gets the fallback, and the CLI prints the reason. Without a model, every scene gets it. The fallback builds the picture in order:
- a laid-out diagram goes rank by rank down the graph;
- an architecture builds its parts, then walks each lane's steps in order, in the scenes whose narration talks about that lane. A step brings the parts at its route's ends, and a part brings the boundaries around it.

Either way, each element appears on a word that names it where the narration has one. There is about one new element per second of narration, the camera frames what is new, and the last scene pulls back to the whole picture.

Saved model replies for three systems are in `test/fixtures/diagram-director/`. They cover `how-avs-works`, `azure-cache-aside` and `url-shortener`, a plain-box draw.io diagram (`test/fixtures/drawio/url-shortener.drawio`). Pass `--save-reply=<file>` to keep a new one.

## Checks

The compiler checks everything below before any render:

- ids are unique, and every reference points at something that exists;
- the graph has no loops;
- boxes don't overlap, nothing leaves the canvas, edges don't run through boxes, and groups don't cover outsiders;
- an arrow is never drawn before both of its ends are on screen;
- nothing is highlighted before it is shown;
- every word anchor is actually said in its scene's narration.

At render time, anchors resolve against the aligned word times (`npm run captions:align -- <id>`), so visuals start 60 ms before their word.

After render, `npm run critic:video -- <id>` checks the result. It uses the same state code the renderer draws from, plus OCR on the rendered frames.

| Check | Fails (blocking) | Warns |
| --- | --- | --- |
| Timing | An action anchored to a word starts more than 150 ms from it, or the word is never said. An element whose name is spoken but is timed some other way appears more than 2.5 s before its name or 3 s after it. | The name and the element are more than 1.2 s apart. |
| Framing | A part, step, boundary or label drawn in a scene is less than 60% in the frame when the scene ends. Arrows and routes may run off toward parts out of the frame. | |
| Covered | In a 16:9 walkthrough, an element is more than 40% under the chapter card or the captions as it finishes drawing. | |
| Empty canvas | | The camera frames mostly empty canvas: the picture fills less than 12% of the frame. |
| Labels | OCR can't read a component's label in the final overview frame. Each label is read on its own, from where the camera puts it. 16:9 walkthroughs only. | |

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

Its narration is placeholder text built from the step labels. Have the writer replace it (below), or rewrite it yourself and run `npm run diagram:direct -- <id> --write` so the actions follow your words. Replace the placeholder sources before you voice it.

### Writing the script

```
npm run diagram:write -- my-system                      # writes out/my-system.walkthrough.json
npm run diagram:write -- my-system --write              # replaces the draft's script and actions
npm run diagram:write -- my-system --notes=notes.json   # adds facts the diagram doesn't show
```

The writer reads the diagram in plain words: the parts (a part's name is the first line of its label), the boundaries, the routes, and each lane's numbered steps in order. It writes the walkthrough in that shape:
- a hook;
- the parts;
- each flow's steps, told as one request's journey;
- an optional wrap-up;
- an either/or question.

It may state only what the diagram and the notes give. A number that neither states is rejected.

Each script goes through:
- the compiler, with the director's fallback;
- the engagement audit, timed by the 16:9 limits;
- the story critic, judging it as an explainer: hook, clarity, order, specificity, tension, variety, payoff and question.

A rejected script is revised with its problems and the critic's suggestions, up to `--attempts` times (3 by default). The Diagram Director then times the picture to the final words. If the critic never passes a script, the best one that passes production is kept and flagged for review.

Notes are JSON. Their sources replace the importer's placeholders:

```json
{"facts": ["Redirects are served from the Redis cache when the code is there."],
 "sources": [{"label": "Design doc", "url": "https://example.com/design"}]}
```

`test/fixtures/drawio/azure-cache-aside.drawio` was saved by draw.io itself. The tests import it and check the result against the hand-made `azure-cache-aside` spec.
