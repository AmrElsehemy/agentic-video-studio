# Geographica batch 6: plan (nothing drafted yet)

Batch 5 ends on 7 Nov 09:00Z, so these would take the slots from 7 Nov 21:00Z to 12 Nov 09:00Z. Nothing is researched, drafted, voiced or uploaded until you approve.

## What shapes the pick

- **Fine coastlines (GSHHG).** This batch is about coasts, islands and straits, the one subject where the sharper outline is the picture. Every episode frames at 14 degrees or closer, so all ten draw the fine coast and carry the GSHHG credit line.
- **Analytics (style guide, 30 Oct).** Mystery hooks ran 75 views a day against 191 for other openings, and transformation stories ran 131 against 81 for mystery. So: three transformations, one mystery only. `framing.ending: "loop"` ran 280 a day against 63 (six episodes), so most of these end on a loop. Photo scenes ran lower than map-only ones, so photos are used only where a map cannot show the thing.
- **Not a rule.** Six episodes is a small sample; these are things to try, and the next comparison will say whether they held.

## Proposed ten

| # | Episode | Pattern | Hook idea | Device | Data to fetch first |
|---|---|---|---|---|---|
| 1 | singapore-grows | transformation | A country that added a fifth to its own size, from the sea | satellite stills plus fine coast, land area by year | land area series (Singapore Department of Statistics or Wikipedia revision, pinned) |
| 2 | bahrain-grew | transformation | An island nation that kept growing without any land to take | fine coast, area over time | area figures, pinned |
| 3 | philippines-7641 | transformation | The islands were counted again, and 534 more turned up | counting ring, fine coast | 7,107 to 7,641 resurvey (NAMRIA), pinned |
| 4 | coastline-paradox | mechanic | Measure Britain with a shorter ruler and it gets longer | the ruler walked along the coast at four lengths | **computed from GSHHG itself**, and said to be |
| 5 | canada-longest-coast | comparison | One country has more coast than the next several together | fine coast, bar race | coastline lengths, pinned (CIA Factbook or Wikipedia revision) |
| 6 | adriatic-two-shores | comparison | Two coasts of one sea: one smooth, one shattered | fine coast, both shores | island counts, pinned; ratios computed from GSHHG |
| 7 | greece-six-thousand | profile | Over six thousand islands and only a couple of hundred lived on | counting ring, fine coast | island counts, pinned |
| 8 | seikan-tunnel | mechanic | A train tunnel under the sea between two islands | elevation profile (ETOPO) | tunnel length and depth, pinned |
| 9 | oresund-link | mechanic | A bridge that becomes a tunnel in the middle of the sea | elevation profile, fine coast | bridge and tunnel lengths, pinned |
| 10 | tierra-del-fuego-split | mystery | An island cut in two by a straight line | fine coast, borders | **borders review from you**; the Beagle Channel dispute is old and settled by treaty, but it is still a border |

Spread: 3 transformation, 4 mechanic or profile, 2 comparison, 1 mystery. Episodes 1, 2, 3, 7 and 8 end on a loop; photos only in 1 (a reclamation site) and 8 (tunnel portal), if licensed ones can be found.

## Rules that stay the same

- Every number on screen comes from a pinned research claim, or is computed from pinned data and said to be. The coastline paradox in episode 4 uses only lengths I measure from the pinned GSHHG outline, labelled as measured from this outline, not as official figures.
- Remembered figures are dropped unless the fetched page says them. Several above (534 more islands, a fifth of Singapore's size, Canada's coast share) come from memory and are only candidates.
- Disputed borders get a borders review from you. Episode 10 is the only one near a border; the others show coasts.
- Fine tiles must exist locally: `npm run coast:fine` (about 75 MB, already built here).
- Nothing is voiced or rendered with sound until you approve the storylines and the silent previews.

## Dropped on the way

Dubai's Palm islands (MODIS stills are too coarse to show them), Hans Island (a borders matter that needs its own review), lakes (the fine coast covers ocean shorelines only).
