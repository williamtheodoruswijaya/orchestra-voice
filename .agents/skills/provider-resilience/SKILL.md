---
name: provider-resilience
description: Use this skill when working on external-provider failure handling, quota exhaustion, premium/account restrictions, fallback behavior, cooldowns, and preventing provider-related retry loops.
---

# Purpose

This skill governs resilience around external providers in `orchestra-voice`.

Use this skill whenever the task involves:

- YouTube API quota failures
- Spotify 403/account/subscription restrictions
- provider fallback logic
- cooldowns or retry suppression
- autoplay continuation safety
- repeated provider errors
- graceful degradation when metadata providers are unavailable

# Core rules

1. External providers are unreliable by default.
   - Treat quota, premium restrictions, credential problems, and outages as expected conditions.

2. Provider failures must not break the bot.
   - Do not crash the process.
   - Do not corrupt queue state.
   - Do not create infinite retry loops.

3. Repeated provider failures must be bounded.
   - Add cooldowns, backoff, or suppression windows.
   - Avoid spamming identical logs every time playback ends.

4. Distinguish failure types clearly.
   - no candidate
   - quota exceeded
   - premium/subscription restriction
   - credential missing
   - provider unavailable
   - metadata-only suggestion

5. Keep user-facing UX calm.
   - Good: "Autoplay suggestion is temporarily unavailable."
   - Bad: raw stack traces or noisy repeated notices.

# Recommended design

Prefer concepts such as:

- `ProviderErrorClassifier`
- `ProviderAvailabilityState`
- `ProviderCooldownState`
- `AutoplayContinuationResult`
- `RelatedTrackLookupResult`

Suggested behavior:

- classify provider errors
- store failure timestamps
- suppress retries during cooldown
- skip providers that are temporarily unavailable
- stop autoplay continuation cleanly if all providers are unavailable

# YouTube guidance

For quota exceeded:

- do not keep querying on every idle event
- set a cooldown
- log once per cooldown window
- let autoplay stop cleanly

# Spotify guidance

For 403/account restriction/premium failures:

- do not keep retrying immediately
- set a cooldown or provider-disabled state
- do not spam logs every track end

# Testing requirements

Add or update tests for:

- provider error classification
- quota exceeded behavior
- Spotify 403 restriction behavior
- cooldown suppression behavior
- autoplay stopping cleanly when providers are unavailable
- no infinite continuation loop
- fallback provider behavior if implemented

# Documentation requirements

If provider resilience changes:

- update `GETTING_STARTED.md`
- document provider limitations
- document cooldown/backoff behavior
- document autoplay degradation behavior

# Anti-patterns to avoid

Do not:

- retry failing providers endlessly
- spam identical logs
- fake direct playback from metadata URLs
- hide provider failure conditions behind vague errors
