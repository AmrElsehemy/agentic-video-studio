# Geographica batch 4: ten storylines (drafted, directed, compiled; not voiced or rendered)

Plan and reasoning: [storylines-batch-4-plan.md](storylines-batch-4-plan.md). Every number on screen traces to a research claim (World Bank table or a pinned Wikipedia revision). Silent previews have not been rendered yet.

| # | Episode | Pattern | Look | Opening / ending | Signature visuals |
|---|---|---|---|---|---|
| 1 | baarle-border | mystery | light | bleed | street plan with the municipality outline (OSM), Benelux map, timeline |
| 2 | northwest-angle | mystery | atlas | loop | 49°N line, Lake of the Woods, treaty timeline, wipe |
| 3 | llivia-exclave | profile | terrain |  | street plan with the municipality outline (OSM), flags, timeline |
| 4 | quadripoint-africa | mystery | classic dark | loop, tilt | tight Kazungula maps with one marker, flags, flash cut |
| 5 | cabinda-exclave | transformation | neon | bleed, tilt | zoom on Cabinda, big numbers (700,000 bbl/day, 903,370 people), wipe |
| 6 | china-one-time-zone | comparison | atlas | loop | globe, Xinjiang and Beijing clocks, Wakhjir Pass, wipe |
| 7 | shrinking-countries | transformation | light | bleed | three Baltic population lines, Japan line with verified PEAK 2010, zoom |
| 8 | aleutians-east-west | mechanic | neon | loop | globe, 180th meridian line, 15.6 km ring at the island, flash |
| 9 | vietnam-china-forty-fold | transformation | classic dark |  | world shaded by GDP per person 1990 to 2022 (current US$), wipe |
| 10 | aral-sea-gone | transformation | terrain | bleed | NASA satellite photos (1989 and 2008 side by side, 2009, 2021), same-area circles (68,000 and 10%), rivers, timeline |

Patterns: 4 transformation, 3 mystery, 1 profile, 1 comparison, 1 mechanic. Looks: 2 each of light, atlas, terrain, classic dark and neon.

## Fixed in review (things the director got wrong)

- Baarle: the director drew no town at all; the street plans (with each municipality's own outline) were added by hand, and a map that filled all of Belgium for "22 pieces" was replaced.
- Cabinda: the director highlighted all of Angola for 7,290 km²; the scenes now zoom on Cabinda. There is no Cabinda region in the map data.
- Aleutians: the director anchored "Semisopochnoi" to Alaska's centre and drew a 15.6 km ring there; markers now sit at the island's coordinates (Wikipedia).
- Quadripoint: two markers hundreds of kilometres apart for tripoints 100 to 150 metres apart; now one marker at Kazungula.
- Aral Sea: Natural Earth's lake outlines are today's remnants, so the old areas (68,000 km², 10%) are drawn as same-area circles and labelled as such. After review ("Aral Sea sucks") the hook, the 10% scene and the 2014 scene now show NASA's public-domain satellite photos (Wikimedia Commons), which show the real shrinkage.
- shrinking-countries: a bar layer with Natural Earth population figures (not the World Bank's) was removed; the Baltic chart starts at 1990 on a zero axis.
- china-one-time-zone: an irrelevant area comparison with Afghanistan was removed.

## Before any of them goes public

- **Borders reviews** (a person records how each is shown): quadripoint-africa (the four-country point is not legally settled), cabinda-exclave (status disputed), china-one-time-zone (Xinjiang, Wakhjir Pass near the disputed border), baarle-border and llivia-exclave (exclave outlines from OpenStreetMap), northwest-angle.
- **Claims to re-check at release:** aleutians-east-west ("easternmost" is by longitude only); shrinking-countries (2024 figures are estimates the World Bank may revise; Ukraine's reflect the war); vietnam-china-forty-fold (current US dollars, not inflation-adjusted, said on screen).
- OpenStreetMap credit is added by the compiler for the street plans.
- Voice (`npm run voice:elevenlabs -- <id>`), render, then watch with sound.
