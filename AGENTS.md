# AGENTS.md — orchestra-voice

## What this repo is

A Discord music bot built with Node.js and TypeScript.
Stack: `discord.js`, `@discordjs/voice`, `yt-dlp`, `ffmpeg-static`.

The bot joins a voice channel, resolves audio through `yt-dlp`, and plays
through a per-guild queue that loops automatically until the queue is empty
or the user stops it.

---

## The one rule that overrides everything else

> **`/play` always enqueues. It never interrupts the current song.**

If something is playing, `/play` appends to the queue.
If nothing is playing, `/play` starts immediately from queue position 1.
The queue advances automatically when each item finishes.
This is the central product behavior. Do not change it.

---

## Architecture layers

| Layer | Path | Allowed to import | Must NOT import |
|---|---|---|---|
| Domain | `src/domain` | nothing external | Discord SDK, HTTP, DB |
| Application | `src/application` | domain, ports | Discord SDK, raw HTTP |
| Infrastructure | `src/infrastructure` | application, domain, SDKs | nothing inward-violating |
| Bootstrap | `src/app/bootstrap` | everything | business logic |

Dependency arrow: `bootstrap → infrastructure → application → domain`

Never put queue logic in a slash-command handler.
Never put Discord objects in domain entities.
Never put HTTP calls in the domain layer.

---

## Core concepts — use these exact names in code

| Concept | What it is |
|---|---|
| `Track` | Metadata returned by a search provider (title, url, duration, provider) |
| `QueueItem` | An item scheduled for playback — wraps a `Track` plus request metadata |
| `PlayableSource` | A resolved audio stream/URL that `@discordjs/voice` can actually play |
| `GuildQueue` | Per-guild ordered list of `QueueItem` plus playback state |
| `SearchSession` | Ephemeral per-guild list of `Track` results from `/search` |
| `SelectedTrack` | The track a user picked from a `SearchSession` |

A `Track` is **not** a `PlayableSource`. A YouTube watch URL is not audio.
Resolution happens through `yt-dlp` at the moment an item becomes current.

---

## Queue loop behavior — authoritative spec

```
User: /play "lo-fi beats"
Bot:  [idle]  → resolves → plays item 1
Bot:  [item 1 ends] → auto-advances → plays item 2
Bot:  [item 2 ends] → auto-advances → plays item 3
...
Bot:  [queue empty] → stays in channel, waits
```

```
User: /play "song A"           → queue: [A]  → plays A immediately
User: /play "song B"           → queue: [A, B]  → A still playing
User: /play "song C"           → queue: [A, B, C]  → A still playing
Bot:  [A ends]                 → plays B
Bot:  [B ends]                 → plays C
Bot:  [C ends, queue empty]    → idle, stays connected
```

- The queue is a flat ordered list. No shuffle by default.
- Loop mode (`/loop`) replays the current item instead of advancing.
- `/skip` forces advance to next item, regardless of loop mode.
- `/clearqueue` removes upcoming items without stopping the current item.
- `/stop` stops current playback but preserves upcoming queue items.
- Bot never auto-leaves on idle by default.

---

## Playback truth — non-negotiable

| Input | Is it audio? |
|---|---|
| YouTube watch URL | No — metadata only |
| Spotify track URL | No — metadata only |
| Direct `.mp3` / audio URL | Yes — after URL validation |
| Text search query | No — must be resolved by yt-dlp |

`yt-dlp` is the resolver. It turns a YouTube URL or search query into a
stream that `@discordjs/voice` can consume via `createAudioResource`.

Never claim YouTube/Spotify page URLs produce direct audio.
Never skip the resolver step.

---

## Voice presence rule

The bot is designed for 24/7 presence. It may stay connected continuously.

- Do NOT add idle auto-leave as a default behavior.
- If auto-leave is ever added: it must be opt-in, per-guild, documented.
- Prefer keeping the bot present and silent over auto-leaving.

---

## Provider reliability rule

Providers fail. Design for it.

- YouTube quota exhaustion → degrade gracefully, log clearly, keep bot alive
- Spotify restrictions → explain limitation to user, do not fake playback
- yt-dlp failure → rollback `QueueItem` to front of queue, tell user
- Any provider failure → never crash the bot, never corrupt queue state

Apply cooldown/backoff when providers fail repeatedly.
Do not retry the same failing call in a tight loop.

---

## Autoplay rule

Autoplay is opt-in per guild (`/autoplay mode:related`). Default is `off`.

When autoplay is on and queue empties:
1. Search for a related track using the scoring function
2. Resolve the candidate through yt-dlp
3. If resolution fails → stop cleanly, stay in channel
4. Never loop forever searching for a candidate
5. Never auto-leave after a failed autoplay attempt

Autoplay candidates still go through the full resolver path.
Metadata-only results are never queued as fake audio.

---

## Skill routing — read the right skill before working in an area

| Area | Skill file |
|---|---|
| `/play`, `/enqueue`, `/skip`, queue loop | `.agents/skills/playback-semantics.md` |
| Autoplay, related-track scoring, mood | `.agents/skills/autoplay-related.md` |
| Voice UX, embeds, same-channel checks | `.agents/skills/voice-comfort.md` |
| Provider failures, quota, cooldown | `.agents/skills/provider-resilience.md` |
| Startup, env vars, Docker, hosting | `.agents/skills/deployment-runtime.md` |
| Docs, README, GETTING_STARTED | `.agents/skills/docs-and-onboarding.md` |

**Before making a significant change, read the relevant skill file.**
The skills contain patterns, anti-patterns, and implementation constraints
specific to this codebase.

---

## Working rules

Before editing anything:
1. Read the relevant skill file.
2. Trace the current code path end-to-end.
3. Write a short checklist of your planned edits.
4. Confirm you are not violating a layer boundary.

During editing:
- One logical change at a time.
- No dead imports, no commented-out code.
- No placeholder TODOs for work you are not doing.
- Prefer small focused files over god-objects.

After editing:
- `npm run typecheck` must pass.
- `npm run build` must pass.
- `npm test` must pass.
- Update docs if behavior changed.

---

## Code style

- TypeScript strict mode — preserve or improve it.
- Explicit types at architecture boundaries.
- Functions named by behavior, not by type (`enqueueTrack`, not `trackHandler`).
- User-facing error messages: calm, honest, helpful.
- Internal logs: diagnostic and specific (`pino` logger).
- No magic strings — use constants or enums at boundaries.

---

## Test expectations

Write meaningful tests for:
- Queue add while idle → starts playback
- Queue add while playing → appends, does not interrupt
- Queue order preservation
- Auto-advance to next item when current finishes
- Skip behavior
- Clear queue behavior
- Remove valid/invalid position
- Rollback on resolver failure
- Search session / selected track persistence per guild
- Empty state behavior (empty queue, no search results)

Do not write placeholder tests just for coverage.
Prefer domain/application tests over Discord SDK integration tests.

---

## Definition of done

A task is done when:
- The implementation matches the requested behavior
- Architecture boundaries are intact
- `typecheck`, `build`, and `test` all pass
- Docs are updated where behavior changed
- The change is reviewable without reverse-engineering intent

---

## Verification commands

```bash
npm install              # install deps
npm run dev              # run bot (source mode)
npm run register:commands # register slash commands with Discord
npm run typecheck        # tsc --noEmit
npm run build            # compile TypeScript
npm start                # run compiled bot
npm test                 # run vitest
```
