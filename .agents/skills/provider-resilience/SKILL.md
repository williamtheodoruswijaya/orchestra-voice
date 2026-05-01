# Skill: provider-resilience

Read this skill before working on:
- YouTube provider adapter
- Spotify provider adapter
- yt-dlp resolver
- Cooldown / backoff logic
- Provider error handling
- Search failure UX

---

## Provider truth table

| Provider | What it gives you | What it cannot give you |
|---|---|---|
| YouTube Data API v3 | Track metadata, playlist items, search results | Playable audio stream |
| Spotify Web API | Track metadata, search results | Playable audio stream |
| yt-dlp | A playable audio stream URL from YouTube or search text | Nothing on private/geo-blocked videos |
| Direct audio URL | Playable if validated | N/A |

A YouTube watch URL passed directly to `@discordjs/voice` will not play.
It must go through yt-dlp first.

---

## Error classification

Classify provider errors before deciding how to respond:

| Error | Classification | Action |
|---|---|---|
| HTTP 403 Forbidden | `quota_or_auth` | Apply cooldown, notify user |
| HTTP 429 Too Many Requests | `rate_limit` | Apply short cooldown, retry once |
| HTTP 404 Not Found | `not_found` | Fail this item, no cooldown |
| Network timeout | `transient` | Retry once with backoff, then fail |
| yt-dlp non-zero exit | `resolver_error` | Rollback queue item, notify user |
| yt-dlp video unavailable | `not_available` | Rollback queue item, notify user |
| Missing API key | `config_error` | Log clearly, do not retry |
| Parsing error | `internal` | Log full error, fail safely |

---

## Cooldown behavior

Apply cooldown per provider, not globally:

```typescript
interface ProviderCooldown {
  provider: 'youtube' | 'spotify';
  reason: string;
  expiresAt: Date;
}
```

Recommended cooldown durations:
- Quota error (403): 5 minutes
- Rate limit (429): 60 seconds
- Repeated transient failures (3+): 2 minutes

During cooldown:
- Skip that provider for autoplay candidate search
- Skip that provider for `/search` if provider is specified
- Log a suppressed-call message (once per cooldown, not on every call)
- Do NOT throw an error that crashes the bot

Cooldown is per-process in-memory state. It resets on bot restart.

---

## yt-dlp resolver requirements

The resolver must:
1. Accept a YouTube URL or search query string
2. Spawn `yt-dlp` as a child process (or use the configured `YT_DLP_PATH`)
3. Extract the best audio-only stream URL from yt-dlp JSON output
4. Return a `PlayableSource` on success
5. Return a classified error on failure
6. Never block the event loop — use async child process handling

Do NOT pass yt-dlp output directly to `createAudioResource` without
validating that the stream URL is valid and non-empty.

---

## yt-dlp error patterns

| yt-dlp stderr contains | Classification |
|---|---|
| `Video unavailable` | `not_available` |
| `Private video` | `not_available` |
| `Sign in to confirm your age` | `not_available` |
| `HTTP Error 403` | `quota_or_auth` |
| `Premieres in` | `not_available` |
| `Unable to extract` | `resolver_error` |
| `command not found` / exit 127 | `config_error` — yt-dlp not installed |

Log the full stderr for `resolver_error` and `config_error`.
Only show user-friendly message to Discord.

---

## Bot survival rules

The bot must never crash due to a provider failure.

```typescript
// Every resolver call must be wrapped
try {
  const source = await resolver.resolve(item.track);
  await voiceGateway.play(guildId, source);
} catch (err) {
  logger.error({ err, guildId }, 'Resolver failed');
  queue.rollbackCurrent(guildId);
  await notifyChannel(guildId, buildErrorEmbed(err));
}
```

Queue rollback means: the failed item is put back at the front of upcoming
items. It is not silently dropped. The user sees what happened.

---

## Search failure UX

If `/search` fails:
```
⚠️ Search Unavailable
──────────────────────────────────
Could not reach YouTube at this time.
Try again in a moment, or use /play with a direct URL.
```

If zero results:
```
🔍 No Results
──────────────────────────────────
No tracks found for "your query".
Try different keywords.
```

Do NOT show stack traces. Do NOT expose API keys. Do NOT show HTTP status
codes to users (log them internally).

---

## Logging discipline

Good log (internal, diagnostic):
```
logger.error({ provider: 'youtube', status: 403, guildId }, 'YouTube quota exceeded, applying 5m cooldown');
```

Bad log (noisy, useless):
```
console.log('error');
console.error(err);
```

Use `pino` with structured fields. Log at `error` for failures, `warn` for
degraded states, `info` for normal lifecycle events, `debug` for verbose
tracing (off by default).

---

## What NOT to do

- Do NOT retry a quota-exhausted provider in a loop
- Do NOT fake playback from a metadata-only URL
- Do NOT swallow errors without rollback or user feedback
- Do NOT apply a global cooldown that blocks all providers when only one fails
- Do NOT log every suppressed-during-cooldown call (log once at cooldown start)
- Do NOT expose raw error messages or stack traces to Discord users
