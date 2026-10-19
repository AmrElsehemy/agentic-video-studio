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

### Projection morph

`"morph": true` on a shot makes the map flow from Mercator to Equal Earth during the scene (`makeMorphProjection`: every point is the blend of where the two put it). It holds still for the first fifth of the scene, flows, and settles for the last fifth, so places that Mercator inflates (Greenland, Russia, Canada, Antarctica) shrink to their true size on screen. A chip says what the map is doing: "MERCATOR · SIZES STRETCHED", then "EQUAL EARTH · SIZES TRUE". It is for a wide camera and a scene that says a place is bigger or smaller than it looks; the director keeps at most one per episode, never with a globe, relief or a true-size comparison, and the map cuts in and out of it when the episode uses another projection. `npm run looks -- <episode> --morph=2 --at=0.15,0.5,0.9` previews it.

## Distance from the sea

`"coastDistance": true` on a shot (in the manifest, `"surface": {"kind": "coast-distance", "at": 0.15}`) shades the land by how far it is from the sea: bands at 250, 500, 1000, 1500 and 2000 km that creep inland from the coast one after another, in a lilac-to-indigo ramp that no look's land or sea shares, with a key ("KM FROM THE SEA"). It suits landlocked countries, "farthest from any ocean", steppes and heartlands; the director uses it at most once an episode and never on a globe.

The data is worked out from the pinned Natural Earth country outlines, with nothing downloaded (`npm run coast:prepare` writes `public/geo/coast-distance.json`; `npm run coast:verify` checks it was made from the outlines in `public/geo/`). The world is laid on a quarter-degree grid, each cell sea or land, and each land cell takes its great-circle distance to the nearest sea cell, good to under 30 km, which is why the bands start at 250 km. "Sea" is the open ocean and the seas that join it; water that does not (the Caspian, the Aral Sea, large lakes) counts as land, and gulfs and estuaries such as the Gulf of Ob count as sea. The shot draws bands, not figures: say a distance only if the research gives one.

## Elevation and sea-level rise

Two more surfaces, from NOAA's ETOPO 2022 60 arc-second model (public domain, credited in `public/geo/elevation.json`), sampled every 0.05 degrees (about 5.5 km). `npm run elevation:prepare` downloads it from NOAA's OPeNDAP server (a few minutes), refuses a grid whose checksum is not the pinned one, and writes `public/geo/elevation.json` (8 MB, loaded only by shots that use it); `npm run elevation:verify` checks the file without the network.

- `"elevation": true` (manifest `"surface": {"kind": "elevation", "at": 0.15}`) shades the land by height above the sea in bands at 200, 500, 1000, 2000, 3000, 4000 and 5000 m (greens, tans, browns, snow), with a key. For highlands, basins, plateaus and mountain walls; not together with `relief`.
- `"floodRise": 10` (manifest `"surface": {"kind": "flood", "at": 0.15, "rise": 10}`; the rise is one of 1, 2, 5, 10, 20, 50 m) floods the land a rise of that many metres in the sea would cover, level by level in deepening blues, with a count in the key and the note "LEVEL ALONE · NO DEFENCES · APPROXIMATE". It is a bathtub: height alone decides, and only land that the open sea can reach by a path of cells at or below the new level floods, so the Dead Sea basin, below sea level but walled off, stays dry. The rise is a claim, so the director may only use one the research states (it is checked), and it should not claim a population or a date from the picture. At 5.5 km a grid cell is too coarse for small islands (the Maldives are not there at all), so use it for coasts, deltas and plains: the Nile delta, the Netherlands, Bangladesh.

A surface is drawn above the highlights, clipped to the land. One surface (distance, elevation or flood) per shot, and the director uses at most one per episode.

## Street maps

