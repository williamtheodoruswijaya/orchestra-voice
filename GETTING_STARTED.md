# Getting Started

This project is a Discord music bot built with Node.js, TypeScript, Discord.js, and `@discordjs/voice`.

The most important product rule is that metadata and playback are separate concepts. YouTube and Spotify providers return track metadata. A track becomes playable only when a separate playable-source resolver resolves it into audio that the voice gateway can play.

The voice presence rule is intentional: this bot may stay online and connected to voice channels continuously. Idle auto-leave is not a default behavior in this repository. If it is ever added, it must be explicit, optional, per-guild configurable, and documented.

## Architecture

The codebase follows a Clean Architecture direction:

- `src/domain`
  Pure business rules and state models. Queue ordering, queue item state, and track metadata concepts live here. This layer must not import Discord SDKs, HTTP clients, provider APIs, or persistence details.

- `src/application`
  Use cases, services, and ports. This layer orchestrates queue behavior, search-session behavior, playback sequencing, and outbound interfaces such as voice gateways, queue repositories, and stream resolvers.

- `src/infrastructure`
  External adapters. Discord interaction handling, Discord voice playback, YouTube/Spotify provider adapters, stream resolver implementations, logging, and in-memory repositories live here.

- `src/app/bootstrap`
  Composition root only. Startup code creates concrete dependencies, wires playback-finished callbacks, registers Discord event handlers, and starts the bot.

Dependency direction should flow inward:

```text
app/bootstrap -> infrastructure -> application -> domain
```

Infrastructure can implement application ports. Domain should remain pure.

## Core Concepts

- `Track`
  A metadata result from a provider such as YouTube or Spotify.

- Selected track
  The result picked from the latest `/search` output for a guild. Selecting a track does not enqueue or play it by itself.

- `QueueItem`
  A per-guild item scheduled for playback. Queue items wrap track metadata plus request metadata.

- Playable source
  A resolved audio input such as a validated direct audio URL or a stream returned by an explicit resolver.

- Guild playback settings
  Per-guild comfort settings such as related-track autoplay mode and mood preset. Defaults are conservative: autoplay is off and mood is balanced.

## Provider Limits

YouTube search results are metadata. A YouTube watch page URL is not direct audio. Playback requires a resolver such as the current `yt-dlp` based path.

Spotify search results and Spotify track URLs are metadata. Spotify does not expose full-track audio streams for Discord bots. Spotify metadata can only be played when the resolver finds a separate playable source.

Direct audio URLs are treated as playable only after URL validation.

