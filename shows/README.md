# Show profiles

Each file here defines one show. A new show is a new `shows/<id>.json` plus drafts in `drafts/<id>/`; no code changes. The compiler merges the profile under every draft (a draft's own `show`, `palette`, `voice` and `musicVolume` win) and embeds the result in each `videos/<id>/<episode>/video.json`, so the renderer and the audio read branding only from the manifest.

| Field | What it controls |
| --- | --- |
| `id`, `name`, `handle` | Identity; `id` must match the file name and the `drafts/<id>/` folder. |
| `description` | One line the agents are told about the show. |
| `wordmark` | The corner mark on every scene and the cover: `lead` text, then `accent` text in the scene's accent colour. |
| `fonts` | `display` (headlines, captions): one of Bebas Neue, Anton, Oswald, Archivo Black, Bangers. `body` (labels): `system`, Inter, Montserrat or Poppins. |
| `palette` | Default colours for drafts that don't set their own. |
| `music` | The generated music bed: `bpm`, a repeating bass line `notes` (Hz) and its `volume`. |
| `voice` | Default narration voice, speed, model and instructions. |
| `notices` | Ownership and non-affiliation text written into every draft's rights. |
| `subjects` | Optional rules for subjects: `identifierLabel` (e.g. "Pokédex number") and `identifierPattern`, a regular expression every `identifier` must match. |
| `captions` | Optional. `{"mode": "words"}` shows the narration a few words at a time in the caption band, with the spoken word highlighted, whenever the episode is rendered with narration. Without it (or with `"static"`) each scene shows its one caption line. |
| `archetypes` | Story shapes (`archetypes/<name>.json`) the show allows. |

`shows/pokepulses.json` is the reference.
