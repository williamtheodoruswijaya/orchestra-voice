# Getting Started — orchestra-voice

A Discord music bot that loops through a per-server queue automatically.
Built with Node.js, TypeScript, `discord.js`, `@discordjs/voice`, and `yt-dlp`.

---

## What this bot does

Users add tracks to a per-guild queue using `/play` or `/enqueue`.
The bot plays each track in order. When one finishes, the next starts automatically.
The bot stays in the voice channel until told to leave.

**The central rule:** `/play` always enqueues. It never interrupts the current song.

---

## Metadata vs. playable audio — read this first

This is the most important architectural concept in the codebase.

| Source | What the bot gets | Can it play directly? |
|---|---|---|
| `/search` with YouTube | Track metadata (title, URL, duration) | No |
| `/search` with Spotify | Track metadata | No |
| YouTube watch URL | Metadata | No |
| Spotify track URL | Metadata | No |
| `yt-dlp` resolver | An actual audio stream URL | Yes |
| Direct `.mp3` URL | Raw audio | Yes (after validation) |

**YouTube and Spotify give you metadata. `yt-dlp` turns that into audio.**

A YouTube watch page URL passed directly to the voice player will not work.
Every track goes through `yt-dlp` at the moment it becomes current in the queue.
This step is called resolution. Resolution is deferred — it happens when the
track starts, not when it is enqueued.

---

## Architecture

```
src/
├── domain/               Pure business rules — no Discord, no HTTP
│   ├── entities/         GuildQueue, QueueItem, Track, GuildPlaybackSettings
│   └── services/         RelatedTrackScorer (pure scoring logic)
│
├── application/          Orchestration — no Discord objects
│   ├── services/         PlaybackQueueService, RelatedTrackService
│   └── ports/            IVoiceGateway, IQueueRepository, ISearchProvider
│
├── infrastructure/       External adapters — Discord, providers, voice
│   ├── discord/          Slash command handlers, embed builders
│   ├── voice/            DiscordVoiceGateway (wraps @discordjs/voice)
│   └── providers/        YouTubeProvider, SpotifyProvider, YtDlpResolver
│
└── app/bootstrap/        Startup and dependency wiring only
    ├── index.ts          Entry point
    └── register-commands.ts
```

Dependency direction: `bootstrap → infrastructure → application → domain`

Domain must never import Discord SDK, HTTP clients, or provider APIs.
Application must never contain raw Discord interaction objects.
Business logic must never live in `index.ts` or command handlers.

---

## Queue behavior

```
Bot is idle → /play "song A"  → resolves → starts playing A immediately
              /play "song B"  → appends B  → A still playing
              /play "song C"  → appends C  → A still playing
A ends naturally              → bot auto-advances → plays B
B ends naturally              → bot auto-advances → plays C
C ends naturally, queue empty → bot stays in channel, idle
```

Key behaviors:
- `/play` enqueues. Never interrupts.
- Auto-advance fires on the voice player's `idle` event (not a timer).
- `/skip` forces advance — ignores loop mode.
- `/loop` replays current item instead of advancing when it ends.
- `/loop scope:queue` restarts from track 1 after the last track finishes.
- Track loop takes priority if both track loop and queue loop are enabled.
- `/stop` stops audio but keeps upcoming queue items.
- `/clearqueue` removes upcoming items, current track keeps playing, and queue loop turns off.
- Bot never auto-leaves on idle.

---

## Local setup

**Requirements:**
- Node.js 20 or newer
- `yt-dlp` available on PATH (or set `YT_DLP_PATH`)
- A Discord bot token

**Step 1 — Install dependencies:**
```bash
npm install
```

**Step 2 — Create `.env`:**
```bash
cp .env.example .env
```

Fill in at minimum:
```
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_test_server_id
```

**Step 3 — Install yt-dlp:**
```bash
pip install -U yt-dlp
# or download binary from https://github.com/yt-dlp/yt-dlp/releases
```

If yt-dlp is not on PATH, set `YT_DLP_PATH=/path/to/yt-dlp` in `.env`.

**Step 4 — Register slash commands:**
```bash
npm run register:commands
```

Run this once, or again any time you add or change commands.

**Step 5 — Start the bot:**
```bash
npm run dev
```

---

## Discord bot setup

1. Go to https://discord.com/developers/applications
2. Create a new application
3. Go to "Bot" → create a bot user → copy the token
4. Set `DISCORD_TOKEN` in `.env`
5. Copy the Application ID → set `DISCORD_CLIENT_ID`
6. Invite the bot to your server with `applications.commands` and voice permissions
7. Copy your server ID → set `DISCORD_GUILD_ID`
8. Run `npm run register:commands`

---

## YouTube API key setup

Used for `/search` with YouTube provider and for expanding YouTube playlist URLs.

1. Go to https://console.cloud.google.com
2. Create or open a project
3. Enable "YouTube Data API v3"
4. Create an API key under "Credentials"
5. Set `YOUTUBE_API_KEY` in `.env`

Without this key: `/search provider:youtube` fails gracefully.
`/play` with direct YouTube URLs still works through `yt-dlp`.

---

