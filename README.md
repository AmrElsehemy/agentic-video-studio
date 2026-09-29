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
```

1. **Research** — fetches the Pokémon's species, types, size, Pokédex entries, evolution line and alternate forms from PokéAPI into `research/<show>/<id>.json`, with sources. Reused on later runs; `--refresh-research` refetches. Every field has a **source tier** (`tiers` in the file): `official` (Pokédex text, types, sizes: stated plainly), `trusted_secondary` (PokéAPI-derived evolution conditions and form names: stated precisely) and `community` (the `lore` list, for fan theories and trivia you add by hand with a source: only ever stated hedged, e.g. "some fans believe…").
2. **Find the angle** — an **Angle Generator** proposes about six candidate ideas, each with a hook, a story shape and evidence pointers into the research; an **Angle Critic** scores them 1–5 on uniqueness to this Pokémon, surprise, specificity, visual potential and factual support. An angle that rests only on fields every Pokémon has (type, category, generation) can't score above 2 for uniqueness, so "Gimmighoul needs 999 coins" beats "Gimmighoul is a Ghost type". Below 16/25 the critic asks for a second round. Candidates, scores and the choice are saved in `research/<show>/<id>.angles.json`.
3. **Write** — a writer agent (Claude or OpenAI) builds the episode around the chosen angle and its story shape, writing the creative draft from the research only, following [DIRECTING.md](DIRECTING.md) and learning from the curated winners in [creative-references/](creative-references/README.md) for that shape. Identity, artwork URLs, rights and sources are filled in from the research, never by the model.
4. **Check and revise** — the draft goes through the schema, the compiler (beats, hook and scene timing), the production audit (80+ required) and a number check, then the **Fact Verifier**: every headline, narration line, caption and fact gets a verdict (supported / unsupported / uncertain) with evidence pointers into the research (e.g. `types[0]`, `pokedexEntries[1].text`). Each verdict also reports the tier of its evidence, and a claim resting only on `community` lore is unsupported unless the text hedges it. Unsupported claims, such as a type the research never mentions, go back to the writer with the other problems, up to 3 attempts. The report is saved as `research/<show>/<id>.verification.json`; uncertain lines are listed for review. Last, a **creative critic** judges the story itself (hook, specificity, tension, escalation, surprise, variety, payoff, question; see [DIRECTING.md](DIRECTING.md#checking-it)) and sends quoted, concrete revision notes back when it scores below 70; the review is saved as `research/<show>/<id>.creative.json`.
5. **Direct the visuals** — a **Visual Director** reads the finished draft and gives the scenes whose idea can be *shown* a semantic visual primitive with its data (see below). Every number and type it uses must be in the research; anything else is rejected and logged, and those scenes keep their story shape's shot.
6. **Save** — `drafts/<show>/<id>.json` and the compiled `videos/<show>/<id>/video.json`, then the fast certification. Review the draft before paying for voice.

Options: `--pattern=<archetype>` forces a story shape, `--overwrite` replaces an existing draft. The writer uses whichever key is set (`ANTHROPIC_API_KEY` first); `WRITER_PROVIDER=anthropic|openai` chooses explicitly and `WRITER_MODEL` overrides the model (defaults: `claude-opus-5-5`, `gpt-4o`).

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

- **Pull requests and pushes** render only episodes whose draft, manifest or research changed, plus the golden regression set in [`.github/golden-episodes.json`](.github/golden-episodes.json) when shared code (renderer, compiler, scripts, archetypes, dependencies, CI config) changes. Docs, tests and creative references render nothing.
- **Nightly**, and on demand from the Actions tab (`workflow_dispatch`), every episode renders.
- Each render uploads the MP4, a **contact sheet** (one frame per scene), the cover, the description and the **video critic's review**. Large selections are batched into at most 64 render jobs.

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
