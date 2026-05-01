# Skill: autoplay-related

Read this skill before working on:
- `/autoplay` command
- `/mood` command
- Related-track continuation logic
- `RelatedTrackScorer` or equivalent
- Provider cooldown during autoplay

---

## Autoplay is opt-in

Default per guild: `off`.
Users enable it with `/autoplay mode:related`.
The bot must never search for related tracks unless explicitly enabled.

---

## When autoplay triggers

Autoplay runs only when ALL of these are true:
1. The queue just became empty (the last item finished naturally)
2. `autoplay.mode` for this guild is `related`
3. No provider is on cooldown that would block all candidates

It does NOT run after:
- `/skip` to an empty queue (user-initiated, user can add more)
- `/stop`
- `/clearqueue` that empties everything
- `/leave`

---

## The autoplay flow (bounded)

```
queue empties naturally
  → check autoplay enabled
  → pick seed track (last played item's metadata)
  → query providers for related candidates (max 1 round of calls)
  → score candidates
  → pick top candidate above threshold
  → resolve through yt-dlp
    → success: enqueue and play
    → failure: log, stay idle, do NOT retry
  → if no candidate above threshold: stay idle
  → if all providers on cooldown: stay idle
```

This flow runs exactly once per queue-empty event.
It does not loop, retry, or chain into another autoplay call.

---

## Related track scoring

Score each candidate on these dimensions:

| Signal | Weight | Notes |
|---|---|---|
| Title token overlap with seed | high | normalized, lowercased |
| Artist / channel overlap | high | exact match preferred |
| Provider match | medium | prefer same provider as seed |
| Mood bonus | low | from guild mood preset |
| Duration proximity | low | within 60s of seed duration |

Reject candidates with score below threshold (e.g. 0.3).
If no candidate clears threshold, stay idle — do not pick a random result.

The scorer lives in `src/domain` or `src/application`. It must not contain
HTTP calls or Discord SDK references.

---

## Mood presets

Mood is a per-guild setting changed with `/mood preset:<value>`.

| Preset | Effect on scoring |
|---|---|
| `balanced` | No modifier (default) |
| `focus` | Prefer instrumental, longer duration |
| `chill` | Prefer slower-tempo keywords |
| `upbeat` | Prefer higher-tempo keywords |

Mood only adjusts scoring weights slightly. It is not a hard filter.
It must not change which providers are called.

---

## Cooldown behavior

After a provider call fails (quota, 403, network):
- Set a per-provider cooldown (e.g. 5 minutes for quota errors)
- During cooldown, skip that provider for all calls (autoplay and search)
- Log the cooldown start and expected expiry
- After expiry, allow the provider to be called again

Cooldown must not block all providers simultaneously from separate failures.
Each provider has its own cooldown timer.

---

## What NOT to do

- Do NOT chain autoplay calls — one attempt per queue-empty event
- Do NOT fake a related track by picking a random search result
- Do NOT enqueue a candidate before yt-dlp resolves it successfully
- Do NOT run autoplay when user explicitly stopped/skipped to empty
- Do NOT let mood affect which providers are queried
- Do NOT crash the bot if a provider is unavailable

---

## Files likely involved

| File | Purpose |
|---|---|
| `src/domain/entities/GuildPlaybackSettings.ts` | Autoplay mode, mood preset per guild |
| `src/application/services/RelatedTrackService.ts` | Autoplay orchestration |
| `src/domain/services/RelatedTrackScorer.ts` | Pure scoring logic |
| `src/infrastructure/discord/commands/autoplay.ts` | Discord handler |
| `src/infrastructure/discord/commands/mood.ts` | Discord handler |
| `src/application/ports/ISearchProvider.ts` | Provider interface |
