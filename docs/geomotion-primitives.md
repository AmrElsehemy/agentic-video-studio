# GeoMotion primitive: `geo-map`

A scene draws a map by carrying one `geo-map` primitive, just as other scenes carry a `counter` or a `timeline`. It goes through the same draft → compile → manifest → renderer path, so a new map episode is data only, with no per-episode React (#71, part of #69).

## Why one primitive with layers

The issue proposed `geo-map`, `geo-highlight` and `geo-annotation` as separate primitives. A scene carries **one** primitive, though, and every useful map shot combines a camera, highlighted places and labels. So v1 is a single `geo-map` whose highlights and annotations are layers inside it. That is the same vocabulary, and it can be combined in one scene.

## Contract

```jsonc
{
  "kind": "geo-map",
  // 1-4 camera keyframes. The first is at 0; each later one is further on in the scene.
  "camera": [
    {"target": "world", "at": 0},
    {"target": {"bbox": [36, 38, 52, 46]}, "at": 0.45},          // [west, south, east, north]
    {"target": "country:GEO", "at": 0.8, "padding": 0.2, "ease": "in-out"}
  ],
  // Up to 4 places that light up: "fill", "outline" or "trace" (the border draws itself).
  "highlights": [{"entity": "country:GEO", "style": "fill", "at": 0.7, "color": "#e4b363"}],
  // Up to 4 labels, markers or arrows, anchored to a place id or a {lon, lat} point.
  "annotations": [
    {"type": "label", "anchor": "water:black-sea", "text": "BLACK SEA", "at": 0.15},
    {"type": "marker", "anchor": {"lon": 44.79, "lat": 41.72}, "text": "TBILISI", "at": 0.3},
    {"type": "arrow", "from": "water:caspian-sea", "to": "country:GEO", "at": 0.6}
  ],
  "dataset": "natural-earth"                                        // the pinned map data (default)
}
```

| Field | Rules |
|---|---|
| Places | Registry ids from `public/geo/entities.json` (`country:<ADM0_A3>`, `water:<slug>`) or `public/geo/disputed.geojson` (`disputed:…`). Outlines always come from the map data; a draft can never contain hand-drawn polygons. |
| Points | `{lon, lat}` within ±180 / ±90. Use them only for things the registry doesn't have, such as a city marker. |
| Boxes | `[west, south, east, north]`. South must be below north. West greater than east means the box crosses the antimeridian. |
| Time | `at` is a fraction of the scene (0 = start, 1 = end), so the choreography follows the narration's timing. Camera keyframes must start at 0 and move forward. |
| Camera | `padding` (0-0.5, default 0.15) is the margin around the target. `ease` is `in-out` (default) or `linear`. |
| Text | Labels are at most 28 characters. They are the only on-screen words, so they are the only part the fact checks read. Place names come from the map data. |
| Defaults | `highlights: []`, `annotations: []`, `dataset: "natural-earth"`, highlight `style: "fill"`, `at: 0`. |

## What is checked, and where

- **Schema** (`scripts/primitive-schema.mjs`, shared by drafts, the compiler and the renderer): shapes, ranges, keyframe order, and unknown fields.
- **Compiler** (`scripts/lib/geo-primitives.mjs`): every place id must exist in the pinned map data. Otherwise compilation fails, listing each unknown id with where it's used and the nearest real ids (*`camera[0].target: unknown geo entity "country:GEORGIA"; did you mean country:GEO (Georgia)?`*). A map never renders empty.
- **Rights:** an episode with a map scene gets one `map-data` rights entry crediting Natural Earth (`public-domain`, with the attribution line). `preflight:publish` accepts `public-domain` assets.
- **Renderer:** until #72, a `geo-map` scene stops the render with an error instead of drawing nothing.
- **Visual Director:** it doesn't offer `geo-map` yet. Choosing map shots needs resolved places and evidence (#74).

Existing episodes are unaffected: all current drafts compile to their committed manifests byte for byte.

## Examples

The three golden shots the renderer is built against (#72) live in [`test/fixtures/geo-georgia-shots.json`](../test/fixtures/geo-georgia-shots.json):

1. **`fly-to-georgia`**: world → Caucasus → Georgia, with Georgia filling in on arrival.
2. **`georgia-border`**: Georgia's border traces itself, then the label `GEORGIA` appears.
3. **`between-two-seas`**: a Caucasus framing with the Black Sea and Caspian Sea labelled, and arrows from each sea to Georgia.
