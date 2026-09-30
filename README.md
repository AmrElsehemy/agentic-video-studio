# Agentic Video Studio

A data-driven video pipeline that turns a validated episode manifest into a publishable vertical video. The first show is **PokePulses** and the first episode is **Bulbasaur #001**.

## Milestone 0.2

```bash
npm install
npm run video -- bulbasaur-001
```

The command validates the episode, renders a 1080×1920 H.264 MP4, and writes it to `out/bulbasaur-001.mp4`.

Useful commands:

```bash
npm run studio                 # Open the Remotion preview
npm run validate               # Validate every episode manifest
npm run engagement -- bulbasaur-001 # Score hook, story tension, pacing and interaction
npm run typecheck              # TypeScript checks
npm run still -- bulbasaur-001 # Render the cover frame
npm run sheet -- bulbasaur-001 # One frame per scene from the rendered video, tiled (after npm run video)
npm run voice -- bulbasaur-001 # Generate scene-fitted AI narration (requires OPENAI_API_KEY + FFmpeg)
npm run voice:local -- bulbasaur-001 # Free macOS draft narration using the built-in `say` voice
npm run video:local -- bulbasaur-001 # Render explicitly with the free draft voice
npm run voice:openai -- bulbasaur-001 # Generate the polished OpenAI narration
npm run video:openai -- bulbasaur-001 # Render explicitly with the polished voice
npm run description -- bulbasaur-001
npm run preflight:publish -- bulbasaur-001
```

If Remotion cannot download its browser runtime, point it at an installed Chrome binary:

```bash
REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run video -- bulbasaur-001
npm run studio -- --browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## Test it locally

One-time setup (Node 20+):

```bash
npm install
brew install ffmpeg tesseract   # Linux: sudo apt-get install ffmpeg tesseract-ocr
```

1. **Fast checks** (no keys, no browser): `npm test && npm run typecheck && npm run validate`
2. **Look at an episode** (no keys):
   ```bash
   npm run studio                          # Remotion Studio, with a built-in preview episode
   npm run video -- gimmighoul-999         # out/gimmighoul-999.mp4 (music bed, no narration)
   npm run still -- gimmighoul-999         # the cover
   npm run sheet -- gimmighoul-999         # one frame per scene, tiled
   npm run critic:video -- gimmighoul-999  # OCR/pixel review of the render
   ```
   To preview a specific episode in Studio, paste its `videos/pokepulses/<id>/video.json` into the `manifest` prop.
3. **With narration**: `npm run voice:local -- <id> && npm run video:local -- <id>` (free macOS voice), or `voice:openai` / `video:openai` with `OPENAI_API_KEY`.
4. **The agents** (needs `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`):
   ```bash
   npm run episode:new -- 888                          # research → draft → checks → manifest
   npm run episode:new -- 888 --voice=local --render   # …plus narration, render, cover and video critic
   npm run critic:calibrate                            # the creative critic against the curated references
   npm run critic:video -- zacian-888 --vision         # add the vision model's review
   ```
   The agents' reasoning is saved in `research/pokepulses/<id>.angles.json`, `.verification.json` and `.creative.json`. Edit `drafts/pokepulses/<id>.json` by hand if you like, then `npm run episode:compile -- <id>` and render again.

## Shows

A show's branding lives in `shows/<id>.json`: name and handle, wordmark, fonts, default palette, music bed, narration voice, rights notices and allowed story shapes (see [shows/README.md](shows/README.md)). The compiler merges it under each draft in `drafts/<id>/` and embeds it in the manifests, so a second show is a new profile plus drafts, with no code changes.

Subjects are not tied to Pokémon. A draft's `subject` is `{name, category, artworkUrl, identifier?, attributes?}` and `related` lists other subjects with how they relate (`evolves-to`, `evolves-from`, `form`, `related`); the first related subject is the before/after and "VS" partner. The `identifier` (a Pokédex number, a model code) only appears on screen when `numberRelevant` is true, and a show can require a format for it (`subjects.identifierPattern`; PokePulses requires `#001`-style numbers). Drafts in the older shape (`subject.index`, `evolutions`) are upgraded automatically when compiled.

## Create an episode from a Pokédex number

```bash
export ANTHROPIC_API_KEY=...            # the writer agent (or OPENAI_API_KEY)
npm run episode:new -- 888              # research → angle → write → check → compile → certify
npm run episode:new -- 888 --voice=local --render   # …and narrate + render a preview (macOS voice)
npm run episode:new -- 888 --voice=openai --render  # …with the polished paid voice
npm run episode:new -- 5-9 --voice=openai --render   # a batch: 5 to 9 (or list them: 5 6 7); a failed episode doesn't stop the rest
```

