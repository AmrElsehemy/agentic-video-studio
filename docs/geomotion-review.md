# GeoMotion: human review before publishing

Automated checks prove a map episode is internally consistent. They don't prove it is right. `npm run preflight:publish -- <id>` stays red until a person has worked through this list and recorded the outcome in the draft's `rights` (then recompiled). Passing CI or the video critic is **not** publication approval.

## What the automation already checks

| Check | Where |
|---|---|
| Every place id exists in the pinned map data | compiler (`scripts/lib/geo-primitives.mjs`) |
| Coordinates, boxes and keyframe timing are valid | primitive schema |
| Map data is credited (`map-data` rights entry; the credit line reaches the description) | compiler, `preflight:publish` |
| Map shots still look like their golden frames (blank or misframed maps fail) | `npm run geo:golden`, CI `geo-golden` job |
| Text isn't drawn twice, frames aren't blank or repeated, the cover shows the hook | video critic |
| Places with disputed borders or names have a recorded human decision | `preflight:publish` (`rights.bordersReview`) |

## The checklist (a person, on a phone)

**Cartography**
- [ ] Each highlighted place is the right one, and its outline is recognisable at phone size.
- [ ] Borders of flagged places (`review` in `public/geo/entities.json`) are shown in a way you can defend. Record it in `rights.bordersReview` as `{reviewer, date, decision}`.
  - For Georgia, the map shows its internationally recognised borders, which include Abkhazia and South Ossetia.
- [ ] Place names and labels are the ones you intend; no label covers the thing it names.
- [ ] Approximate points (e.g. "DIG SITES (APPROX.)") say so on screen and in the research file.

**Facts**
- [ ] Every narrated or on-screen fact traces to a claim in `research/<show>/<id>.json` with a working source.
- [ ] Claims are no stronger than their sources. "Earliest" is attributed to the study that says it; "between two seas" isn't turned into "borders both".
- [ ] Dates and numbers match the sources exactly.

**Craft**
- [ ] Play the MP4 on a phone: the narration is in sync, music ducks under it, and nothing sits under the platform's UI.
- [ ] The cover reads at thumbnail size.

**Release**
- [ ] Every rights asset is `owned`, `licensed` or `public-domain` and approved.
- [ ] Set `rights.releaseStatus` to `cleared` and `rights.publicReleaseApproved` to `true`, recompile, and run `npm run preflight:publish -- <id>`.
