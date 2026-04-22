# Orchestra Voice

A Discord music bot that can join a voice channel and play music from:

- YouTube URLs
- Spotify track URLs
- Plain song search text
- Direct audio URLs

Spotify does not expose full-track audio streams for Discord bots, so Spotify links are resolved through Spotify metadata and played from the closest YouTube result.

## Requirements

- Node.js 20 or newer
- A Discord bot token with slash commands enabled
- `yt-dlp` installed and available on `PATH`, or configured with `YT_DLP_PATH`

The project uses `ffmpeg-static`, so a separate system ffmpeg install is not required for normal playback.

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

`YOUTUBE_API_KEY` is used by `/search`. `/play` can still play YouTube URLs and search text through `yt-dlp`.

4. Register guild slash commands:

```bash
npm run register:commands
```

5. Start the bot:

```bash
npm run dev
```

## Commands

- `/join` joins your current voice channel.
- `/play query:<text-or-url>` joins your voice channel and plays a YouTube URL, Spotify track URL, direct audio URL, or YouTube search result.
- `/search query:<text> provider:<all|youtube|spotify>` stores search results for the server.
- `/pick number:<1-10>` picks and plays a result from the latest `/search`.
- `/selected` shows the currently selected track.
- `/stop` stops playback.
- `/leave` leaves the voice channel.

## yt-dlp

Install `yt-dlp` with one of these options:

```bash
pip install -U yt-dlp
```

or download the executable from the [yt-dlp releases page](https://github.com/yt-dlp/yt-dlp/releases) and set:

```bash
YT_DLP_PATH=C:\path\to\yt-dlp.exe
```