`"streets": "vatican-city"` on a shot draws a street plan of a city: roads to scale (a motorway is drawn about 20 m wide, an alley 3 m, never thinner than a hairline), buildings, water, coast, rails and rivers, on a plain ground in the look's light or dark colours, with "© OPENSTREETMAP CONTRIBUTORS" on screen. Roads grow in major first, then buildings. The 1:10m country outlines are too coarse to sit under a street plan, so the map is replaced, not overlaid. The system frames the city itself (`streetCamera`: a push in from nearly all of the data to two thirds of it, so the view never runs off the data; `geoProblems` rejects a camera that does). A street shot cannot also be a globe, a morph, relief, a surface or a data layer; labels, markers and arrows work as on any map. The director uses at most one per episode, on the scene about the city itself.

The data is OpenStreetMap (© OpenStreetMap contributors, ODbL), fetched once from Overpass and kept in `public/geo/streets/<city>.json` with `index.json` (checksums). Cities are listed in `scripts/lib/streets-cities.json` (id, name, centre, radius in km; the box is TALL, 1.45, times as high as wide for portrait video); `npm run streets:prepare [city...]` fetches them (retrying the Overpass mirrors, which are often busy) and `npm run streets:verify` checks the files without the network. A radius over 2 km takes the main roads only, and one over 4 km no buildings, so a file stays about 1 to 3 MB. Using OpenStreetMap needs the credit in the episode's rights (the compiler adds it), and `publishBlockers` blocks release without it (`osm-credit`). `npm run looks -- <episode> --streets=2:vatican-city` previews a city in scene 2.

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

## Charts over time

A shot's `series` draws yearly figures for countries over a scene: `{indicator, view, places, from, to, at}`. The numbers are never typed by the model. They come from `public/geo/series.json`, pinned from the World Bank's World Development Indicators (CC BY 4.0) by `npm run series:prepare` and checked by `npm run series:verify`. Four indicators: `population`, `life-expectancy`, `fertility` (children per woman) and `gdp-per-person` (current US$), for about 215 countries from 1960 to the last year most countries have a figure for. A country the World Bank does not list (Taiwan, Kosovo) has no chart; a missing year breaks the line rather than being guessed.

