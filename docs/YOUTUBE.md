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

The browser opens Google OAuth for upload, channel management (needed to add videos to a playlist and to read your scheduled releases) and read-only analytics. If your token predates the playlist and schedule features, run this once more. The refresh token is stored locally at `.secrets/youtube-token.json`.

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
--playlist=<title>|none
```

## Show presets and the daily schedule

The Studio fields you would otherwise click on every video live in the show profile's `youtube` block (`shows/<id>.json`), so the owner's decision is made once and written down. PokePulses:

| Preset | Value |
| --- | --- |
| Category | Entertainment (`24`) |
| Paid promotion | No |
| Altered content ("AI use") | No |
| Audience | Yes, made for kids |
| Playlist | Pokemon Fun Facts (found by title, created if missing) |
| Release | 07:00 every day, `Africa/Cairo` |

`--made-for-kids` and `--playlist` override a preset for one upload. The made-for-kids and altered-content answers are legal declarations the channel owner makes; they are not inferred from the content.

One release a day, filling the next free slot:

```bash
npm run youtube:upload -- charmander-004 --schedule=next
```

`--schedule=next` reads the channel's already scheduled videos, takes the first day without a release (gaps first, then the day after the last one) whose 07:00 is still at least 15 minutes away, and uploads as private with that `publishAt`. Check the slot first with `--dry-run`. For an exact time, use `--publish-at=<ISO>` instead.

After the upload the video is added to the playlist. If that step fails the upload still stands: a warning says so, and the receipt records the error.

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
- **Trends:** once five episodes have numbers, the report also shows how each lever correlates with completion. That is the evidence for retuning the director's defaults (#25).

## Shorts

There is no separate Shorts upload API. Upload the existing 9:16 MP4 normally; YouTube determines Shorts presentation from the uploaded video. Do not add black bars.

## API-project note

Google states that uploads from unverified API projects created after July 28, 2020 are restricted to private viewing until the project passes YouTube's API compliance audit. The private review pipeline still works; public automation may require that audit.
