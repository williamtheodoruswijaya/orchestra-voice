---
name: autoplay-related
description: Use this skill when implementing or modifying related-track suggestion, autoplay continuation, track similarity scoring, or guild-level autoplay settings.
---

# Purpose

This skill governs "related track" continuation in `orchestra-voice`.

Use this skill whenever the task involves:

- autoplay after queue ends
- suggested next track behavior
- track similarity scoring
- related-track recommendation
- autoplay configuration per guild
- mood-aware recommendation behavior

This repository should prefer deterministic, maintainable recommendation logic over heavy ML or vector systems unless there is a strong justification.

# Core rules

1. Respect provider truth.
   - YouTube and Spotify are metadata/search providers unless the repository has an explicit playable-source resolver path.
   - Do not pretend that a suggested related track is automatically playable.

2. Related-track logic should be explainable.
   - Prefer simple, deterministic heuristics:
     - normalized title similarity
     - token overlap
     - artist/channel overlap
     - Levenshtein-style similarity
     - provider-aware bonuses
   - Avoid unnecessary embeddings/vector databases for the first implementation.

3. Autoplay should be configurable per guild.
   - Suggested commands:
     - `/autoplay on`
     - `/autoplay off`
     - `/autoplay status`

4. If a related track is metadata-only:
   - do not fake playback
   - either suggest it honestly
   - or store it as a recommendation / up-next suggestion
   - make UX explicit

# Recommended design

Preferred concepts:

- `RelatedTrackFinder`
- `TrackSimilarityScorer`
- `GuildAutoplaySettings`
- `RelatedTrackSuggestion`
- `RecentPlaybackHistory` if needed

Preferred flow:

1. current track ends naturally
2. queue is empty
3. autoplay is checked for the guild
4. related-track finder looks for best candidate
5. if candidate is playable through an explicit resolver path, continue playback
6. otherwise, surface the recommendation honestly

# Similarity guidance

Prefer a weighted scoring approach using simple features.

Candidate signals:

- normalized title string similarity
- token overlap
- artist exact match or partial match
- provider match bonus
- penalties for noisy variants such as:
  - official video
  - lyric video
  - live
  - remaster
  - sped up
  - slowed
  - reverb

Recommended preprocessing:

- lowercase
- trim punctuation noise
- remove common non-musical modifiers
- normalize repeated whitespace

# Mood-aware extension

If mood features exist, related-track suggestions may adapt by mood:

- `focus`
- `chill`
- `upbeat`

But keep the implementation simple and testable.
Mood should influence ranking, not replace the core similarity model.

# Testing requirements

Changes in this area should include tests for:

- exact-title similarity
- partial-title similarity
- artist bonus behavior
- noisy title normalization
- no-candidate case
- autoplay enabled vs disabled
- guild-level setting isolation
- suggestion behavior when a track is metadata-only
- suggestion behavior when a playable source exists

# Documentation requirements

If autoplay-related behavior changes:

- update `GETTING_STARTED.md`
- document `/autoplay` commands
- document whether related suggestions are auto-played or only recommended
- document provider limitations clearly

# Anti-patterns to avoid

Do not:

- fake direct playback from unsupported provider page URLs
- use opaque recommendation logic that is hard to test
- make related-track behavior unpredictable
- silently enqueue metadata-only tracks as if they were guaranteed playable
