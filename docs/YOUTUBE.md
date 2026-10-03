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

Then authorize the PokePulses channel once:

```bash
npm run youtube:auth
```

The browser opens Google OAuth with the minimal `youtube.upload` scope. The refresh token is stored locally at `.secrets/youtube-token.json`.

For CI/unattended use, credentials can instead be supplied via `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REFRESH_TOKEN`.

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

Optional flags:

```text
--made-for-kids=true|false
--notify-subscribers=true|false
```

The pipeline deliberately does not guess the made-for-kids declaration. Omit the flag unless the release owner has made that determination.

## Output

A successful upload writes:

```text
out/<episode-id>-youtube.json
```

The receipt contains the YouTube video ID, URL, upload timestamp, privacy request, schedule, and title.

The upload also links the episode to its video in `analytics/<show>/<episode-id>.json`. That file is committed, unlike the receipt, and holds the episode's performance history.

## Performance (analytics)

```bash
npm run analytics -- link <id> <video id or Shorts URL> [--published-at=<ISO>]   # for videos uploaded by hand
npm run analytics -- record <id> --views=1520 --avg-seconds=23.4 --avg-percent=75 --likes=90 --comments=12 --shares=7 --subs=3
npm run analytics -- fetch <id>     # the same numbers plus the retention curve, from the YouTube Analytics API
npm run analytics -- report         # every published episode: its numbers next to how it was built
```

Each `record` or `fetch` adds a dated snapshot, so it's worth taking one at 24 hours and another at 7 days.

`fetch` needs the read-only analytics scope (`yt-analytics.readonly`), which `youtube:auth` now requests along with upload. If your token predates this, run `npm run youtube:auth` once more.

The report lines each episode's average % viewed, hook hold and engagement up against its story shape, hook length, total length and engagement-audit score:
- **Hook hold** is the share of viewers still watching when the hook scene ends.
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
