# Geographica style guide

The writer, map director and critics read this before every episode. Rules in the prompts and checks still apply; this is the taste on top of them.

## What the show is
A place, a border or a route that surprises, told with an animated map in 30 to 45 seconds. The viewer should finish seeing the map differently: "so that's why it's shaped like that."

## Story
- One map mystery per episode: a strange border, an enclave, an extreme, a route. Set it up in the hook, solve it on the map.
- Let the map carry the proof. A claim the viewer can see (an outline, a route, a shaded comparison) beats a claim they have to take on trust.
- Every fact comes from the research with a pinned source. Superlatives ("highest", "oldest", "first") are attributed to the source that makes them.
- Disputed borders and names are shown as the research and the recorded borders review say, never argued in the narration.
- End on a question the viewer can answer from where they live or what they'd choose.

## Voice and tone
- A curious friend walking you across a map: clear, confident, with a small sense of discovery on each reveal.
- Slow slightly on place names and dates so they land.
- Never a documentary announcer or a lecture; no geopolitics hot takes.

## Visuals
- Start wide (the world or a region), then push in. Consecutive scenes are one continuous flight unless the story jumps somewhere unrelated.
- One camera move per idea. Frame the places the narration names, with room for their labels.
- Label only what the narration names. A label that would crowd others gets an end time before the camera pulls out.
- Relief (shaded terrain) only when the story is about height, mountains or valleys.
- A data map only when the narration compares places by a number, with the legend on screen.
- A route only for movement: journeys, trade, migrations. Follow it with the camera when the route is the story.
- Map palette: deep water, muted land, one warm accent for the subject. Highlights are fills or outlines in the accent; never more than two accent colours in a frame.
- Light variant (an experiment, #92): pale blue water `#cfdde6`, paper land `#f3ede0`, burnt-orange accent `#b4561f`, deep blue `#2c5d7f` (it tints the water), near-black ink `#1b2730`. It's the show's `light` palette variant: set `"paletteVariant": "light"` in a draft rather than copying the colours. Relief reads more faintly on pale land, and glows stay tight and faint so small countries stay crisp.
- Light twins: `silk-road-light` and `lesotho-enclave-light` retell `silk-road` and `lesotho-enclave` with the light palette (`"twinOf"` in the draft). A twin plays its original's narration, so the two differ only in palette, and it needs its own title so the uploads can be told apart.
- Every palette, light or dark, must pass the contrast check in `npm run validate`: text 4.5:1 on the background and the land, the accent 3:1 on the background.

## Motion
- Reveals land on the beat; highlights and labels spring in with a small overshoot.
- Fast camera moves are allowed; they're motion-blurred, but don't chain more than two in a row.

## What the numbers say (live counts of 30 Oct 2026; 42 public episodes at least 2 days old)
These are correlations in a small, uneven sample (median views per day of age, `npm run analytics -- compare geographica`). Treat them as things to try, not rules, and refresh them with each batch.
- Hooks that open on a mystery are most of the catalogue (32 of 42) and sit below the rest: 75 views a day against 191 for the 10 that open another way (impact, comparison). Open a share of each batch on the consequence or the comparison ("23 countries have fewer people than in 1990") and keep the mystery for the middle.
- Story shape: transformation (6 episodes, 131 a day) and comparison (2, 214, too few to rank) beat mystery (31, 81). Plan at least a third of a batch as a before/after or a side-by-side.
- Episodes that end by looping back to their first frame (`framing.ending: "loop"`, 6 episodes) have the highest median, 280 a day against 63. Try it on about half a batch to see whether it holds.
- Episodes that open with the map bleeding in from the first frame (`framing.opening: "bleed"`, 4) and ones with a timeline (11) or flags (20) also lead. The sample is thin; vary them, don't force them.
- Photo scenes (10 episodes, 58 a day against 155) and routes (10, 46 against 84) go with fewer views. That is no proof the photos or routes are the cause (they may sit in niche topics), so keep them where the story needs them, but don't add a photo for decoration.
- Like rates are flat across every feature (about 1.4%), so none of this moves how well an episode is liked, only how often it is shown.

## Never
- Draw a border by hand or move a place; everything comes from the pinned map data. The one exception is a plate reconstruction (`reconstruction` in a shot): a place may be drawn where the pinned plate-motion model (Müller et al. 2016, CC BY 4.0) puts it at an age, drifting to where it is today, with an age counter on screen and the model credited. The other is a true-size comparison (`truesize`): a copy of a place rotated on the sphere onto another, drawn only in an equal-area projection, with its real position outlined and a note on screen that it was moved. Nothing else may be moved.
- Highlight a disputed area on its own, or take a side on it.
- State a number that isn't in the research.
- Use real-time or political news as a hook.
