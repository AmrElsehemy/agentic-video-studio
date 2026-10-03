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
  // Up to 4 labels, markers, arrows or routes, anchored to a place id or a {lon, lat} point.
  "annotations": [
    {"type": "label", "anchor": "water:black-sea", "text": "BLACK SEA", "at": 0.15},
    {"type": "marker", "anchor": {"lon": 44.79, "lat": 41.72}, "text": "TBILISI", "at": 0.3, "until": 0.9},
    {"type": "arrow", "from": "water:caspian-sea", "to": "country:GEO", "at": 0.6},
    {"type": "route", "path": [{"lon": 44.79, "lat": 41.72}, "country:ARM"], "text": "TO YEREVAN", "at": 0.2, "until": 0.8, "marker": true, "follow": false}
  ],
  "dataset": "natural-earth",                                       // the pinned map data (default)
  "cut": true,                                                      // optional: start this scene's camera fresh (see Continuity)
  "relief": true,                                                   // optional: shaded relief under the map (#91)
  "data": {"label": "LOWEST POINT", "unit": "m", "at": 0.3,          // optional: a data map (#91)
           "values": [{"entity": "country:LSO", "value": 1400}, {"entity": "country:BWA", "value": 513}]}
}
```

| Field | Rules |
|---|---|
| Places | Registry ids from `public/geo/entities.json` (`country:<ADM0_A3>`, `water:<slug>`) or `public/geo/disputed.geojson` (`disputed:…`). Outlines always come from the map data; a draft can never contain hand-drawn polygons. |
| Points | `{lon, lat}` within ±180 / ±90. Use them only for things the registry doesn't have, such as a city marker. |
| Boxes | `[west, south, east, north]`. South must be below north. West greater than east means the box crosses the antimeridian. |
| Time | `at` is a fraction of the scene (0 = start, 1 = end), so the choreography follows the narration's timing. Camera keyframes must start at 0 and move forward. |
| Camera | `padding` (0-0.4, default 0.15) is the margin around the target, as a share of each side (0.5 would leave no room for the place). `ease` is `in-out` (default) or `linear`. |
| Text | Labels are at most 28 characters. They are the only on-screen words, so they are the only part the fact checks read. Place names come from the map data. |
| Routes | `path` is 2-6 stops (place ids or points). The line between them follows great circles, the shortest way across the globe, computed by the renderer (`src/video/geo/route.ts`). It draws itself from `at` to `until` (default: half a scene after `at`), easing at both ends, with a marker at its head and a dot on each stop it has reached. It crosses the antimeridian the short way. Routes draw underneath labels and markers. |
| Follow | `follow: true` moves the camera's centre onto the route's marker while the route draws. The camera keyframes still set the zoom. The camera eases on over 10% of the scene and back to the keyframes over 15% after the route ends. A followed route must end by 0.85, so the scene ends exactly on its keyframes and a continuing scene picks up without a jump. Only one route per shot can be followed. |
| Label placement | Every label (and marker and route text) stays whole inside the frame, 48 px from each edge, measured by its text; a label whose place is near the edge slides inward. Where two labels overlap, the older one (lower `at`) moves aside, up if its place is north of the other's and down if south, easing as the overlap grows; if it still overlaps (at the frame's edge, say) it fades, as fast as the newer one appears. A route's moving label gives way to every other label, and the data legend wins over all of them. Everything is continuous in the camera, so nothing pops between frames (`src/video/geo/labels.ts`). |
| Until | A label or marker can take `until`: it fades out over 12 frames, ending then. Use it before a pull-out that would crowd it. `until` must be after `at`. |
| On the beat | When a render is prepared, every map time (camera arrivals, highlights, labels, markers, routes and the data map, but never a scene's start or end) moves to the nearest beat of the episode's music bed, on a whole frame (`scripts/lib/beats.mjs`, #87). Snapping waits for narration timing, which can change scene lengths, so it lines up with what is heard. A time moves at most half a beat; it takes the other neighbouring beat when the nearest one would break an ordering rule (camera keys in order, `until` after `at`, a followed route done by 0.85), and stays put when neither fits. Shows without map scenes are unchanged. |
| Data | `data` shades each listed place in the accent colour, faint at the lowest value and strong at the highest, under the highlights, from `at` on. A legend (`legend: false` hides it) shows the label, the ramp, and the lowest and highest values (`0 M`, `1,400 M`). 2-250 places (every country fits), each a map id; research datasets have the same bounds. The values come from a research dataset through the director, never from the model, and count as the primitive's numbers for the fact checks. |
| Relief | `relief: true` blends shaded relief (mountains and valleys) over the land and highlights. Labels, markers and routes stay on top, crisp. Between continuing map scenes it fades in or out over 18 frames when only one of them has it. Images and their source are described in [geomotion-data.md](geomotion-data.md#shaded-relief-91). |
| Defaults | `highlights: []`, `annotations: []`, `dataset: "natural-earth"`, highlight `style: "fill"`, `at: 0`, route `marker: true`, `follow: false`. |

## What is checked, and where

- **Schema** (`scripts/primitive-schema.mjs`, shared by drafts, the compiler and the renderer): shapes, ranges, keyframe order, and unknown fields.
- **Compiler** (`scripts/lib/geo-primitives.mjs`): every place id must exist in the pinned map data, route stops included. Otherwise compilation fails, listing each unknown id with where it's used and the nearest real ids (*`camera[0].target: unknown geo entity "country:GEORGIA"; did you mean country:GEO (Georgia)?`*). A map never renders empty.
- **Camera** (`test/geo-episodes.test.ts`, part of `npm test`): every map scene in the catalog and the golden fixture is run through the renderer's own camera maths (`cameraKeys`/`cameraAt` in `src/video/geo/camera.ts`). A view that collapses (a blank map) or zooms far past the world framing fails. So does a target framed at under 20% of the frame. No render is needed.
- **Rights:** an episode with a map scene gets one `map-data` rights entry crediting Natural Earth (`public-domain`, with the attribution line). `preflight:publish` accepts `public-domain` assets.
- **Visual Director:** map shots are chosen by the Geo Visual Director from resolved places and researched points, never raw coordinates ([docs/geomotion-director.md](geomotion-director.md)). The PokePulses Visual Director doesn't offer `geo-map`.

Existing episodes are unaffected: all current drafts compile to their committed manifests byte for byte.

## Continuity (#85)

Consecutive map scenes are one unbroken flight, by default:
- **Camera:** a map scene that follows another starts its camera at the previous scene's last view. It reaches its own first framing by 35% of the scene, or halfway to its next keyframe if that comes sooner.
- **Scene change:** the map and backdrop stay on screen. Only the headline, caption and the outgoing scene's highlights and labels fade out, over its last 8 frames.
- **Opting out:** set `"cut": true` on a scene to start its camera fresh, with the usual fade between scenes.
- **Where it applies:** scenes without a map, and scene changes into or out of one, are unchanged (PokePulses has no map scenes).

`npm run review:visual` shows eight moments around every change between map scenes ("Scene changes" strips), before and after.

## Renderer (#72)

`src/video/geo/` draws the primitive inside the scene's visual area (1010×1375 px, between headline and caption):
- **Camera:** Web Mercator views fitted to each target, interpolated the short way round the globe with geometric zoom. `"world"` fills the frame's height, centred on the first place the camera visits.
- **Data:** loaded once from the bundle's `public/geo/` files. The render waits for it, with no network and no tiles.
- **Map:** land is every country (the palette's surface colour) on a water background.
- **Highlights:** fill with a glow, outline, or a self-drawing border trace. Disputed areas get hatching.
- **Annotations:** labels have a halo and are kept 48 px inside the frame. Markers pulse. Arrows arc upward (away from the caption), start clear of any label on their anchor, and stop short of their target.

Golden frames: `npm run geo:golden` renders every fixture shot at its start, middle and end through the real scene layout, and compares them with `test/golden/geo/` by SSIM.
- Default threshold 0.97: catches a blank or wrongly framed map while tolerating font anti-aliasing differences between machines.
- `--strict` (0.995): also catches a moved label or arrow.
- `--update`: replaces the committed frames after you have reviewed them.

CI runs the check (and uploads the frames) whenever map code, map data, the primitive contract or the scene layout changes.

## Examples

The golden shots the renderer is built against (#72) live in [`test/fixtures/geo-georgia-shots.json`](../test/fixtures/geo-georgia-shots.json):

1. **`fly-to-georgia`**: world → Caucasus → Georgia, with Georgia filling in on arrival.
2. **`georgia-border`**: Georgia's border traces itself, then the label `GEORGIA` appears.
3. **`between-two-seas`**: a Caucasus framing with the Black Sea and Caspian Sea labelled, and arrows from each sea to Georgia.
4. **`fiji-antimeridian`**: Fiji, which crosses the ±180° meridian, framed and filled whole, with a route to Samoa across the 180° line.
5. **`silk-road`** (#90): Xi'an → Samarkand → Constantinople. The camera rides along with the marker, then pulls out to the whole road.
6. **`lesotho-relief`** (#91): southern Africa with relief, pushing in to Lesotho's outlined highlands. It fills the stand-in episode's hook scene, so `fly-to-georgia` carries `cut: true` to keep its own start.
7. **`lowest-points-data`** (#91): southern Africa shaded by each country's lowest point (Lesotho 1,400 m, Botswana 513 m … sea level), with the legend. It is the first shot in the second stand-in episode (`scripts/geo-golden.mjs` fills one stand-in after another, so new shots never move old ones).
