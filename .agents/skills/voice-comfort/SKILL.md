# Skill: voice-comfort

Read this skill before working on:
- Voice channel join / leave validation
- Same-channel checks
- Embed design for any command
- Empty-state messaging
- Error messaging
- Playback state feedback

---

## Same-channel validation

Before any command that mutates playback state, validate:

```
1. Is the user in a voice channel?
   → No: reply "You need to be in a voice channel first." — stop
2. Is the bot in a voice channel?
   → No: join the user's channel, continue
3. Is the bot in a DIFFERENT voice channel than the user?
   → Yes: reply "I'm already playing in <#channelId>." — stop
```

Commands that require same-channel: `/skip`, `/stop`, `/pause`, `/resume`,
`/clearqueue`, `/remove`, `/loop`, `/leave`

Commands that join if needed: `/play`, `/enqueue` (if not yet connected)

Commands that don't need voice at all: `/search`, `/queue`, `/nowplaying`,
`/selected`, `/autoplay`, `/mood`

---

## Persistent voice presence

The bot stays in the voice channel when the queue empties.
It does NOT auto-leave.

Never add idle-triggered disconnect logic as a default.
If a timeout feature is ever added:
- Make it opt-in via guild setting
- Default must remain "stay connected"
- Document it explicitly

---

## Reply visibility

All command replies in a guild text channel should be public (not ephemeral),
so all users in the server can see queue changes.

Exceptions — use ephemeral for:
- Validation errors that are personal ("you're not in a voice channel")
- Errors that expose internal state only relevant to the requester

---

## Embed design guidelines

Every meaningful playback response uses a Discord embed, not a plain string.

**Now Playing embed:**
```
▶️ Now Playing                          [color: #5865F2 Discord blurple]
─────────────────────────────────────────
Title:     Lofi Hip Hop Radio - Beats to Study
Provider:  YouTube
Duration:  3:42
Requested: @username
Queue:     3 tracks remaining
```

**Added to Queue embed:**
```
🎵 Added to Queue                       [color: #57F287 Discord green]
─────────────────────────────────────────
Title:     Chill Beats Mix
Provider:  YouTube
Position:  #2 in queue
```

**Queue Display embed:**
```
📋 Queue — 4 tracks                     [color: #5865F2]
─────────────────────────────────────────
▶ 1. Lofi Hip Hop Radio       [YouTube]  3:42   ← current
   2. Chill Beats Mix         [YouTube]  4:10
   3. Study Music             [Spotify]  5:00
   4. Focus Flow              [YouTube]  2:55
```

**Error embed:**
```
❌ Error                                [color: #ED4245 Discord red]
─────────────────────────────────────────
Could not resolve audio for this track.
The track has been kept at the top of your queue.
```

**Empty state embed:**
```
📋 Queue is Empty                       [color: #99AAB5 gray]
─────────────────────────────────────────
Use /play or /enqueue to add tracks.
```

---

## Empty state handling

Every command must handle the empty state explicitly:

| Command | Empty state message |
|---|---|
| `/queue` | "The queue is empty. Use /play to add tracks." |
| `/nowplaying` | "Nothing is playing right now." |
| `/skip` | "Nothing is playing to skip." |
| `/clearqueue` | "The queue is already empty." |
| `/remove` | "No upcoming tracks to remove." |
| `/enqueue` | "No track selected. Use /search first." |
| `/selected` | "No track selected. Use /search first." |

---

## Provider limitation messaging

When a user selects a Spotify-only track that cannot be resolved:

```
⚠️ Metadata Only
─────────────────────────────────────────
This Spotify track cannot be played directly.
Spotify does not expose full-track audio for bots.

The resolver will attempt to find a matching audio source.
If it fails, the track will be returned to your queue.
```

Do not lie. Do not pretend it will work. Do not hide the limitation.

---

## Playback state indicators

Use consistent emoji prefixes:
- `▶️` — currently playing
- `⏸️` — paused
- `⏭️` — skipped
- `🎵` — added to queue / enqueued
- `📋` — queue display
- `✅` — success action
- `❌` — error
- `⚠️` — warning / limitation

---

## What NOT to do

- Do NOT use ephemeral for successful queue mutations
- Do NOT silently ignore voice channel mismatch
- Do NOT show raw error stack traces to users
- Do NOT use plain string replies for playback state changes
- Do NOT add unsolicited messages when the bot is idle