The UX should stay honest about this distinction. Do not document or implement YouTube/Spotify page URLs as directly playable audio.

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env` from `.env.example` and fill in the values needed for your workflow.

Required for running the bot:

```bash
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
```

Optional for metadata search:

```bash
YOUTUBE_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_MARKET=ID
```

Optional for playback resolving:

```bash
YT_DLP_PATH=
```

## Discord Bot Setup

1. Create an application in the Discord Developer Portal.
2. Create a bot user and copy the bot token into `DISCORD_TOKEN`.
3. Copy the application ID into `DISCORD_CLIENT_ID`.
4. Enable the bot permissions needed to join and speak in voice channels.
5. Invite the bot to your test server.
6. Copy your test server ID into `DISCORD_GUILD_ID`.
7. Register slash commands:

```bash
npm run register:commands
```

Run the bot locally:

```bash
npm run dev
```

## YouTube API Key

`YOUTUBE_API_KEY` is used for YouTube metadata search through `/search`.

To set it up:

1. Create or choose a Google Cloud project.
2. Enable the YouTube Data API v3.
3. Create an API key.
4. Put the key in `.env` as `YOUTUBE_API_KEY`.

This key is not what makes audio playable. It only powers metadata search.

## Spotify Credentials

Spotify metadata search uses client credentials:

1. Create an app in the Spotify Developer Dashboard.
2. Copy the client ID into `SPOTIFY_CLIENT_ID`.
3. Copy the client secret into `SPOTIFY_CLIENT_SECRET`.
4. Optionally set `SPOTIFY_MARKET`, for example `ID` or `US`.

Spotify credentials do not grant Discord-playable full-track audio.

## FFmpeg And yt-dlp

The project depends on `ffmpeg-static`, so contributors normally do not need to install FFmpeg separately.

Playback from metadata currently relies on `yt-dlp` being available:

```bash
pip install -U yt-dlp
```

If `yt-dlp` is not on `PATH`, set `YT_DLP_PATH` to the executable path.

## Commands

- `/search query:<text> provider:<all|youtube|spotify>`
  Searches metadata and stores the latest results per guild.

- `/pick number:<n>`
  Selects a metadata result from the latest search. It does not play or enqueue by itself.

- `/selected`
  Shows the selected metadata result and the playback limitation note for its provider.

- `/enqueue`
  Adds the selected track to the per-guild queue. If nothing is currently playing, playback starts. If something is already playing, the new item waits its turn.

- `/queue`
  Shows current playback state and upcoming queue items.

- `/nowplaying`
  Shows the current queue item.

- `/skip`
  Skips the current item and starts the next queued item when available.

- `/clearqueue`
  Clears upcoming items without interrupting the current item.

- `/remove position:<n>`
  Removes an upcoming item by 1-based position.

- `/pause` and `/resume`
  Pauses or resumes current playback.

- `/play query:<text-or-url>`
  Resolves a playable source from text or URL input. If the player is idle, playback starts immediately. If something is already playing, the resolved item is added to the upcoming queue without interrupting the current item.

- `/autoplay mode:<status|off|related>`
  Shows or changes related-track continuation for this guild. The default is `off`.

- `/mood preset:<status|balanced|focus|chill|upbeat>`
  Shows or changes the per-guild mood preset used as a small ranking signal for related-track suggestions.

- `/stop`
  Stops current playback state but keeps upcoming queue items.

- `/leave`
  Leaves the voice channel and stops playback state.

## Queue Behavior

Queue state is scoped per guild.

Enqueueing while idle starts playback immediately. Enqueueing while already playing does not interrupt the current item. `/play` follows the same comfort rule for active playback: it resolves the requested source and queues it instead of replacing the current song.

When a track finishes naturally, the voice gateway notifies the application layer and the next queued item starts automatically.

If the queue is empty and `/autoplay mode:related` is enabled, the application searches metadata providers for a related candidate using deterministic scoring. The scorer uses normalized title similarity, token overlap, artist/channel overlap, provider match, and a small mood bonus. The candidate still has to go through the playable-source resolver before playback. If resolving or playback fails, the candidate remains recoverable at the front of the queue.

If autoplay is off or no strong related candidate exists, playback becomes idle and the bot may remain connected. It does not auto-leave by default.

Playback failure rollback is deterministic. If an item is promoted to current and source resolution or voice playback fails, that item is restored to the front of the upcoming queue.

`/clearqueue` only clears upcoming items. It does not stop the current track.

`/remove` only removes upcoming items. It cannot remove the currently playing item; use `/skip` or `/stop` for that.

## Tests

Run all tests:

```bash
npm test
```

Run the TypeScript typecheck:

```bash
npm run typecheck
```

Build the project:

```bash
npm run build
```

The tests focus on domain and application behavior, including queue order, enqueue behavior, autoplay advancement, skip, clear, remove, and search-session selection.

Additional coverage protects rollback on resolver and voice playback failure, `/play` queue-while-playing semantics, related-track scoring, guild autoplay settings, and mood isolation.

## CI

GitHub Actions runs:

```bash
npm ci
npm run typecheck
npm run build
npm test
```

All checks must pass before a change is considered ready.

## Contribution Workflow

1. Read `AGENTS.md` before significant changes.
2. Keep domain logic free of Discord SDK and HTTP details.
3. Add application or domain tests for queue and playback behavior changes.
4. Preserve the metadata-versus-playable-source distinction in code, docs, tests, and UX.
5. Run typecheck, build, and tests before opening a pull request.

## Review Checklist

- Metadata providers do not pretend to return playable audio.
- Queue commands do not silently interrupt current playback.
- `/play` starts immediately only when idle and appends when playback is already active.
- `/enqueue` appends selected metadata and does not interrupt current playback.
- Related-track autoplay remains opt-in per guild.
- Idle auto-leave is not introduced as a default behavior.
- Discord handlers call application use cases instead of owning business logic.
- New commands are registered and documented.
- Tests cover meaningful behavior rather than placeholders.
- CI fails on typecheck, build, or test failures.
