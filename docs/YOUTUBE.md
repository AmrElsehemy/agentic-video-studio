# YouTube publishing

Agentic Video Studio can upload rendered episodes directly to YouTube using the YouTube Data API v3.

## One-time Google setup

1. In Google Cloud, create or select a project.
2. Enable **YouTube Data API v3**.
3. Configure the OAuth consent screen.
4. Create an OAuth client of type **Desktop app**.
5. Download the client JSON and save it as:

```text
.secrets/youtube-client.json
```

The `.secrets/` directory is gitignored.

Then sign in once per show, each to its own channel:

```bash
npm run youtube:auth -- --show=pokepulses
npm run youtube:auth -- --show=geographica
```

The browser opens Google OAuth for uploads, read-only analytics and read-only channel data (to check which channel a login belongs to). Each show's refresh token is stored locally at `.secrets/youtube-token-<show>.json`. PokePulses also keeps using an existing `.secrets/youtube-token.json`. A login made before channel checks existed lacks the read-only channel permission, so sign in again.

A show whose profile sets `publishing.channelId` (Geographica: `UCAdCQV1ieA3NjmNiutIRwHQ`) only uploads to, and links videos from, that channel. Signing in to another channel, or uploading with that login, stops with an error naming both channels. After signing in to a show without one, the command prints the line to add.

For CI/unattended use, credentials can instead be supplied via `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` and one refresh token per show: `YOUTUBE_REFRESH_TOKEN_GEOGRAPHICA`, `YOUTUBE_REFRESH_TOKEN_POKEPULSES` (PokePulses also accepts `YOUTUBE_REFRESH_TOKEN`).

## Dry run

Always inspect metadata before the first real upload:

```bash
npm run youtube:upload -- charmander-004 --privacy=private --dry-run
```

This does not call YouTube.

## Upload a private review copy

```bash
npm run youtube:upload -- charmander-004 --privacy=private
```

Private uploads are allowed without public-release clearance so the channel can be used for review.

## Public / unlisted / scheduled releases

Any upload that can leave private review mode is fail-closed through `preflight:publish`.

```bash
npm run youtube:upload -- charmander-004 --privacy=unlisted
npm run youtube:upload -- charmander-004 --privacy=public
npm run youtube:schedule -- charmander-004 --publish-at=2026-10-01T17:00:00Z
```

Scheduling uploads the video as private and sets YouTube's `publishAt` timestamp.

Uploads use YouTube category 24 (Entertainment) unless the show profile sets `publishing.categoryId` (Geographica: `27`, Education). Set `YOUTUBE_CATEGORY_ID` to override either for a run.

Optional flags:

```text
--made-for-kids=true|false
--notify-subscribers=true|false
```

The pipeline deliberately does not guess the made-for-kids declaration. It is the release owner's determination, recorded as `publishing.madeForKids` in the show profile (PokePulses: `true`, declared as made for kids) and sent with every upload. The flag overrides it for a single upload. Remove the setting to leave it undeclared.

## Playlist

Set `publishing.playlistId` in the show profile (`shows/pokepulses.json`; the part after `list=` in the playlist's URL) and every upload is added to that playlist right after it succeeds. A failure there only warns, because the upload has already worked.

This needs the playlist permission (`youtube.force-ssl`), which also lets the login edit videos. Run `npm run youtube:auth` once more and approve it.

To add episodes that were uploaded earlier, in order, skipping any already in the playlist:

```bash
npm run youtube:playlist -- 10-20 --dry-run
npm run youtube:playlist -- 10-20
```

## Output

A successful upload writes:

```text
out/<episode-id>-youtube.json
```

The receipt contains the YouTube video ID, URL, upload timestamp, privacy request, schedule, and title.

The upload also links the episode to its video in `analytics/<show>/<episode-id>.json`. That file is committed, unlike the receipt, and holds the episode's performance history.

## Performance (analytics)

```bash
npm run analytics -- link-channel <show> [--dry-run]                          # link every upload on the show's channel to its episode, by title
npm run analytics -- link <id> <video id or Shorts URL> [--published-at=<ISO>]   # for videos uploaded by hand
npm run analytics -- record <id> --views=1520 --avg-seconds=23.4 --avg-percent=75 --likes=90 --comments=12 --shares=7 --subs=3
npm run analytics -- fetch <id>     # the same numbers plus the retention curve, from the YouTube Analytics API
npm run analytics -- report         # every published episode: its numbers next to how it was built
```

Each `record` or `fetch` adds a dated snapshot, so it's worth taking one at 24 hours and another at 7 days.

`fetch` needs the read-only analytics scope (`yt-analytics.readonly`), which `youtube:auth` now requests along with upload. If your token predates this, run `npm run youtube:auth` once more.

The report lines each episode's average % viewed, hook hold and engagement up against its story shape, hook length, total length and engagement-audit score:
- **Hook hold** is the share of viewers still watching when the hook scene ends.
- **By palette** groups episodes into dark and light (#92) with their average % viewed and views. Topic and posting time differ between the episodes and aren't controlled for; `out/analytics-report.json` lists both for each episode so you can read the numbers against them.
- **Palette twins** pairs each light twin with its dark original (`twinOf`, #92): same topic, same script and the same narration track, so the palette and the posting time are the only differences. The report shows how many days apart the two went out. Post twins a few days apart rather than back to back, and give each its own title (validation requires it): `link-channel` matches uploads by title, and YouTube can treat two near-identical uploads as repetitive content.
- A snapshot with 0 views isn't counted as measured: it says nothing about how long people watch.
- **Cost** is the production log's estimate of what the episode cost to make, and **per 1k views** divides it by the latest view count (see Production log below). Both show – until there is a cost or a view.
- **Trends:** once five episodes have numbers, the report also shows how each lever correlates with completion. That is the evidence for retuning the director's defaults (#25).

## Production log

Every episode also keeps a record of how it was made: `analytics/<show>/<id>.production.json` (#89). It is committed with the performance history. Entries come from:

- each model call by `episode:new`, `geo:direct` and the video critic: the agent's role, provider, model and token counts;
- paid or local narration: the characters and seconds synthesised (cached scenes cost nothing);
- local renders, with the time they took (CI renders aren't logged);
- `npm run pipeline -- <id> --approve`, the approval for paid narration.

```bash
npm run production -- <id>          # calls by role, narration, renders, approvals and the estimated cost
npm run production -- <id> --json
```

Costs are estimates from the list prices in `scripts/lib/prices.json`, which name their source and the date they were checked. A model without a price is still logged with its tokens, and the summary names it as not priced. Borders reviews are read from the episode's `rights`.

## Shorts

There is no separate Shorts upload API. Upload the existing 9:16 MP4 normally; YouTube determines Shorts presentation from the uploaded video. Do not add black bars.

## API-project note

Google states that uploads from unverified API projects created after July 28, 2020 are restricted to private viewing until the project passes YouTube's API compliance audit. The private review pipeline still works; public automation may require that audit.
