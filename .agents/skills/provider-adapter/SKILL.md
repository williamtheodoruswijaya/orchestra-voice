---
name: provider-adapter
description: Use this skill when implementing or modifying external provider integrations such as YouTube, Spotify, direct media sources, or future metadata/playback resolvers.
---

# Purpose

This skill guides work on provider adapters in `orchestra-voice`.

Use this skill whenever the task involves:

- YouTube search integration
- Spotify search integration
- direct media source handling
- metadata normalization
- external API calls
- future resolver work for playable sources
- provider-specific environment variables or auth

# Architectural truth

This repository must preserve the distinction between:

- metadata/search providers
- playable audio sources

Important:

- A YouTube watch page URL is not automatically a direct playable audio stream.
- A Spotify track page is not automatically a direct playable audio stream.
- Do not blur this distinction in code, docs, or UX.

Treat:

- YouTube Data API as metadata/search
- Spotify Web API as metadata/search
- direct audio URLs / explicitly resolvable sources as playback inputs

# Core rules

1. Normalize provider responses into internal models.
   - External API response shapes should not leak throughout the codebase.
   - Convert provider results into internal `Track` objects or similar internal models.

2. Keep provider code in infrastructure.
   - HTTP calls
   - auth/token handling
   - provider-specific response parsing
   - rate-limit/error interpretation

3. Keep application code provider-agnostic.
   - Use `MusicCatalogPort` or appropriate resolver ports
   - avoid hardcoding provider SDK logic in use cases

4. Handle provider credentials safely.
   - Never hardcode secrets
   - document required env vars
   - use `.env.example`
   - avoid logging secrets

5. Be explicit about provider limitations.
   - If a provider only supports metadata in this repo, document it clearly.
   - Do not create deceptive UX that implies unsupported playback behavior.

# Recommended adapter design

Use interfaces such as:

- `MusicCatalogPort` for metadata search
- `StreamResolverPort` for playable source resolution

Prefer internal models such as:

- `Track`
- `SelectedTrack`
- `QueueItem`
- `PlayableSource`

# Spotify guidance

For Spotify:

- use official Web API for metadata/search
- client credentials flow is appropriate for server-to-server metadata access
- cache tokens sensibly
- normalize title, artist, duration, artwork, external URL

Do not imply direct Spotify raw audio playback unless the repo truly implements a compliant path.

# YouTube guidance

For YouTube:

- use official Data API for metadata/search
- normalize title, channel, artwork, duration, URL
- consider `videos.list` for details like duration when needed

Do not imply that a YouTube watch page URL is directly playable audio.

# Error handling guidance

Provider errors should be:

- diagnostic in logs
- user-friendly in command responses

Examples:

- Good internal log: "Spotify token request failed: HTTP 401 ..."
- Good user message: "Spotify search is currently unavailable."
- Bad: dumping raw provider JSON to the user

# Testing requirements

When changing provider adapters, add tests for:

- mapping/parsing of provider responses
- auth/token cache behavior where practical
- empty result handling
- malformed response tolerance
- error translation behavior

Prefer mocking HTTP responses at the adapter boundary.

# Documentation requirements

If you add or change a provider:

- update `GETTING_STARTED.md`
- update `.env.example`
- document what the provider can and cannot do
- document required credentials and setup steps

# Anti-patterns to avoid

Do not:

- mix provider-specific response shapes into application/domain
- hide provider limitations
- couple metadata search directly to playback without an explicit resolver design
- log secrets
- add provider code without tests or setup documentation
