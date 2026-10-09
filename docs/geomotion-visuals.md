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

## Projections

A shot's `projection` (`src/video/geo/projections.ts`) chooses how the sphere is flattened. The camera still thinks in Mercator views, and `makeProjection` turns the same view into any of these, so every framing carries over.

| Projection | Use it for |
|---|---|
| `mercator` (default) | Low latitudes (within 30° of the equator), lines of longitude and routes that should look straight. Inflates the high latitudes |
| `albers` | Mid and high latitudes (30° to 75°): a conic equal-area map where the USA, Canada, Russia and Kazakhstan keep their true size and shape, and the 49th parallel curves as it does in an atlas |
| `azimuthal` | Polar views and views around a place, distances true from the centre (a base for distance rings) |
| `equal-earth` | Whole-world views where areas must be true. At regional zoom the edge of the world shows, so the director never picks it automatically |

An episode uses one projection so the camera flows between scenes (the globe opening and closing keep theirs). The director chooses it from where the subject sits (`chooseProjection`): Mercator up to 30° from the equator, Albers up to 75°, azimuthal beyond. A draft can say `"projection": "mercator" | "albers" | "azimuthal" | "equal-earth" | "auto"` to override. `npm run geo:projection -- <id>... [--write]` applies the rule to a draft that is already directed, without asking the model again; compile afterwards. Shaded relief is Mercator-only (its images are stored in Web Mercator), so conic and azimuthal maps are drawn without it.

`npm run looks -- <episode> --projection=albers` previews any episode in a projection.

## True-size comparisons

`{"type": "truesize", "entity": "admin1:USA-3563", "onto": "country:USA"}` slides a copy of one place across the map onto another to show how big it is. The copy is rotated on the sphere (`scripts/lib/true-size.mjs`), so its area and shape are exactly true, and it is kept north-up. The place's real position stays on the map as a dashed outline, and a chip says "<PLACE> · SAME SIZE, MOVED", so the viewer is told it moved.

It is only honest in an equal-area projection, so the schema refuses it unless the shot's projection is `albers` or `equal-earth` (and not a globe); the director sets Albers for an episode that uses one, even near the equator. The moving place is an outline-bearing one (country, state or lake); it can land on a country, state, lake or city. The director frames both where the place is and where it lands, and does not also highlight or label the place that is moving. This is the second documented exception to "never move a place", beside plate reconstructions.

## Distance rings

`{"type": "ring", "center": "country:GIB", "radiusKm": 14.2, "text": "14.2 KM"}` draws a true circle of that radius around a place or a named point, growing out from the centre and drawn on the sphere (`geoCircle`), so it is correct in any projection (roundest in azimuthal). Its text sits on the east edge, and is left off while the ring is under about 34 px on screen, so a label never floats over nothing.

The radius is a claim, so the director only draws a ring with a figure the research states. Narration rounds ("14 kilometres" for 14.2), so the check also accepts the whole-number rounding of a research figure. The director frames the whole ring and at most two are drawn in a scene. It suits distances from a place and two shores a short way apart (a ring from one shore that reaches the other).

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

A shot's `data` takes a `view`: `map` (shade the places), `bars` (a ranked bar chart beside the map, the subject lit and the other bars muted, the compared countries tinted on the map to match), `both`, or `bubbles` (a circle on each place, its area in proportion to its value, the subject lit; the dataset's name sits along the top). Bubbles suit places spread across the map, where you want the comparison to sit on the geography; a label on a place that already has a bubble is left off, since the bubble names and values it. The map slides up as the chart slides in, and the numbers count up row by row. The chart shows the five longest bars and always keeps the subject.

## The globe

`"globe": true` on a shot draws the map on a globe (an orthographic projection) in space, with stars, an atmosphere glow and limb shading, and spins it between the camera's framings. Every other layer works on it. A globe is only for the first and last map scene; where the projection changes, the map cuts.

## Animation

All effects are pure functions of the frame: a ripple ring where a place lights up, a flash on its fill, dashes marching along an outline, numbers in a label counting up (years and words like "18TH" are left alone), springs on labels and markers. See `src/video/geo/effects.ts`.

## Sound

Map scenes get their own cues on top of the scene-change cue (`scripts/lib/sound-design.mjs`, `planMapSoundEvents`): a swell when a place lights up, a hiss while an outline traces, a pop for a label or marker, a tick for an arrow, ticks along a followed route, a rising arpeggio for a data layer, a sweep for a camera that changes target. Cues are thinned to 0.14 s apart and capped at six per scene, and they move with a scene that narration stretched.

## Checks

- **map-variety** is a release blocker: a map episode where fewer than 60% of consecutive scenes change, or fewer than half the scenes show a distinct view, is not cleared for public release.
- The director also fixes, in up to two repair rounds: rejected shots, a camera the renderer would collapse, a world view anywhere but the first and last scene, and places a scene names but its shot doesn't show.
