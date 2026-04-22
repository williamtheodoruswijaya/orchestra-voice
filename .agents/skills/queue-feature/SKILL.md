---
name: queue-feature
description: Use this skill when implementing or modifying queue behavior, playback sequencing, skip logic, remove logic, clear queue behavior, or guild-scoped playback state in the Discord music bot.
---

# Purpose

This skill guides changes related to the playback queue in `orchestra-voice`.

Use this skill whenever the task involves:

- adding tracks to a queue
- changing autoplay behavior
- implementing skip, remove, clear queue, or now playing
- changing per-guild queue storage
- changing how the bot transitions from one track to the next
- changing how selected/search results become queue items
- improving queue UX or reliability

The main goal is to preserve a clean separation between:

- metadata search results
- selected tracks
- playable queue items
- active playback state

# Core rules

1. Queue is per guild.
   - Never use a single global queue for all guilds.
   - Queue state must be keyed by `guildId`.

2. Adding a new track must not interrupt the currently playing track.
   - New items go to the end of the queue by default.
   - Only explicit commands such as skip may interrupt playback.

3. Playback completion should trigger the next item automatically.
   - If the current track finishes naturally, the next queued track should start.
   - If the queue is empty, the player should end in a clean idle state.

4. Avoid putting queue logic directly in Discord interaction handlers.
   - Slash command handlers should validate input and call use cases.
   - Queue decisions belong in application/domain layers.

5. Maintain the distinction between:
   - `Track` = metadata result
   - `SelectedTrack` = user-picked metadata candidate
   - `QueueItem` = scheduled playback item
   - `PlayableSource` or equivalent = actual audio input used by playback

6. Error messages should be user-friendly.
   - Good: "The queue is empty."
   - Good: "There is nothing to skip."
   - Bad: leaking internal stack traces to users

# Recommended architecture

Prefer the following design:

- Domain:
  - queue entity or queue state model
  - pure queue policies
  - item ordering
  - optional loop/shuffle policies

- Application:
  - enqueue use case
  - dequeue / play next use case
  - skip use case
  - clear queue use case
  - remove queue item use case
  - get now playing use case
  - get queue display use case

- Infrastructure:
  - repository implementation for queue state
  - voice gateway implementation
  - Discord handlers/controllers

# Recommended commands

If adding or updating queue features, prefer consistent commands such as:

- `/queue`
- `/skip`
- `/clearqueue`
- `/remove number:<n>`
- `/nowplaying`
- optional:
  - `/pause`
  - `/resume`
  - `/shuffle`
  - `/loop`

If the repo already has a command naming pattern, follow the existing style.

# Testing requirements

Every queue-related change should add or update tests.

Prioritize tests for:

- enqueue into empty queue
- enqueue while another track is playing
- queue ordering
- skip behavior
- clear queue behavior
- remove specific item behavior
- autoplay next track behavior
- behavior when queue becomes empty
- behavior when skipping while nothing is playing
- behavior when removing invalid positions

Prefer unit tests for queue logic and application use cases.

# Documentation requirements

If queue semantics change:

- update `GETTING_STARTED.md`
- update command documentation if present
- clearly document whether selected tracks are automatically queued or only manually added

# Anti-patterns to avoid

Do not:

- store all queue logic in `index.ts`
- mix Discord SDK objects deeply into domain logic
- silently replace the currently playing track on normal enqueue
- confuse metadata selection with playable queue items
- add queue features without tests
