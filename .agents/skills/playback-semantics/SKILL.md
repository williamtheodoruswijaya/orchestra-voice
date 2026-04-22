---
name: playback-semantics
description: Use this skill when changing play-now behavior, enqueue behavior, skip behavior, playback transitions, rollback on playback failure, or queue-state transitions for guild playback.
---

# Purpose

This skill governs playback semantics in `orchestra-voice`.

Use this skill whenever the task involves:

- `/play`
- `/enqueue`
- `/skip`
- automatic transition to next track
- failure rollback when playback start fails
- current vs upcoming queue state
- immediate playback behavior
- preserving queue integrity

This repo must make playback behavior explicit, predictable, and testable.

# Core playback rules

1. `/enqueue` means "add to queue".
   - It must never interrupt the currently playing track.
   - It appends to upcoming items unless explicitly documented otherwise.

2. `/play` means "play now".
   - If idle, start immediately.
   - If already playing, interrupt current playback intentionally and make the newly requested item current immediately.
   - `/play` must not behave like `/enqueue`.

3. Queue integrity must be preserved.
   - No queue item should silently disappear due to transient resolver, voice, or playback errors.
   - If playback start fails, the failed item must remain recoverable.

4. Queue state must stay per guild.
   - Never mix playback state between guilds.

5. Current item and upcoming items must be modeled clearly.
   - State transitions should be obvious and easy to test.

# Recommended model

Prefer explicit concepts such as:

- `Track` = metadata result
- `QueueItem` = scheduled playback item
- `PlayableSource` = resolved playable source
- `GuildQueue` or `GuildPlaybackState`
- `current`
- `upcoming`

# Required semantic expectations

## `/play`

Preferred behavior:

- stop/interrupt current playback
- newly requested item becomes `current` immediately
- previously queued upcoming items remain queued unless explicitly documented otherwise

## `/enqueue`

Preferred behavior:

- if idle, start playback
- if already playing, append to upcoming
- do not interrupt current playback

## `/skip`

Preferred behavior:

- explicit user interrupt path
- move away from current item
- next item should become current if available
- if playback of next item fails, do not lose it silently

## autoplay / next-track transition

Preferred behavior:

- natural end of current track advances to next upcoming item
- if next playback fails, preserve queue integrity
- if queue is empty, remain in a clean idle state

# Failure rollback rules

Any time an item is moved into current before playback succeeds:

- if playback start fails
- do not silently lose that item

Preferred rollback strategy:

- restore the failed item to a recoverable queue position
- usually the front of upcoming is the safest default
- keep behavior deterministic and document it

Apply this consistently across:

- `playNow()`
- `advanceAfterCurrent()`
- `skip()`

# Architectural guidance

Keep playback semantics outside raw Discord handlers.

Preferred layering:

- Domain:
  - queue state and queue transitions
- Application:
  - playback orchestration
  - rollback rules
  - use cases / services
- Infrastructure:
  - voice gateway
  - Discord handler
  - resolvers and repositories

Do not push playback decision-making into `index.ts` or Discord interaction parsing.

# Testing requirements

Playback semantic changes must include or update tests for:

- `/play` when idle
- `/play` when already playing
- `/enqueue` while playing
- `/enqueue` while idle
- queue order preservation
- playback failure rollback
- skip rollback
- advance-after-current rollback
- guild isolation

Tests should verify behavior, not just implementation details.

# Anti-patterns to avoid

Do not:

- let `/play` accidentally start an older queued item first
- drop queue items on playback failure
- mix Discord SDK objects into pure queue logic
- make `/enqueue` behave like `/play`
- silently mutate queue order without documenting it
