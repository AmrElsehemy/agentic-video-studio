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
- scene roles
- compatible shot grammar
- compatible visual grammar
- subject focus
- conservative scene durations
- audio output paths
- manifest structure

## Supported archetypes

- `profile` — character-first introduction and evidence chain
- `mechanic` — unusual rule, requirement, or game mechanic
- `transformation` — state/form change with before/after payoff
- `mystery` — clues leading to layered reveals
- `comparison` — contrast between forms, Pokémon, stats, or choices

Legacy `reveal` and `debate` remain accepted for existing experiments.

## Renderer model

Engine-v2 compiled episodes use `CompiledEpisodeScene`, a reusable visual grammar driven by the compiled scene data. New Pokémon should **not** receive a Pokémon-specific React renderer unless they expose a genuinely reusable visual grammar that deserves to become a new archetype primitive.

The experiments for Bulbasaur, Gimmighoul, Darmanitan, and the old Terapagos renderer remain useful as reference implementations, but new episodes should prefer engine v2.

## Drift protection

`npm run validate` checks every draft against its compiled `video.json`. If a compiled manifest is hand-edited or stale, CI fails and tells you to recompile it.

This makes the draft the single source of creative truth.
