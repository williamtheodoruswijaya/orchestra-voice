---
name: docs-and-onboarding
description: Use this skill when updating contributor docs, setup docs, architecture docs, README, env examples, or onboarding material for the repository.
---

# Purpose

This skill governs documentation and contributor onboarding in `orchestra-voice`.

Use this skill whenever the task involves:

- `GETTING_STARTED.md`
- `README.md`
- `.env.example`
- architecture explanation
- setup instructions
- command usage docs
- provider setup docs
- CI/testing documentation
- contribution guidance

The main goal is to make the repository understandable to a new contributor without requiring them to reverse-engineer the entire codebase.

# Core rules

1. Keep docs aligned with reality.
   - Do not document features that do not exist.
   - Do not imply direct YouTube/Spotify playback if the repository only supports metadata/search for those providers.

2. Keep setup steps explicit and reproducible.
   - document required Node version
   - document FFmpeg requirements
   - document Discord app/bot setup
   - document YouTube API key setup
   - document Spotify client credentials setup
   - document how to register slash commands
   - document how to run tests

3. Explain architecture clearly.
   - describe the responsibility of each major folder
   - explain dependency direction
   - explain how Discord handlers map into application use cases and infrastructure adapters
   - explain the distinction between metadata tracks and playable sources

4. Keep contributor guidance practical.
   - include scripts to run
   - include testing expectations
   - include CI expectations
   - include guidance on where new code should go

# Required documentation topics

When updating docs, ensure the following are clear if relevant:

- project overview
- architecture overview
- setup prerequisites
- local development flow
- environment variables
- command registration
- running the bot
- testing and CI
- provider limitations
- queue semantics
- `/play` vs `/enqueue`
- `/search`, `/pick`, `/selected`
- autoplay-related behavior
- comfort features and guild settings

# `.env.example` expectations

If new environment variables are introduced:

- add them to `.env.example`
- keep names consistent with actual code
- do not put real secrets in the example file

# Documentation style

Prefer:

- concrete examples
- short command snippets
- clear folder maps
- explicit caveats
- contributor-oriented tone

Avoid:

- vague architecture claims
- hand-wavy setup instructions
- outdated examples
- undocumented assumptions

# Testing requirements

If docs describe test commands, verify that:

- the command exists in `package.json`
- the described flow still works

# Anti-patterns to avoid

Do not:

- let `GETTING_STARTED.md` drift from the actual repo
- omit provider limitations
- document unsupported playback behavior as if it works
- forget to update docs when commands or env vars change
