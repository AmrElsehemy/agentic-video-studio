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
