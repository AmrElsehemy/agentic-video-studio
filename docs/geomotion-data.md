# GeoMotion map data: decision record

Status: accepted for GeoMotion v1 (#70, part of #69).

GeoMotion renders geography shorts (first show: Geographica; first episode: Georgia) from the same data-driven pipeline as PokePulses. This record fixes what map data we use, under which license, in which projection, and how the assets are pinned so every render is deterministic and offline.

## Decisions

| Question | Decision |
|---|---|
| Boundary data | **Natural Earth v5.1.2**, 1:50m Admin 0 countries |
| Water | Natural Earth 1:50m marine polygons (seas, oceans, gulfs…), with names and label data |
| Disputed areas | Natural Earth 1:50m breakaway/disputed areas, kept as a **separate layer** |
| License | Public domain. No permission needed; we credit it anyway |
| Base map | Styled vector land and water drawn from these layers. No raster tiles or satellite imagery |
| Relief (#91) | Optional shaded relief from Natural Earth's 1:10m **SR_HR** raster (public domain), reprojected to Web Mercator and pinned in `public/geo/relief/` |
| Projection | **Web Mercator** (`d3-geo` `geoMercator`), rotated so the framed region is centred |
| Precision | Countries rounded to 3 decimals (about 110 m); water to 2 decimals (about 1.1 km) |
| Storage | Slim, pinned copies committed in `public/geo/`, with SHA-256 checksums in `public/geo/manifest.json` |
| Network at render time | None. The renderer reads only `public/geo/` |

## Why Natural Earth

| Option | License | Verdict |
|---|---|---|
| **Natural Earth** | Public domain | ✓ Chosen. Stable country codes (`ADM0_A3`), Wikidata ids, label points, a separate disputed-areas layer, and versioned releases |
| OpenStreetMap | ODbL (attribution and share-alike) | Overkill for country-level shots; share-alike obligations on derived data |
| GADM | Non-commercial only | ✗ Excluded: a monetised channel is commercial use |
| Mapbox / MapTiler tiles | Paid, API key, per-request terms | ✗ Runtime network calls and per-video cost; terms restrict offline caching |
| Satellite imagery (e.g. NASA Blue Marble, public domain) | Varies | Deferred. Can be added later as a licensed, pinned raster base under its own entry here |

## License and attribution

| Asset | Source and version | License | Obligation | What we do |
|---|---|---|---|---|
| `public/geo/countries.geojson` | Natural Earth v5.1.2, `ne_50m_admin_0_countries` | Public domain | None | Credit in the episode description |
| `public/geo/water.geojson` | Natural Earth v5.1.2, `ne_50m_geography_marine_polys` | Public domain | None | Credit in the episode description |
| `public/geo/disputed.geojson` | Natural Earth v5.1.2, `ne_50m_admin_0_breakaway_disputed_areas` | Public domain | None | Credit in the episode description; editorial review (below) |
| `public/geo/relief/*.jpg` | Natural Earth `SR_HR` 2.0.0 (1:10m shaded relief, 1 arc-minute), zip SHA-256 `b2619fff…41a5` | Public domain | None | Same Natural Earth credit line |

Credit line: *Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.* It is stored in `manifest.json` (`source.attribution`) so the description generator can include it (#73/#75).

Map geometry is **not** a source for facts. Narrated claims (history, wine, populations…) need their own citations in the episode's research file and go through the Fact Verifier as usual.

## Projection

Web Mercator, from `d3-geo`, for three reasons:
- **Shapes stay true.** Mercator is conformal, so a highlighted country has its familiar outline at the zoom levels we use most (region → country).
- **Fly-tos are simple and deterministic.** A camera move is an interpolation of scale and centre in a single fixed projection, a pure function of the frame number.
- **It's the familiar look** of the map reels the show is modelled on.

Known costs and how we handle them:
- **High latitudes are inflated in world framings.** World-scale shots clip latitude to about −58°…84° and start from a regional frame whenever possible.
- **Very small places.** At 3 decimals, a country narrower than about 20 km looks blocky at 1080 px. Microstates would need Natural Earth 1:10m for that entity, added deliberately.

A 3D globe (orthographic) and other projections are out of scope for v1.

## Antimeridian

A country or sea that crosses the ±180° meridian (Russia, the USA, Fiji…) has its bounding box stored the GeoJSON way, **west > east** (Fiji: `[174.587, -21.706, -178.251, -12.477]`), and is marked `crossesAntimeridian: true` in the entity registry. The renderer (#72) frames such a shape by rotating the projection so the frame's centre sits at longitude 0 (`geoMercator().rotate([-centreLon, 0])`), so it is never split across the map edge. #72 includes a Fiji framing test. Georgia and the Caucasus don't cross it.

## Disputed borders and names

- Countries are drawn from Natural Earth's default *de facto* Admin 0 layer. For Georgia, that polygon includes Abkhazia and South Ossetia.
- Breakaway and disputed areas are a **separate layer**, never merged silently. Each keeps Natural Earth's note (for example *"Self admin.; Claimed by Georgia"*).
- Every country that administers or claims a disputed area carries a `review` list in `entities.json`. Currently 21 countries are flagged, among them Georgia, Azerbaijan, Russia, Ukraine, India, China, Pakistan, Israel, Morocco and Cyprus.
- **Editorial rule:** an episode that highlights, labels or traces a flagged country needs a person to sign off on how its borders and names are shown before publishing. The options are the default view, hatching the disputed areas, or a Natural Earth point-of-view variant. The pipeline records this; it never decides it silently. Enforcing this rule in publish preflight is part of #75.
- Names are Natural Earth's English names. Alternative or local names are an editorial choice per episode, not a data change.

## Entity registry

`public/geo/entities.json` lists every country and named body of water. The Visual Director (#74) refers to these ids and never to raw coordinates.

| Field | Example |
|---|---|
| `id` | `country:GEO`, `water:black-sea`; disputed areas use `disputed:abkhazia-B35` |
| `kind` | `country`, `sea`, `ocean`, `gulf`, `bay`, `strait`… |
| `name`, `iso3`, `wikidata` | `Georgia`, `GEO`, `Q230` |
| `bbox` | `[west, south, east, north]` in degrees |
| `label` | Natural Earth's label point (countries) |
| `frame` | The box a camera frames when it differs from `bbox`. It covers the largest part plus any part at least 20% of its size, so South Africa's Prince Edward Islands or French Guiana don't shrink the country to a speck |
| `review` | Disputed areas that concern this country |

The Georgia fixture covers: `country:GEO` `[39.978, 41.07, 46.673, 43.57]`, `country:ARM`, `country:AZE`, `country:TUR`, `country:RUS`, `water:black-sea` `[27.48, 40.92, 41.76, 47.21]` and `water:caspian-sea` `[46.71, 36.61, 54.02, 47.11]`. `test/geo-data.test.ts` checks it.

## Workflow

```bash
npm run geo:prepare                 # download the pinned layers, check their SHA-256, write public/geo/
npm run geo:prepare -- --from=dir   # same, from already-downloaded .geojson files
npm run geo:verify                  # check public/geo/ against manifest.json (runs in CI, no network)
```

- `prepare` refuses a download whose checksum differs from the pinned one. Its output is byte-for-byte reproducible: sorted features, fixed rounding, no timestamps.
- **Commit `public/geo/`.** Renders and CI never download map data.
- **To update Natural Earth:**
  1. Change `version`, `baseUrl` and the checksums in `NATURAL_EARTH` (`scripts/lib/geo-data.mjs`).
  2. Run `geo:prepare`.
  3. Review the diff, including changes to the `review` flags.
  4. Update this record.

## Out of scope for v1

3D globe, satellite or raster tiles, animated routes, heatmaps, sub-national (Admin 1) boundaries, and point-of-view border variants. Each can be added later as a pinned layer with its own row in the license table.

## Shaded relief (#91)

`npm run geo:relief` builds the relief images from Natural Earth's `SR_HR` raster:
- **Source:** the raster (21600 × 10800, one pixel per arc-minute, plate carrée) is downloaded once into `.cache/geo/` (git-ignored). The build refuses to run unless the zip matches the pinned SHA-256 in `scripts/lib/geo-relief.mjs`.
- **Reprojection:** each image is cropped (the global one is also averaged down to 4 arc-minutes) and its rows are reprojected to Web Mercator. Only latitudes stretch; longitude is already linear. Each image is stored with its box, so the renderer places it exactly where the map's projection puts that box.
- **Neutral flat ground:** flat ground and sea (grey 206 in the source) become neutral grey 128, with slopes scaled ×1.6 around it. Blended with `soft-light`, flat areas are unchanged and only terrain shows.
- **Images:** `world` (−180…180°, −60…80°, 4′), plus full-detail `southern-africa` (14…36°E, 36…20°S) and `caucasus` (34…54°E, 36…48°N), 1.7 MB in all. Add a region to `RELIEF.images` when an episode zooms somewhere new.
- **Rendering:** coarser images are drawn first and finer ones on top. An image enlarged past 32,768 px wide is skipped.
- **Checking:** `public/geo/relief/manifest.json` records each file's checksum, and `npm run geo:verify` checks them along with the vector data.
