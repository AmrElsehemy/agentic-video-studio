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
npm run typecheck              # TypeScript checks
npm run still -- bulbasaur-001 # Render the cover frame
npm run voice -- bulbasaur-001 # Generate scene-fitted AI narration (requires OPENAI_API_KEY + FFmpeg)
npm run description -- bulbasaur-001
npm run preflight:publish -- bulbasaur-001
```

## Pipeline

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

Agentic planning, automated factual review, publishing, and analytics feedback are later milestones. The episode manifest is the contract those agents will produce.

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
