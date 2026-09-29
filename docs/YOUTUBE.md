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

## Shorts

There is no separate Shorts upload API. Upload the existing 9:16 MP4 normally; YouTube determines Shorts presentation from the uploaded video. Do not add black bars.

## API-project note

Google states that uploads from unverified API projects created after July 28, 2020 are restricted to private viewing until the project passes YouTube's API compliance audit. The private review pipeline still works; public automation may require that audit.
