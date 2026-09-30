# Geo Visual Director

The Geo Visual Director (#74, part of #69) turns a geography draft into map shots. The model decides the choreography: what the camera frames, what lights up, and what is labelled. It never writes coordinates or outlines. Those come from the research and the pinned map data.

```
research (names, points, claims) ──► resolver ──► allowed places ──► director model ──► checks ──► geo-map primitives ──► compiler
```

## Research (`research/<show>/<id>.json`)

Schema: `scripts/geo-research-schema.mjs`.

| Field | Meaning |
|---|---|
| `subject` | The place the episode is about, by name (`"Lesotho"`) |
| `regions` | Other places the map may show, by name (`"South Africa"`, `"Black Sea"`) |
| `claims` | Sourced statements (`tier`, `sources`). Every number shown on screen must appear in one |
| `places` | Named points (`{lon, lat, source}`) for things the map data doesn't have: cities, summits, dig sites. A point that isn't surveyed is marked `"approximate": true` |
| `sources` | Every source a claim or point cites. A missing one fails validation |

## Resolver (`scripts/lib/geo-resolver.mjs`)

The resolver maps names to registry ids. It checks Natural Earth names, ISO codes, Wikidata ids (`Q230`) and common aliases in `scripts/lib/geo-aliases.json` (`USA`, `Ivory Coast`, `Vatican City`). Matching ignores case, accents and a leading "the".
- **Ambiguous names** (`Congo`) and **unknown names** stop the run with the candidates or suggestions. The research is fixed; the resolver never guesses.
- **Countries with disputed areas** come back with review flags. The CLI prints them, and `preflight:publish` requires `rights.bordersReview` (see [geomotion-review.md](geomotion-review.md)).

## What the model may write

| Field | Allowed |
|---|---|
| Camera target | `"world"`, a place id, `{"around": [ids]}` (one box around several places), or `{"place": key}` (a named point, framed about 2°×1.5°) |
| Highlight | A place id. Disputed areas of flagged countries may only be highlighted, never framed or labelled |
| Anchor (labels, markers, arrow ends) | A place id or `{"place": key}` |
| Text | At most 28 characters. Every number must appear in a claim. A label on an approximate point must say so (`APPROX.`, `AREA`, `NEAR`, `~`) |

A shot that breaks any rule, fails the primitive schema, or names an unknown scene is rejected with a reason. Its scene gets the **default map**: the subject framed, filled and named. Scenes the model skips get the same, and so does every scene when there is no model or the model fails. A directed draft always compiles.

## Running it

```bash
npm run geo:direct -- lesotho-enclave                    # ask the director model (DIRECTOR_* / CHECKER_* / WRITER_* settings)
npm run geo:direct -- lesotho-enclave --write            # replace the draft's map shots
npm run geo:direct -- lesotho-enclave --reply=<file>     # replay a saved reply (tests, reviews, offline)
```

Without `--write`, the result goes to `out/<id>.geo-directed.json`. Review it with `npm run frames -- <id>`.

## Tests

`test/geo-director.test.ts` covers the following:
- The resolver: names, aliases, ambiguity, unknowns and review flags.
- The research schema.
- The translation rules.
- Georgia with a scripted reply that mixes valid and invalid shots.
- Lesotho: its committed draft is rebuilt byte for byte from the saved reply in `test/fixtures/geo-director/lesotho-enclave.reply.json`.

Lesotho is the second-country check that the pipeline generalises. It is an enclave inside South Africa, with a detour to Italy's two enclaves. It uses only existing primitives and renderer code, with no new React.