Every other command takes an episode by its id (`charmander-004`) or just its Pokédex number (`4`, `004` or `#4`), e.g. `npm run video -- 4`, `npm run youtube:upload -- 4 --privacy=private`.

1. **Research** — fetches the Pokémon's species, types, size, Pokédex entries, evolution line and alternate forms from PokéAPI into `research/<show>/<id>.json`, with sources. Reused on later runs; `--refresh-research` refetches. Every field has a **source tier** (`tiers` in the file): `official` (Pokédex text, types, sizes: stated plainly), `trusted_secondary` (PokéAPI-derived evolution conditions and form names: stated precisely) and `community` (the `lore` list, for fan theories and trivia you add by hand with a source: only ever stated hedged, e.g. "some fans believe…").
2. **Find the angle** — an **Angle Generator** proposes about six candidate ideas, each with a hook, a story shape and evidence pointers into the research; an **Angle Critic** scores them 1–5 on uniqueness to this Pokémon, surprise, specificity, visual potential and factual support. An angle that rests only on fields every Pokémon has (type, category, generation) can't score above 2 for uniqueness, so "Gimmighoul needs 999 coins" beats "Gimmighoul is a Ghost type". Below 16/25 the critic asks for a second round. Candidates, scores and the choice are saved in `research/<show>/<id>.angles.json`.
3. **Write** — a writer agent (Claude or OpenAI) builds the episode around the chosen angle and its story shape, writing the creative draft from the research only, following [DIRECTING.md](DIRECTING.md) and learning from the curated winners in [creative-references/](creative-references/README.md) for that shape. Identity, artwork URLs, rights and sources are filled in from the research, never by the model.
4. **Check and revise** — the draft goes through the schema, the compiler (beats, hook and scene timing), the production audit (80+ required) and a number check, then the **Fact Verifier**: every headline, narration line, caption and fact gets a verdict (supported / unsupported / uncertain) with evidence pointers into the research (e.g. `types[0]`, `pokedexEntries[1].text`). Each verdict also reports the tier of its evidence, and a claim resting only on `community` lore is unsupported unless the text hedges it. The report is saved as `research/<show>/<id>.verification.json`; uncertain lines are listed for review. Alongside it, a **creative critic** judges the story itself (hook, specificity, tension, escalation, surprise, variety, payoff, question; see [DIRECTING.md](DIRECTING.md#checking-it)) and aims for 70/100; the review is saved as `research/<show>/<id>.creative.json`. Facts and story are judged together on every draft that passes production, so one revision fixes both instead of trading one for the other. Facts are a hard gate; the story is not, because a model's taste score is noisy and rewriting towards it doesn't converge: the story gets one revision, then the best-scoring draft whose facts pass is kept and flagged **below the bar** in the log and in `creative.json`, for you to review (publishing needs your release approval anyway). `--strict-story` makes the story a hard gate again. Once the story is settled and only a few lines (up to 4) are unsupported, the writer rewrites just those lines and they are patched in, rather than rewriting the episode. Fallback angles are tried only when no draft passes on facts. `episode:new` allows 4 writer calls per angle and 10 in total across fallback angles; if none passes, the closest draft and its remaining problems are saved to `out/<id>.best-attempt.json` to finish by hand (save it as `drafts/<show>/<id>.json`, then `npm run episode:compile -- <id>`).
5. **Direct the visuals** — a **Visual Director** reads the finished draft and gives the scenes whose idea can be *shown* a semantic visual primitive with its data (see below). Every number and type it uses must be in the research; anything else is rejected and logged, and those scenes keep their story shape's shot.
6. **Save** — `drafts/<show>/<id>.json` and the compiled `videos/<show>/<id>/video.json`, then the fast certification. Review the draft before paying for voice.

Options: `--pattern=<archetype>` forces a story shape, `--overwrite` replaces an existing draft.

**Models.** The agents use whichever key is set (`ANTHROPIC_API_KEY` first); `WRITER_PROVIDER=anthropic|openai` chooses explicitly and `WRITER_MODEL` sets the model for every agent (defaults: `claude-opus-5-5`, `gpt-5.6-terra`). Each agent can also run on its own model, so the judging work can use a cheaper one:

| Agent | Setting | Falls back to |
|---|---|---|
| Writer | `WRITER_MODEL` | provider default |
| Angle Generator | `ANGLES_MODEL` | `WRITER_MODEL` |
| Angle Critic, Fact Verifier, Creative Critic, Visual Director, Video Critic (vision) | `ANGLE_CRITIC_MODEL`, `VERIFIER_MODEL`, `CRITIC_MODEL`, `DIRECTOR_MODEL`, `VISION_MODEL` | `CHECKER_MODEL`, then `WRITER_MODEL` |

Each `*_MODEL` has a matching `*_PROVIDER`. A model setting only applies to its own provider, so `CHECKER_PROVIDER=anthropic` never inherits an OpenAI `WRITER_MODEL`. `episode:new` prints which model each agent uses. A cheap OpenAI setup keeps the writer and fact checking on a capable model and moves the rest down a tier:

```bash
export WRITER_MODEL=gpt-5.6-terra VERIFIER_MODEL=gpt-5.6-terra CHECKER_MODEL=gpt-5.6-luna
```

The fact verifier is the one check worth keeping on the stronger model: a weak one either lets invented claims through or rejects good lines. Each writer revision sends only the brief, the latest draft and its problems, not the whole conversation.

## Pipeline

The agents and how they hand work to each other are drawn in [`docs/architecture.drawio`](docs/architecture.drawio) (open it at [app.diagrams.net](https://app.diagrams.net) or with the draw.io VS Code extension).

`Idea → research → script → storyboard → assets → voice/music → Remotion → QA → publish`

Milestone 0.2 implements the deterministic visual pipeline plus an opt-in narration stage:

- a versioned `video.json` contract;
- a reusable 9:16 Remotion composition;
- scene timing, transitions, kinetic captions, progress and branding;
- a one-command render entry point;
- structural validation and automated render QA.
- scene-by-scene OpenAI narration generation with duration checks;
- automatic music ducking when a narration track is present;
- explicit asset-rights metadata and a fail-closed publication preflight.
- a fail-closed viral-director contract that rejects flat fact lists before render.

Agentic planning, automated factual review, publishing, and analytics feedback are later milestones. The episode manifest is the contract those agents will produce.

The directing rules live in [DIRECTING.md](DIRECTING.md). They force every episode to make one arguable promise, escalate it, pay it off, and invite a meaningful verdict; story shapes that argue a position (profile, comparison) must also survive a counterpoint.

## Visual primitives

Each beat of a story shape has a default **shot** (artwork, headline and fact cards, in seven layouts). A scene can instead carry a **primitive**: a component that visualises its idea from data, defined in [`scripts/primitive-schema.mjs`](scripts/primitive-schema.mjs) and drawn by [`src/video/primitives.tsx`](src/video/primitives.tsx):

| Primitive | Shows | Example |
| --- | --- | --- |
| `counter` | a number climbing to a target | Gimmighoul's 999 coins |
| `meter` | a gauge crossing a threshold (the artwork changes when it does) | Darmanitan's HP falling to half |
| `bars` | values side by side, optionally changing | Darmanitan's stat swap, Zacian's weight |
| `type-shift` | a change of type | Fire → Fire/Psychic |
| `timeline` | ordered steps, with artwork for any Pokémon named | Gimmighoul → 999 coins → Gholdengo |
| `checklist` | requirements ruled out or in | no stone, no trade, 999 coins |

Authors can set `"primitive"` on a draft scene by hand; `episode:new` lets the Visual Director choose.

## Continuous integration

Every push and pull request runs the global checks (validate, typecheck, tests). Rendering is selective so CI scales with the catalog:

- **Pull requests and pushes** render full MP4s only for episodes whose draft, manifest or research changed. When shared code changes (renderer, compiler, scripts, archetypes, dependencies, CI config), the golden regression set in [`.github/golden-episodes.json`](.github/golden-episodes.json) gets a **frame check** instead: one job renders just the frames the video critic reads (one per scene, plus the cover) for every golden episode, in one browser, and runs the contact sheet and critic on them. That's the same frames an MP4 would give the critic, for a fraction of the time. If the change can affect audio or encoding (render/audio scripts, show profiles, dependencies, CI config), the first golden episode is also rendered in full as a smoke test. Docs, tests and creative references render nothing.
- **Nightly**, and on demand from the Actions tab (`workflow_dispatch`), every episode renders in full.
- Each full render uploads the MP4, a **contact sheet** (one frame per scene), the cover, the description and the **video critic's review**; the frame check uploads the same minus the MP4, plus the frames. Large selections are batched into at most 64 render jobs.
- Run the frame check locally with `npm run frames -- <id> [<id> ...]`, then `npm run sheet -- <id> --frames` and `npm run critic:video -- <id> --frames`.

## Video critic

`npm run critic:video -- <id>` reviews a rendered episode (`npm run video`, plus `npm run still` for the cover) one mid-scene frame at a time, and exits non-zero on any blocking issue. CI runs it after every render, and `episode:new --render` runs it too.

- **Frame audit** (always, deterministic): OCR (tesseract, on the header, visual area and caption bands) checks every scene's headline and caption are readable, the caption is drawn once, and the cover's title is this episode's hook headline. Pixel statistics catch blank frames and flag consecutive scenes that look the same.
- **Vision critic** (`--vision`, or `VIDEO_CRITIC_VISION=1`; in CI the repository variable `VIDEO_CRITIC_VISION=1` plus a model key secret): a vision model reviews the frames and cover against what each scene should show: legibility, overlap (including faint backdrop words hidden behind artwork), visible artwork, platform safe areas, variety and whether each frame expresses its beat.

The review is saved as `out/<id>-video-review.json`.

## Voice workflow

Use the zero-cost macOS voice while iterating on timing and visuals:

```bash
npm run voice:local -- bulbasaur-001
npm run video:local -- bulbasaur-001
```

The local preview uses macOS `say` with `Samantha` by default. Override it with `LOCAL_TTS_VOICE` or inspect installed voices with `say -v '?'`. When a cut is approved, generate and render the separate OpenAI track:

```bash
npm run voice:openai -- bulbasaur-001
npm run video:openai -- bulbasaur-001
```

`npm run video` automatically prefers an existing OpenAI track and falls back to the local preview. The files remain separate, so generating a draft never overwrites the polished narration.

Each generated track is locked to the narration, scene timing and voice settings it was made from. If any of those change afterwards, `npm run video` refuses to use the old track and tells you which command regenerates it (or render without narration using `--voice=none`). In automatic mode, a stale OpenAI track is skipped with a warning when an up-to-date local track exists. Regenerating is free for scenes whose narration didn't change, because each scene's raw audio is cached. Tracks generated before this lock existed count as stale and need regenerating once.

## GeoMotion map data

Geography episodes (the GeoMotion epic, #69) draw countries, seas and disputed areas from pinned, public-domain Natural Earth data in `public/geo/`, with an entity registry (`country:GEO`, `water:black-sea`, …) and checksums. `npm run geo:prepare` rebuilds it from the pinned source; `npm run geo:verify` (in CI) checks it. Decisions (data, license, projection, disputed borders) are in [docs/geomotion-data.md](docs/geomotion-data.md).

A scene draws a map with one `geo-map` primitive: camera keyframes (world → region → country), highlighted places, and labels, markers and arrows, all referring to places by registry id. See [docs/geomotion-primitives.md](docs/geomotion-primitives.md). `npm run geo:golden` renders the golden map shots and compares them with `test/golden/geo/`.

## Geographica

The second show, [`shows/geographica.json`](shows/geographica.json), tells geography stories with animated maps. Its first episode, `georgia-wine` ("Where Did Wine Begin?"), is seven `geo-map` scenes built from hand-curated research ([`research/geographica/georgia-wine.json`](research/geographica/georgia-wine.json)), where every narrated fact cites its source. A subject without artwork (a country) is allowed when every scene brings its own visual; the cover then shows the episode's first map. Map episodes credit Natural Earth in the description, and `preflight:publish` blocks them until a person records how disputed borders are shown (`rights.bordersReview`). See the [review checklist](docs/geomotion-review.md).

## Project structure

```text
src/                         reusable rendering engine
scripts/                     render, validation and QA commands
videos/pokepulses/<episode>/ episode manifest and owned/licensed assets
out/                         generated media (gitignored)
```

## Editorial and rights policy

PokePulses is an unofficial fan-made educational prototype and is not affiliated with or endorsed by the Pokémon rights holders. Attribution does not grant permission or create a license.

The current Bulbasaur prototype uses official character artwork mirrored by PokéAPI. It is deliberately marked `internal-prototype` and is **not cleared for public release**. Every external asset must have a recorded source and rights status, and publishing automation must pass `preflight:publish`. See [RIGHTS.md](RIGHTS.md).
