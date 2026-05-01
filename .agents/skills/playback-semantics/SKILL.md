# Skill: playback-semantics

Read this skill before working on:
- `/play` command
- `/enqueue` command
- `/skip`, `/stop`, `/pause`, `/resume`, `/loop`
- `GuildQueue` entity
- `PlaybackQueueService` or equivalent
- Voice gateway playback callbacks
- Autoplay advancement

---

## The invariant

`/play` always enqueues. It never interrupts the currently playing item.

This is not a UX preference. It is the product contract.
Any code path that stops or restarts current audio during `/play` is a bug.

---

## Queue state machine

```
IDLE ──[enqueue]──► PLAYING
PLAYING ──[item ends naturally]──► PLAYING  (if queue has next)
PLAYING ──[item ends naturally]──► IDLE     (if queue is empty, autoplay off)
PLAYING ──[item ends naturally]──► PLAYING  (if autoplay finds candidate)
PLAYING ──[/skip]──────────────► PLAYING  (if queue has next)
PLAYING ──[/skip]──────────────► IDLE     (if queue is empty)
PLAYING ──[/loop enabled, item ends]──► PLAYING  (replays current)
PLAYING ──[/stop]──────────────► IDLE     (upcoming items preserved)
PLAYING ──[/clearqueue]────────► PLAYING  (current continues, upcoming cleared)
```

---

## `/play` exact behavior

```
/play query:<text-or-url>
```

1. Validate user is in a voice channel → reject if not
2. Join user's voice channel if bot is not already connected
3. Resolve the query:
   - If it is a YouTube playlist URL → expand to ordered `Track[]` via YouTube provider
   - Otherwise → pass to yt-dlp resolver to get a `PlayableSource`
4. Wrap resolved items as `QueueItem[]`
5. Append all items to the guild's queue
6. If bot was IDLE → start playback of item 1 immediately
7. If bot was PLAYING → items wait in queue
8. Reply with embed showing: title, provider, queue position, "now playing" or "added at #N"

Step 3 happens for each playlist entry only when that entry becomes current,
not all at once upfront. Playlist metadata is fetched upfront; stream
resolution is deferred.

**Never call skip/stop/interrupt during step 6 when already PLAYING.**

---

## `/enqueue` exact behavior

```
/enqueue
```

1. Check that a `SelectedTrack` exists for this guild → reject if not
2. Wrap `SelectedTrack` as `QueueItem`
3. Append to guild queue
4. If IDLE → start playback
5. If PLAYING → item waits
6. Reply with embed: title, queue position

`/enqueue` does not call the resolver. Resolution is deferred until the
item becomes current. This preserves the metadata/playable-source boundary.

---

## Auto-advance (the loop engine)

This is the mechanism that makes the queue loop through automatically.

When the voice gateway fires the `idle` event (current audio finished):

```typescript
// Pseudo-code — implement in the bootstrap callback or PlaybackQueueService
onVoiceIdle(guildId: string) {
  const next = queue.advance(guildId);   // pops next QueueItem
  if (next) {
    playItem(guildId, next);             // resolves + plays
  } else if (autoplay.isEnabled(guildId)) {
    tryAutoplay(guildId);               // bounded, safe
  }
  // else: remain idle, stay in channel
}
```

`queue.advance()` must:
- Remove the now-finished item from current position
- Promote the next upcoming item to current
- Return the new current item, or null if queue is empty
- If loop mode is ON → return the same item again instead of advancing

The `idle` event from `@discordjs/voice` is the trigger.
Do not poll. Do not use `setTimeout` to fake advancement.

---

## Rollback on failure

If `playItem` fails (yt-dlp error, network failure, voice error):

1. Put the failed item back at the front of upcoming queue
2. Emit an error embed to the text channel
3. Do NOT try to play it again automatically
4. Leave the bot in IDLE state
5. User can retry with `/play` or `/skip`

This prevents silent skips and infinite retry loops.

---

## `/skip` exact behavior

```
/skip
```

1. Validate user is in same channel as bot → reject if not
2. Stop current audio immediately (call `audioPlayer.stop()`)
3. This triggers the `idle` event → auto-advance fires
4. If loop mode is ON → skip ignores loop, forces advance
5. Reply: "Skipped. Now playing: <next title>" or "Queue is now empty"

Do not manually call the next-item logic from the skip handler.
Let the `idle` event callback handle it — that is the single source of truth.

---

## `/loop` exact behavior

```
/loop
```

1. Toggle loop mode for this guild (store in guild settings)
2. If enabling → "Loop ON: current track will repeat"
3. If disabling → "Loop OFF: queue will advance normally"

When loop is ON and current item ends:
- `queue.advance()` returns the same current item again
- The resolver is called again on the same item
- The track plays again from the start

Loop does not affect upcoming items in the queue.
`/skip` always breaks loop and forces advance.

---

## Voice gateway wiring (bootstrap)

The `idle` callback must be wired in the composition root:

```typescript
// src/app/bootstrap/index.ts — approximate structure
voiceGateway.onIdle((guildId) => {
  playbackQueueService.handleTrackFinished(guildId);
});
```

`handleTrackFinished` is in the application layer. It calls domain queue
methods and then delegates actual playback to the voice gateway port.
Business logic never lives in the bootstrap file.

---

## What NOT to do

- Do NOT interrupt current playback during `/play`
- Do NOT resolve all playlist streams upfront — defer to playback time
- Do NOT poll the audio player state — use events
- Do NOT call `skip` internally from `/play`
- Do NOT set current item to null without setting the next one atomically
- Do NOT let queue state and voice player state drift apart
- Do NOT swallow errors silently during playback — always rollback and report

---

## Embed spec for `/play` success

```
🎵 Added to Queue
─────────────────────────────
Title:    Lofi Hip Hop Radio
Provider: YouTube
Position: #3 in queue

Currently playing: Chill Beats Mix
```

If queue was idle and item starts immediately:

```
▶️ Now Playing
─────────────────────────────
Title:    Lofi Hip Hop Radio
Provider: YouTube
```

---

## Files likely involved

| File | Purpose |
|---|---|
| `src/domain/entities/GuildQueue.ts` | Queue state, advance(), loop logic |
| `src/application/services/PlaybackQueueService.ts` | Orchestration, handleTrackFinished |
| `src/application/ports/IVoiceGateway.ts` | Voice playback interface |
| `src/infrastructure/discord/commands/play.ts` | Discord handler for /play |
| `src/infrastructure/discord/commands/enqueue.ts` | Discord handler for /enqueue |
| `src/infrastructure/voice/DiscordVoiceGateway.ts` | Voice player, idle event |
| `src/app/bootstrap/index.ts` | Wires idle callback |
