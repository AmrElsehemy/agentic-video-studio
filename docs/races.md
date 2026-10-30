# Ranked races

A second PokePulses format with many Pokémon in one video: every bar counts up together and stops at its own value, the rows re-sort, the winner is contrasted with itself and the video ends on a question. There's no narration, only music and headlines.

## Commands

```bash
npm run races:prepare                       # download Gen 1–2 from PokéAPI and pin public/pokedex/dex.json (commit it)
npm run races:verify                        # checksum check, no network
npm run races:candidates                    # score every race; research/races/candidates.json
npm run races:new -- both-psychic-top-hp    # races/pokepulses/both-psychic-top-hp.json
npm run races:render -- both-psychic-top-hp # out/pokepulses-races/both-psychic-top-hp/both-psychic-top-hp.mp4
npm run races:studio                        # Remotion Studio with the races entry point
```

On Node 22 behind a proxy, `races:prepare` and `races:render` (it downloads the artwork) need `NODE_USE_ENV_PROXY=1`. `REMOTION_BROWSER_EXECUTABLE` works as it does for episodes.

## Race ids

`<region>-<group>-<top|bottom>-<metric>`:

- **region**: `kanto` (#1–151), `johto` (#152–251), `both`
- **group**: `all`, a type (`psychic`, `rock`, …), `unevolved`, `middle`, `fullyEvolved`, `single` (never evolves, not legendary), `legendary` (legendary or mythical), `baby`
- **metric**: `hp`, `attack`, `defense`, `spAtk`, `spDef`, `speed`, `total`, `height`, `weight`, `captureRate`, `hatchCounter`, `baseExp`

Any race with at least six Pokémon and no tie for first can be made, on the shortlist or not.

**Evolution stages are judged within the region's Pokédex.** Onix is fully evolved in a Kanto race (Steelix arrives in Johto), Pikachu starts its line there (Pichu too), and in Gen 1–2 Togetic is fully evolved (Togekiss arrives in Gen 4). The video's caption says so for evolution groups. Stats and types are those of the current games.

## The shortlist

`races:candidates` scores each race on simple rules: an underdog wins (more than half the group has higher total stats), a legendary or fully evolved Pokémon comes last, an unevolved Pokémon wins on size, a photo finish or a runaway. It then keeps at most three races per winner and per region+group, and drops the same story in another region. It suggests races and doesn't replace your judgement.

## Music

Races have no narration, so the music carries them. Each race uses a score from `scripts/lib/score.mjs` that builds with the race's beats: a pad and groove at the hook, more layers through the count-up, everything at the reveal. `races:new` picks one that suits the race: `pulse`, `epic` or `wonder` for a top race; `quirky`, `tension` or `pulse` for a bottom race. The pick comes from the race id, so neighbouring races sound different. Change `music.score` in the manifest to choose another; the known scores are `wonder`, `epic`, `tension`, `calm`, `quirky` and `pulse`.

On top of the score, `scripts/lib/race-sound.mjs` follows the bars:

- Every bar that stops plays a note, one step higher up a pentatonic scale each time. Bars that tie stop on one note.
- When a top race's winner stops, it gets an impact and a bell. A riser runs through its solo.
- A bottom race's winner stops first, on the lowest note. The riser then leads into the reveal, where the hit lands.
- A whoosh plays under the re-sort and a chime on the question.

The cue times come from the same counter curve the renderer draws, so each note lands on its bar's stopping frame.

## How it stays apart from episodes

| | Episodes | Races |
|---|---|---|
| Source | `drafts/pokepulses/`, compiled to `videos/pokepulses/<id>/video.json` | `races/pokepulses/<id>.json`, built from `public/pokedex/dex.json` |
| Entry point | `src/index.ts` (`VerticalEpisode`) | `src/races/index.ts` (`RankedRace`) |
| Rules | `shows/pokepulses.style.md`: one Pokémon, its artwork only | `shows/pokepulses.races.style.md`: up to ten, all shown |
| Checks | `validate`, engagement, critics, render QA | `checkRace` against the pinned table on every render |
| Output | `out/pokepulses/<id>/` | `out/pokepulses-races/<id>/` |

Nothing in `videos/`, `drafts/`, the compiler, `validate`, CI or the YouTube scripts reads `races/`, so the episode pipeline is unchanged. Races reuse the show's branding (`shows/pokepulses.json`: wordmark, palette, music bed) and the music generator.

## Not done yet

- Publishing: the YouTube scripts read episode manifests, so races can't be described, checked or uploaded with them yet.
- Analytics: races aren't tagged for `analytics compare`.
- A vision or OCR review of the render, like `critic:video` for episodes.
