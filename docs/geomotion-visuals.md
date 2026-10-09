# GeoMotion visuals: looks, layers, charts, globe, sound

How a Geographica map is painted and animated, beyond the pinned base map in [geomotion-data.md](geomotion-data.md) and the shot rules in [geomotion-director.md](geomotion-director.md).

## Looks

A look decides how map scenes are painted. It changes paint only: the camera, the data and every layer's timing are the same, so any episode can wear any look.

| Look | Feel | Palette variant |
|---|---|---|
| `classic` | The original flat map. Episodes already published use it | none |
| `atlas` | Bright teal sea, warm paper land, a coral slab. Friendly and clear | `atlas` |
| `neon` | Midnight blue, glowing grid, a hot pink-to-orange slab | `neon` |
| `terrain` | Deep greens, strong relief, a gold slab | `terrain` |

An episode asks for a look by naming the palette variant in its draft (`"paletteVariant": "atlas"`). The compiler sets the manifest's `look` from it and uses the show's colours for that variant (`shows/<show>.json`, `paletteVariants`). Without a variant the map is `classic`.

What a styled look adds: a tilted perspective stage with a vignette; a gradient sea with a graticule and a slow drifting light band; land that varies country to country (a country keeps its colour by a hash of its id); a soft shadow under the land; shaded relief under the land and sea; the highlighted place as a gradient slab with a rim light (water is flat, never lifted); label pills.

`npm run looks -- <episode> [--looks=...] [--scenes=1,3] [--globe=1,7]` renders stills of an episode in each look so they can be compared. The tokens are in `src/video/geo/look.ts`.

## Map layers

Natural Earth (public domain, pinned in `public/geo/manifest.json`) provides, besides the countries and seas:

| Layer | Source | Entity id | Notes |
|---|---|---|---|
| States and provinces | 1:50m admin-1 (Australia, Brazil, Canada, China, India, Indonesia, Russia, South Africa, the USA) | `admin1:<code>` (`admin1:USA-3563` is Alaska) | Thin lines appear when the camera is zoomed in |
| Lakes | 1:10m, rank 0-5 | `lake:<slug>` | Bigger lakes from far, more as the camera closes in |
| Rivers | 1:10m, rank 0-6, pieces of one river joined | `river:<slug>` | Highlighting a river traces its course |
| Cities | 1:10m populated places: every capital and every city of a million or more | `city:<name>-<country>` | Points: label, marker, arrow or camera target, never a highlight |

Names resolve with a specificity rule: a country beats a state, lake or river, which beat a city, so "Georgia" stays the country and "Panama" the country; two places of the same kind with one name are reported as ambiguous. A city or state is also found by a qualified name ("Cordoba, Argentina").

The director is offered, besides the research's own places, the rivers, lakes, states and cities **named in the scenes' text** and the important ones nearby. It is told which places each scene names and is asked to show every one (highlight, label, anchor or frame); a shot that doesn't gets another round with the reason.

## Comparison datasets and the bar chart

For two or more countries among an episode's places the director gets built-in datasets from the pinned data: **population** (Natural Earth's estimate), **area** (computed from the outlines) and **density**. Values are rounded to two or three significant figures and the chart says "Natural Earth, approximate". A research dataset with the same key replaces a built-in one.

A shot's `data` takes a `view`: `map` (shade the places), `bars` (a ranked bar chart beside the map, the subject lit and the other bars muted, the compared countries tinted on the map to match) or `both`. The map slides up as the chart slides in, and the numbers count up row by row. The chart shows the five longest bars and always keeps the subject.

## The globe

`"globe": true` on a shot draws the map on a globe (an orthographic projection) in space, with stars, an atmosphere glow and limb shading, and spins it between the camera's framings. Every other layer works on it. A globe is only for the first and last map scene; where the projection changes, the map cuts.

## Animation

All effects are pure functions of the frame: a ripple ring where a place lights up, a flash on its fill, dashes marching along an outline, numbers in a label counting up (years and words like "18TH" are left alone), springs on labels and markers. See `src/video/geo/effects.ts`.

## Sound

Map scenes get their own cues on top of the scene-change cue (`scripts/lib/sound-design.mjs`, `planMapSoundEvents`): a swell when a place lights up, a hiss while an outline traces, a pop for a label or marker, a tick for an arrow, ticks along a followed route, a rising arpeggio for a data layer, a sweep for a camera that changes target. Cues are thinned to 0.14 s apart and capped at six per scene, and they move with a scene that narration stretched.

## Checks

- **map-variety** is a release blocker: a map episode where fewer than 60% of consecutive scenes change, or fewer than half the scenes show a distinct view, is not cleared for public release.
- The director also fixes, in up to two repair rounds: rejected shots, a camera the renderer would collapse, a world view anywhere but the first and last scene, and places a scene names but its shot doesn't show.
