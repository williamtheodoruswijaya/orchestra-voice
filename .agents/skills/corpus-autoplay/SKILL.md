---
name: corpus-autoplay
description: Use this skill when implementing or modifying local corpus autoplay, corpus playlist behavior, corpus loop/stop/shuffle modes, or replacing external-provider autoplay with internally controlled audio sources.
---

# Purpose

This skill governs local/internal corpus autoplay behavior in `orchestra-voice`.

Use this skill whenever the task involves:
- autoplay when the user queue is empty
- local audio corpus playback
- corpus manifest loading
- corpus playback cursor
- corpus loop/stop/shuffle behavior
- avoiding YouTube/Spotify quota usage for idle/autoplay continuation
- separating metadata search from playable audio sources

# Product direction

Autoplay should not depend on external metadata providers such as YouTube or Spotify.

YouTube and Spotify may still be used for manual metadata search, but idle/autoplay continuation should prefer internal corpus audio that is already playable.

The goal is:
- stable 24/7 playback
- no unnecessary YouTube search quota usage
- no dependency on Spotify subscription/account restrictions
- predictable behavior when the queue ends

# Core rules

1. Corpus autoplay is the preferred idle/autoplay source.
   - Do not call YouTube search automatically every time a song ends.
   - Do not call Spotify search automatically every time a song ends.
   - Use local/internal corpus tracks when the user queue is empty.

2. Corpus tracks must be explicitly playable.
   - A corpus item should resolve to a local file path or direct playable URL.
   - Do not store YouTube watch URLs or Spotify track pages as playable corpus sources.

3. Queue has priority over corpus.
   - If user queue has items, play the queue first.
   - Corpus autoplay only runs when the queue is empty.

4. Bot must remain online and may remain in voice continuously.
   - Do not implement idle auto-leave as default behavior.
   - If corpus is exhausted and mode is stop, stay connected and quiet.

5. Corpus behavior must be per guild.
   - Each guild should have independent corpus cursor/settings if settings are persisted.

# Recommended corpus modes

Implement or preserve modes like:

- `off`
  - corpus autoplay disabled

- `corpus-stop`
  - play corpus tracks until the corpus ends
  - then stop continuation and stay idle

- `corpus-loop`
  - play corpus tracks sequentially
  - when corpus ends, restart from the beginning

- `corpus-shuffle`
  - pick corpus tracks randomly
  - avoid repeating the most recent tracks where practical

# Recommended commands

Good command candidates:
- `/autoplay mode:<off|corpus-stop|corpus-loop|corpus-shuffle>`
- `/autoplay status`
- `/corpus list`
- `/corpus status`
- `/corpus reload`
- `/corpus now`

Follow existing command style if the repo already has a pattern.

# Recommended data model

Prefer explicit concepts such as:
- `CorpusTrack`
- `CorpusSource`
- `CorpusManifest`
- `CorpusPlaybackCursor`
- `GuildCorpusSettings`
- `CorpusAutoplayService`

# Architecture rules

Keep corpus autoplay out of raw Discord handlers.

Preferred layering:
- Domain: corpus track model, corpus mode, cursor rules, shuffle/loop/stop policy
- Application: corpus autoplay orchestration, get next corpus track use case, update corpus settings use case
- Infrastructure: JSON corpus repository, local file resolver, direct URL resolver, Discord command handler, music-channel message adapter
- Bootstrap: dependency wiring only

# Playback order

Preferred playback priority:
1. explicit `/play`
2. user queue
3. corpus autoplay if enabled
4. idle/stay connected

# Testing requirements

Add or update tests for:
- queue item takes priority over corpus
- corpus-stop ends quietly when corpus is exhausted
- corpus-loop restarts from beginning
- corpus-shuffle avoids obvious immediate repeats
- corpus mode is isolated per guild
- invalid/missing corpus manifest is handled gracefully
- invalid corpus item source does not crash bot
- corpus playback failure does not corrupt queue state

# Documentation requirements

Update docs when corpus behavior changes:
- `GETTING_STARTED.md`
- `README.md`
- `.env.example` if paths/env vars are added

Document:
- corpus manifest format
- where audio files should be stored
- autoplay modes
- behavior when corpus ends
- that corpus autoplay avoids YouTube/Spotify quota usage

# Anti-patterns to avoid

Do not:
- use YouTube search for every idle/autoplay transition
- use Spotify search for every idle/autoplay transition
- treat metadata URLs as playable sources
- auto-leave voice when corpus ends
- hide corpus failures behind vague messages
- mix corpus cursor logic into Discord command parsing
