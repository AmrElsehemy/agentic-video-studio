# Agentic Video Studio

A data-driven video pipeline that turns a validated episode manifest into a publishable vertical video. The first show is **PokePulses** and the first episode is **Bulbasaur #001**.

## Milestone 0.1

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
```

## Pipeline

`Idea → research → script → storyboard → assets → voice/music → Remotion → QA → publish`

Milestone 0.1 intentionally implements the deterministic half of that pipeline first:

- a versioned `video.json` contract;
- a reusable 9:16 Remotion composition;
- scene timing, transitions, kinetic captions, progress and branding;
- a one-command render entry point;
- structural validation and automated render QA.

Agentic planning, generated voice, music, automated factual review, publishing, and analytics feedback are later milestones. The episode manifest is the contract those agents will produce.

## Project structure

```text
src/                         reusable rendering engine
scripts/                     render, validation and QA commands
videos/pokepulses/<episode>/ episode manifest and owned/licensed assets
out/                         generated media (gitignored)
```

## Editorial and rights policy

The studio does not ship copied game footage, anime clips, official artwork, or music. PokePulses uses original motion graphics and factual commentary. Pokémon names may be used editorially to identify the subject; Pokémon and related marks belong to their respective owners. Before public release, every external asset must have a recorded source and license.
