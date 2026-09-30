# Rights and release policy

PokePulses is an unofficial fan-made educational prototype. It is not affiliated with, endorsed by, or sponsored by The Pokémon Company, Nintendo, Creatures Inc., or GAME FREAK inc.

Pokémon and Pokémon character names are trademarks of Nintendo. Pokémon artwork and related intellectual property are © Pokémon / Nintendo / Creatures / GAME FREAK. All rights belong to their respective owners.

## Important limitation

Attribution and a non-affiliation disclaimer do **not** grant permission or create a license.

## Artwork decision (2026-09-30)

PokePulses uses official Pokémon artwork mirrored by PokéAPI. **No licence has been obtained** from the rights holders. After their own legal review, the channel owner (Amr Elsehemy) decided the artwork may be published in PokePulses episodes and accepts the risk. This is recorded:
- in the show profile, as `artworkClearance` in `shows/pokepulses.json`;
- in every episode, as `rights.artworkReview`. The episode's artwork assets are marked `permission-required` and approved.

New episodes from `npm run episode:new` inherit this clearance.

What the clearance does not cover:
- **Episode release.** It does not approve any single episode. Each episode stays `internal-prototype` until a person does two things:
  - completes the fact and title/cover review;
  - sets `rights.releaseStatus: "cleared"` and `rights.publicReleaseApproved: true` in the episode's draft.
- **Other art.** Art marked `unverified`, or any other show's art, stays blocked.

To withdraw the clearance, remove `artworkClearance` and the episodes' `artworkReview`. `preflight:publish` then blocks their artwork again.

Every manifest records the release status and the rights status of external assets. Before upload, run:

```bash
npm run preflight:publish -- <episode-id>
```

Publishing automation must stop when this command fails.
