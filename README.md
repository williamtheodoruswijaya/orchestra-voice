# Orchestra Voice

A Discord music bot that can join a voice channel, search music metadata, and manage a per-server playback queue.

Supported metadata providers:

- YouTube search metadata
- Spotify search metadata

Supported playback paths:

- Direct playable audio URLs after URL validation
- YouTube or Spotify metadata only when an explicit playable-source resolver can resolve audio through `yt-dlp`
- Plain search text through the configured resolver

YouTube watch pages and Spotify track pages are not treated as direct audio. Spotify does not expose full-track audio streams for Discord bots, so Spotify links are metadata first and require a separate playable-source resolver.

The bot is designed for persistent voice presence and does not auto-leave on idle by default.

Provider failures are expected operational states. Spotify account or market restrictions, YouTube quota exhaustion, missing credentials, rate limits, and upstream outages are classified and cooled down so related autoplay does not retry the same failing path on every queue end.

## Requirements

- Node.js 20 or newer
- A Discord bot token with slash commands enabled
- `yt-dlp` installed and available on `PATH`, or configured with `YT_DLP_PATH`

The project uses `ffmpeg-static`, so a separate system ffmpeg install is not required for normal playback.

## Runtime model

Local source-run development uses:

```bash
npm run dev
```

Long-running deployments should build first and then run the compiled entrypoint:

```bash
npm run build
npm start
```

`npm start` runs `node dist/app/bootstrap/index.js`. The Dockerfile follows this build-run model and installs `yt-dlp` in the image. If your host does not provide `yt-dlp` on `PATH`, set `YT_DLP_PATH`.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in the Discord values:

```bash
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
```

3. Optional provider credentials:

```bash
YOUTUBE_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_MARKET=ID
```

`YOUTUBE_API_KEY` is used by `/search`. `/play` can still resolve YouTube URLs and search text through `yt-dlp` when playback starts.

4. Register guild slash commands:

```bash
npm run register:commands
```

5. Start the bot:

```bash
npm run dev
```

For production-like hosting, use `npm run build` followed by `npm start` instead.

## Commands

- `/join` joins your current voice channel.
- `/play query:<text-or-url>` joins your voice channel and starts playback from a resolver-supported source when idle. If something is already playing, the resolved item is added to the queue without interrupting the current track.
- `/search query:<text> provider:<all|youtube|spotify>` stores search results for the server.
- `/pick number:<1-10>` selects a result from the latest `/search`.
- `/selected` shows the currently selected track.
- `/enqueue` adds the selected track to the queue without interrupting current playback.
- `/queue` shows the current and upcoming queue state, with up to 20 upcoming items rendered safely across multiple embed fields.
- `/nowplaying` shows the current track.
- `/skip` skips the current track.
- `/clearqueue` clears upcoming tracks without stopping the current track.
- `/remove position:<n>` removes an upcoming queued track.
- `/pause` pauses playback.
- `/resume` resumes playback.
- `/autoplay mode:<status|off|related>` controls opt-in related-track continuation per server.
- `/mood preset:<status|balanced|focus|chill|upbeat>` sets a lightweight mood preset for related suggestions.
- `/stop` stops playback.
- `/leave` leaves the voice channel.

Command responses are public in the server so everyone in the channel can see who queued or skipped tracks.

For deeper setup and architecture notes, see `GETTING_STARTED.md`.

## yt-dlp

Install `yt-dlp` with one of these options:

```bash
pip install -U yt-dlp
```

or download the executable from the [yt-dlp releases page](https://github.com/yt-dlp/yt-dlp/releases) and set:

```bash
YT_DLP_PATH=C:\path\to\yt-dlp.exe
```

## Autoplay and provider failures

Related autoplay is opt-in per server and bounded to one lookup/continuation attempt for the queue-end transition. If providers are unavailable or on cooldown, continuation stops cleanly and the bot may remain connected to the voice channel.

Autoplay distinguishes no related candidate, provider unavailable, provider on cooldown, metadata-only suggestion, playback failure, and playable continuation. Metadata-only suggestions are not queued as fake audio.