| View | What it draws |
|---|---|
| `line` | 1 to 4 countries (`places`) as lines that draw themselves from `from` to `to`, a big year counter, the value and flag at each line's head. Heads that would overprint stack apart with a leader line |
| `race` | The six highest countries each year as bars; rows slide past one another as ranks change. `places` may name one country to light up (else the episode's subject) |

A line chart may set `axis: "fit"` to zoom the value axis to the data (to show a turning point; the ticks say what the axis spans, and the default `zero` keeps sizes honest) and `mark: {year, text}` for a dashed line and a short caption once the chart reaches that year.

The chart sits in a panel at the bottom and the map lifts to leave room, as for the bar chart; the two cannot share a scene, nor can a street map, a photo or a timeline strip. The year runs from `from` to `to` between the panel arriving and 90% of the scene, then holds. Rights get a World Bank credit automatically and the publish gate (`series-credit`) blocks an episode whose rights lack one; the chart also prints its source.

`npm run looks -- <episode> --scenes=2 --series=2:population:race:1960:2024:country:IND` (or `--series=2:life-expectancy:line:1960:2023:country:JPN,country:NGA`) renders stills to compare.

## The globe

`"globe": true` on a shot draws the map on a globe (an orthographic projection) in space, with stars, an atmosphere glow and limb shading, and spins it between the camera's framings. Every other layer works on it. A globe is only for the first and last map scene; where the projection changes, the map cuts.

## Animation

All effects are pure functions of the frame: a ripple ring where a place lights up, a flash on its fill, dashes marching along an outline, numbers in a label counting up (years and words like "18TH" are left alone), springs on labels and markers. See `src/video/geo/effects.ts`.

## Sound

Every map scene gets cues on top of the scene-change cue (`scripts/lib/sound-design.mjs`, `planMapSoundEvents`): a swell when a place lights up, a hiss while an outline traces, a pop for a label or marker, a tick for an arrow, ticks along a followed route, a rising arpeggio for a data layer, a sweep for a camera that changes target. Cues are thinned to 0.14 s apart and capped at six per scene, and they move with a scene that narration stretched.

### Scores and ambience

The music bed used to be one electro-pop loop for every episode. An episode now opts into a **score** (`"score"` in its draft, set on the manifest as `audio.bed.score`; `scripts/lib/score.mjs`), a stereo piece written for the mood and arranged for the story. Everything is synthesised, so there is nothing to license. Episodes without a score keep the old loop, so published episodes are unchanged.

| Score | Feel |
|---|---|
| `wonder` | Major add9 chords, bells, a light pulse; discovery |
| `epic` | Minor, big pads, half-time kicks and claps, chord stabs; scale and history |
| `tension` | Phrygian, a pulsing bass, sparse ticks; borders and disputes |
| `calm` | Slow arpeggios over maj7 pads, a shaker; places, lakes, space |
| `quirky` | Bouncy marimba-like plucks and bass; oddities |
| `pulse` | Four-on-the-floor electro, 16th plucks; systems and machines |

Layers join by each scene's intensity (`intensityOf`, from its beat): 0 pad, 1 adds bass and arpeggio, 2 adds drums, 3 (reveal, twist, payoff) adds everything and a bell phrase. A noise **riser** leads into a scene that comes in at 3 from a quieter one, so the reveal is felt before it lands. Chords change every two bars; a small stereo reverb sits on the pads, plucks and bells. The tempo is the score's, so beat-snapped map reveals follow it.

**Ambience** sits under a scene that has a place to hear: `sea`, `wind`, `city`, `jungle`, `desert`, `ice`, `space` (a map shot's `ambience`, which the director sets; absent, a street map is a city, a flood the sea, and elevation or distance-from-sea wind). Each kind is synthesised noise and event textures (waves breathing, gusts, passing cars, birdsong, insects), fading across scene edges, so consecutive scenes in one setting run on.

**Ducking:** the music and ambience drop by 6 dB while the narration speaks (from the narration's measured speech and pauses) and come back in its pauses.

## Flags

`"flags": true` on a map shot puts each country's flag beside it (`src/video/geo/Flags.tsx`, flag-icons, MIT): above its label, on its bar (the label shortens to fit), as a faint fill in a large bubble or a small badge over a small one, and, when a border is highlighted, a chip along the top naming both countries with their flags. A place with no flag of its own (Bir Tawil, buffer zones, Antarctic claims) gets none. `npm run flags:prepare` writes `public/flags/` from Natural Earth's codes, so a country only gets the flag of its own ISO code; `npm run flags:verify` checks the files. The compiler adds the flag-icons credit to an episode's rights when a shot uses flags. The director uses them on about a third of an episode's scenes, those about countries as countries. `npm run looks -- <episode> --flags=1` previews them.

## Checks

- **map-variety** is a release blocker: a map episode where fewer than 60% of consecutive scenes change, or fewer than half the scenes show a distinct view, is not cleared for public release.
- The director also fixes, in up to two repair rounds: rejected shots, a camera the renderer would collapse, a world view anywhere but the first and last scene, and places a scene names but its shot doesn't show.

## Opening and ending (`framing`)

Optional, per episode (draft field `framing`, copied into the manifest). Both are tagged (`opening-bleed`, `ending-loop`) so `npm run analytics -- compare <show>` can show whether they help.

- `opening: "bleed"`: the first scene's picture starts filling the whole frame and settles into its card over about a second as the headline lands. Default `card`: the picture is in its card from the first frame.
- `ending: "loop"`: the last 0.4 seconds dissolve into the first frame, so a Short that replays starts where it ended. Skipped when narration is still speaking then. Default `cut`.

Preview without changing an episode: `npm run looks -- <id> --scenes=1 --at=0.02,0.12 --framing=bleed,loop`.

### The director and charts

The geo director may add a `series` to a shot (a line chart or a ranked race). The model picks only the indicator, the countries and the years; the figures come from `public/geo/series.json`. Its prompt carries a digest of that table for the episode's countries (readings, highest and lowest years), so it chooses years that exist. Enforced in code, not just asked:

- the indicator, countries (country places only) and years must exist in the table, with a figure at both ends of a line;
- a mark's caption is derived (`PEAK 2021`, `LOW 1993` or the bare year), and a peak or low must be the first country's actual extreme in the chart's years;
- a zoomed axis (`axis: "fit"`) is honoured only with a verified peak or low mark; everything else starts at zero;
- at most 3 chart scenes an episode; never with a globe, morph or surface, photo, timeline, street map or bar view.

The reviewer pass reads a chart as "numbers over time" when it judges whether a picture shows its narration.

## Shaded maps, big numbers, transitions

- **`series.shade: true`** colours every country on screen by the chart's indicator in the year the chart is showing (purple low, gold high, key in the panel). One scale for the whole chart (2nd to 98th percentile, ends marked "+" or "or less"; money on a log scale), so a colour means the same in every frame. Life expectancy, fertility and GDP per person only: a population would only paint the big countries. Countries without a figure stay unshaded. Not with a data layer, surface or globe.
- **`figure: {value, unit, text, at}`** rolls one number up over the lower map. The director may only use a value the research states. Not with a chart over time, street map, bar view, photo or timeline.
- **Scene `transition: "wipe" | "zoom" | "flash"`** is how a scene arrives (a coloured edge sweeping across, a push in through a flash, a flash on a hard cut). Ignored on the first scene and across a continuing map. Preview: `npm run looks -- <id> --scenes=3 --at=0.03,0.07,0.11 --transition=3:wipe`.

- **`framing.depth: "tilt"`** leans every map back 6° (about 4% size gradient across the card). A tilt shrinks the far edge, so one map scene that compares sizes or shades a value (true-size copy, data layer, surface, chart over time, big number, street plan, morph, globe) switches it off for the whole episode.

### Full-frame photographs

A `photo` annotation with `"fill": true` covers the whole map panel instead of sitting on it as a card, for a scene about a place seen from above (satellite imagery) or a before and after. It pushes in slowly (10% over the scene); `"pan": [from, to]` moves the crop across the picture (the fractions of its width the crop is centred on at the start and the end), so a wide image or a side-by-side pair such as `aral-1989-2008` is seen in turn instead of cut off. The caption and credit are printed on it. Two full photos may follow each other in a scene (the second needs an `at`; they cross-fade). The map is not drawn, so the scene takes no highlights, labels, markers, globe, relief, chart, street plan, big number or data layer (the schema refuses them: a label on a picture would claim a position the photo cannot back); the camera is ignored. A full-frame photo turns the depth tilt off for the episode, is tagged `photo-full` for the compare command, and counts as a photo scene for the director's one-in-three limit. `npm run photos -- search <words>` finds public-domain images (NASA's satellite pictures are on Wikimedia Commons).

## Satellite imagery (NASA GIBS)

A `satellite` annotation fills the map panel with real satellite stills, by date. The stills are fetched once, stored in `public/satellite/` and never change, so a render needs no network.

```
npm run satellite -- layers
npm run satellite -- probe --layer=modis-terra --bbox=west,south,east,north --dates=2000-07-18,2000-08-05,... --out=sheet.png
npm run satellite -- add <set> --layer=modis-terra --bbox=west,south,east,north --dates=2000-07-18,2024-07-18 --caption="Rondônia, Brazil"
npm run satellite -- verify
```

- **Layers:** `modis-terra` and `viirs-snpp` (daily true colour, 250 m, from 2000 and 2015), `landsat-annual` (30 m, only 1983–85, 1988–90 and 1998–2000), `night-lights` (VIIRS Black Marble, annual from 2012), `blue-marble` (undated relief). A date may name its own layer (`landsat-annual:1990-12-01`) to compare sensors. NASA's HLS layer returns empty tiles over most places, so it is not offered.
- **Pick the date with `probe`.** A daily image can be cloud, smoke or a gap between swaths; the contact sheet lets you choose a clear day. Compare the same time of year across years, or the season changes more than the place does. An empty image is refused.
- **In a scene:** `{type: 'satellite', set, dates: [...], mode: 'fade' | 'swipe', marks: [{lon, lat, text}]}`. `fade` shows the dates one after another; `swipe` wipes between exactly two (the later image replaces the earlier from the right). The date is printed large on the picture (a year for annual layers, month and year for daily ones), with the NASA credit and the set's caption.
- **Marks are honest labels.** The still is Web Mercator over a known box, so a mark sits at its true position; a mark outside the box is refused at compile time. Nothing else may be on the picture: no highlights, labels, globe, chart or street plan.
- **Honest choices.** Pick places where the image really shows the change (a lake's open water, cleared forest, a city's footprint), not a seasonal marsh or a cloud. 250 m pixels are soft at phone size; keep the box to about 100 to 300 km.
- **Credit.** NASA imagery is free to use with acknowledgement. The compiler adds a rights entry naming NASA GIBS, the layers and the dates, which the upload description prints with the photo credits.
- **Tags:** `satellite`, `satellite-swipe`.

## Cartogram (population circles)

`series` with `view: 'cartogram'` redraws the world as circles whose **area** is the World Bank population of the year shown (a Dorling cartogram). The circles grow and shrink in place as the years run `from` to `to`, with the year in large type and "CIRCLE AREA = POPULATION" on the panel, so nobody has to guess what the size means.

```json
"series": {"indicator": "population", "view": "cartogram", "places": ["country:IND"], "from": 1960, "to": 2023, "top": 20}
```

- **Which countries:** the `top` biggest (6 to 30, default 20) in any year of the span. Each circle is labelled with its name and figure when large, its country code when medium, and nothing when tiny. `places[0]` (or the episode's subject) is lit.
- **Layout:** every circle starts at its country's position on an Equal Earth map fitted to the panel (stretched vertically to give them room) and is pushed apart until none overlap. The layout is computed from the largest size each circle reaches, so nothing jumps while the sizes change, and it is deterministic. The countries are drawn faintly behind in the same projection (without Antarctica).
- **Rules:** population only (a circle's area is a count of people); no shading, mark, globe, morph, surface, data layer or relief in the scene. Every figure comes from the pinned World Bank table, so it is sourced and credited like the other charts.
- **Good for:** "the world resized by people", India passing China, a country that has shrunk, how fast Africa grows. Tag: `chart-cartogram`.

## Day and night

A `daynight` annotation shades the night side of the Earth for a real UTC moment and sweeps it across the scene, so the terminator moves the way the sun does.

```json
{"type": "daynight", "date": "2024-12-21", "from": 16, "to": 26, "places": ["city:shanghai-chn", "city:urumqi-chn"]}
```

- **The sun is computed**, from the standard solar position formulas (well under a degree), not drawn by hand. The shading is the astronomical night side, with a lighter band for civil twilight; the sun's own point is marked.
- **A UTC clock** sits at the top of the panel ("22:07 UTC · 21 DEC"). The sweep runs from `from` to `to` hours of `date` (hours past 24 carry into the next day), eased, ending by 92% of the scene unless `until` says otherwise.
- **`places`** (up to 4 city, country or other entities) get a dot that is lit and says SUN UP while the sun is above the horizon there, and dark and DARK while it is not.
- **It knows nothing of clocks.** That is the point of the China story: Shanghai and Ürümqi share one official time but not one sun. The shading is not a time-zone map and must not be described as one.
- **Works** on flat maps and on the globe. Tag: `day-night`. Good for the date line, time zones, midnight sun and polar night, why Russia has 11 zones.
