# Episode Compiler — Engine v2

The creative artifact is the draft. `video.json` is compiled output.

## Rule

Agents and humans edit `drafts/<show>/<episode-id>.json`.
They do **not** hand-author timing, scene roles, shots, renderer mappings, or production-safe durations in `video.json`.

## Pipeline

```text
research/facts
  ↓
creative draft
  ↓
episode compiler
  ↓
compiled video.json
  ↓
certification gate
  ├─ draft parity
  ├─ schema validation
  ├─ archetype engagement audit
  ├─ voice timing preflight
  └─ TypeScript compatibility
  ↓
paid TTS allowed
  ↓
render + QA
```

## Commands

Compile and run the zero-token safety checks:

```bash
npm run episode:prepare -- terapagos-1024
```

Run the stronger certification including a silent render and media QA:

```bash
npm run episode:certify -- terapagos-1024
```

Generate paid narration only after certification:

```bash
npm run voice:openai -- terapagos-1024
```

`voice:openai` runs the fast certification gate itself before making any OpenAI request. A stale or invalid episode cannot intentionally bypass the gate through the normal command.

## Creativity vs production ownership

The draft owns:

- story angle / premise
- hook
- archetype selection
- narration
- headlines and captions
- facts
- palette and voice direction
- source and rights metadata

The compiler owns:

- engine version
- beats and scene roles
- compatible shot grammar
- compatible visual grammar
- subject focus
- conservative scene durations
- audio output paths
- manifest structure

## Story archetypes and beats

Each archetype is a data file in `archetypes/<name>.json`: an ordered list of **beats**. A beat is one step of the story (hook, evidence, reveal, verdict, …) that can span a range of scenes.

| Archetype | Beats (scenes allowed) |
| --- | --- |
| `profile` | hook (1) → evidence (2–3) → escalation (1–2) → twist (1) → verdict (1) |
| `mechanic` | hook (1) → evidence (1–2) → escalation (1–2) → payoff (2–3) → verdict (1) |
| `transformation` | hook (1) → before (1–2) → change (1–2) → reveal (1) → aftermath (1–2) → verdict (1) |
| `mystery` | hook (1) → clue (1–3) → escalation (1–2) → reveal (2–3) → verdict (1) |
| `comparison` | hook (1) → evidence (2–3) → escalation (1–2) → twist (1) → verdict (1) |

Every archetype's hook is limited to **4.8s**, so narration for the first scene must be short enough to land within it. The compiler rejects a longer hook.

### Placing scenes in beats

- **Untagged scenes** are placed in order: a scene stays in the current beat until that beat has its minimum number of scenes, then moves to the next. A draft with exactly the minimum for every beat (6 scenes for every archetype today) needs no tags.
- **To add a scene**, tag it with the beat it belongs to, e.g. `"beat": "clue"`. A tagged scene can repeat the current beat (up to its maximum) or move forward; beats must stay in order.
- Repeated scenes in a beat cycle through that beat's `shots` and `visuals`, so they don't look identical.
- The compiler names the scene and beat in every error, e.g. `Beat "clue" allows at most 3 scene(s)` or `scene 5 ("late-clue") goes back to beat "clue" after "escalation"`.
- Whole episodes must compile to 45s or less.

### Adding an archetype

Add `archetypes/<name>.json`; drafts can use it straight away as their `storyPattern`. The loader validates the file: the first beat must have role `hook`, the last must have role `interaction`, beat ids must be unique, and `maxScenes` must be at least `minScenes`. The engagement audit applies generic structural checks to a new archetype; add pattern-specific checks in `scripts/engagement-audit.mjs` if the story shape needs them.

Legacy `reveal` and `debate` patterns remain accepted in existing hand-authored manifests but can't be compiled from drafts.

## Renderer model

Engine-v2 compiled episodes use `CompiledEpisodeScene`, a reusable visual grammar driven by the compiled scene data. New Pokémon should **not** receive a Pokémon-specific React renderer unless they expose a genuinely reusable visual grammar that deserves to become a new archetype primitive.

The experiments for Bulbasaur, Gimmighoul, Darmanitan, and the old Terapagos renderer remain useful as reference implementations, but new episodes should prefer engine v2.

## Drift protection

`npm run validate` checks every draft against its compiled `video.json`. If a compiled manifest is hand-edited or stale, CI fails, names the first field that differs, and tells you to recompile it. The comparison is by content, so reformatting a manifest is not drift — but always regenerate it with `npm run episode:compile` rather than editing it.

## Compiler tests

The compiler lives in `scripts/lib/compiler.mjs` as a pure function (`compileEpisode(draft, {showId})`) with no file access; `scripts/compile-episode.mjs` is the command-line wrapper.

```bash
npm test
```

- **Golden files:** every draft in `drafts/` is compiled and compared with its committed `video.json`, and checked against the renderer's schema. A compiler change that alters any episode's output fails here, so update the manifests deliberately with `npm run episode:compile` and review the diff.
- **Unit tests** cover scene duration limits, archetype mapping, beat defaults, Pokédex-number filtering and drift detection.

This makes the draft the single source of creative truth.
