# Creative references

Curated episodes the writer agent learns from. Only episodes judged to be genuinely strong belong here. They are examples of craft, not templates to fill in.

Each file holds the episode's creative fields (title, angle, scenes) plus `whyItWorks`: short curator notes on what makes it good. `archetypes` lists the story shapes it demonstrates.

The writer receives the references for the story shape it's asked to use. When no reference matches (or it picks the shape itself), it receives every reference, labelled with its archetype.

| Reference | Archetype | Why it's here |
| --- | --- | --- |
| Gimmighoul #999 | mechanic | One strange number carries the whole story |
| Bulbasaur #001 | profile | A thesis argued with concrete evidence and a real counterpoint |
| Darmanitan #555 | transformation | One trigger, shown as data, with a two-stage payoff |

To add a winner: copy its creative fields into `creative-references/<id>.json` with honest `whyItWorks` notes, and list the archetypes it demonstrates. `npm test` validates every file.