## Spotify credentials setup

Used for `/search provider:spotify`. Spotify metadata only — not audio.

1. Go to https://developer.spotify.com/dashboard
2. Create an app
3. Copy Client ID → `SPOTIFY_CLIENT_ID`
4. Copy Client Secret → `SPOTIFY_CLIENT_SECRET`
5. Set `SPOTIFY_MARKET` to your region code (e.g. `ID` for Indonesia, `US`)

Spotify tracks found by search go through `yt-dlp` for actual playback.
Spotify does not provide full-track audio streams for Discord bots.

---

## All environment variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot authentication |
| `DISCORD_CLIENT_ID` | Yes (register) | For slash command registration |
| `DISCORD_GUILD_ID` | Yes (register) | Target guild for commands |
| `YOUTUBE_API_KEY` | No | YouTube search and playlist expansion |
| `SPOTIFY_CLIENT_ID` | No | Spotify metadata search |
| `SPOTIFY_CLIENT_SECRET` | No | Spotify metadata search |
| `SPOTIFY_MARKET` | No | Spotify region (default: `ID`) |
| `YT_DLP_PATH` | No | Path to yt-dlp binary if not on PATH |
| `DISCORD_VOICE_DEBUG` | No | `true` for verbose voice logs |

---

## Commands

| Command | Description |
|---|---|
| `/play query:<text-or-url>` | Enqueue a track or playlist. Starts playback if idle. Never interrupts. |
| `/search query:<text> provider:<all\|youtube\|spotify>` | Search metadata and store results for `/pick` |
| `/pick number:<1-10>` | Select a result from the latest `/search` |
| `/selected` | Show the currently selected track |
| `/enqueue` | Add selected track to queue without interrupting |
| `/queue` | Show current and upcoming queue state |
| `/nowplaying` | Show the current track |
| `/loop` | Toggle repeat for the current track |
| `/loop scope:queue` | Toggle queue loop for the current queue |
| `/skip` | Skip current track, advance to next |
| `/clearqueue` | Remove upcoming tracks (current keeps playing) |
| `/remove position:<n>` | Remove upcoming track at position N |
| `/pause` | Pause current playback |
| `/resume` | Resume paused playback |
| `/autoplay mode:<status\|off\|related>` | Configure related-track continuation |
| `/mood preset:<status\|balanced\|focus\|chill\|upbeat>` | Set mood for autoplay scoring |
| `/stop` | Stop current playback (upcoming queue preserved) |
| `/join` | Join your voice channel |
| `/leave` | Leave the voice channel |

---

## Running tests

```bash
npm test           # run all tests with vitest
npm run test:coverage # run coverage for domain/application thresholds
npm run typecheck  # tsc --noEmit — zero errors required
npm run build      # compile TypeScript
```

Tests focus on domain and application behavior:
- Enqueue while idle → starts playback
- Enqueue while playing → appends without interrupting
- Queue order preservation
- Auto-advance to next item
- Skip behavior
- Clear queue
- Queue loop wrap, skip, clear, stop, leave, and track-loop priority behavior
- Remove valid/invalid position
- Rollback on resolver failure
- Search session and selected track per guild
- Empty state behavior

---

## CI

GitHub Actions runs on every push and pull request:

```yaml
- npm ci
- npm run typecheck
- npm run build
- npm run test:coverage
```

All four must pass. PRs cannot merge with failing CI. Coverage is enforced for
`src/domain` and `src/application`.

---

## Production / Docker

Build:
```bash
npm run build
npm start   # runs node dist/app/bootstrap/index.js
```

With Docker:
```bash
docker build -t orchestra-voice .
docker run -e DISCORD_TOKEN=... -e DISCORD_CLIENT_ID=... orchestra-voice
```

The Dockerfile installs `ffmpeg` and `yt-dlp` automatically.
`ffmpeg-static` is included in npm deps so local dev doesn't need system FFmpeg.

---

## Contribution guide

Before any significant change:
1. Read `AGENTS.md`
2. Read the relevant skill in `.agents/skills/`
3. Trace the current code path end-to-end
4. Write a short implementation plan

Architecture rules:
- Domain stays pure — no SDK imports, no HTTP
- Business logic goes in use cases, not command handlers
- Discord interaction objects stay in infrastructure
- Queue logic goes in `GuildQueue` entity and `PlaybackQueueService`

PR checklist:
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run test:coverage` passes
- [ ] Docs updated if behavior changed
- [ ] No new dead imports or commented-out code
- [ ] Metadata/playable-source boundary preserved

---

## Skill files reference

The `.agents/skills/` directory contains detailed implementation guides:

| Skill | When to read it |
|---|---|
| `playback-semantics.md` | `/play`, queue loop, auto-advance, rollback |
| `autoplay-related.md` | Related track continuation, mood, cooldown |
| `voice-comfort.md` | Embeds, UX, same-channel validation, empty states |
| `provider-resilience.md` | Provider failures, yt-dlp errors, backoff |
| `deployment-runtime.md` | Env vars, Docker, CI, npm scripts |
| `docs-and-onboarding.md` | Updating README, GETTING_STARTED, .env.example |
