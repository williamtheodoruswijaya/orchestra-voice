# AGENTS.md

## Project overview

This repository contains a Discord music bot built with Node.js and TypeScript.

Current product goals:

- Clean Architecture
- Maintainable Discord bot command handling
- Good UX for search, selection, queueing, and playback
- Clear distinction between metadata providers and playable audio sources
- Reliable tests and CI

## Voice presence rule

This bot is intended to remain online 24/7 and may remain connected to a voice channel continuously.

Do not introduce idle auto-leave as a default behavior.

If an idle-leave feature is ever added:

- it must be optional
- it must be explicit
- it must be configurable per guild
- it must be documented clearly in contributor and user-facing docs

When improving voice comfort or UX, prefer:

- low-noise responses
- better queue-ended behavior
- mood or ambience features
- autoplay suggestions
- same-channel politeness
- clear playback state messaging

Do not assume “leave on idle” is a UX improvement in this repository.
Persistent voice presence is an intentional product behavior.

Important architectural truth:

- YouTube and Spotify integrations in this repo should be treated as metadata/search providers unless the code explicitly uses a separate playable audio source/resolver.
- Do not assume a YouTube watch page URL or Spotify track page URL is directly playable audio.
- Preserve this distinction in all changes.

## Architecture expectations

Prefer these dependency boundaries:

- `src/domain`
  - pure business logic only
  - entities, value objects, policies
  - no Discord SDK code
  - no fetch / HTTP calls
  - no persistence details

- `src/application`
  - use cases
  - ports / interfaces
  - orchestration logic
  - depends on domain and ports only

- `src/infrastructure`
  - Discord client and adapters
  - voice gateway implementation
  - provider adapters (YouTube / Spotify / direct resolver)
  - repository implementations
  - logging
  - external API access

- `src/app/bootstrap`
  - composition root
  - startup wiring
  - dependency assembly
  - command registration
  - no heavy business logic

When changing code:

- keep Discord-specific interaction objects near the boundary
- move business decisions into use cases
- avoid large god-functions in `index.ts`
- do not couple queue logic directly to slash-command parsing
- prefer cohesive small files over giant multi-purpose files

## Working rules

Before making significant changes:

1. Inspect the current code path end-to-end
2. Identify affected use cases, ports, and adapters
3. Make a short implementation plan
4. Keep changes incremental and easy to review

For non-trivial tasks:

- explain the intended change in a short checklist before editing
- avoid speculative rewrites
- preserve working behavior unless a change is intentional and justified

## Code style

- TypeScript strictness should be preserved or improved
- prefer explicit types at architecture boundaries
- keep functions focused and named by behavior
- prefer small use cases with clear input/output
- avoid magic strings when a type or constant is more appropriate
- keep error messages user-friendly at the Discord boundary
- keep internal logs diagnostic and specific

## Search and playback rules

This repo must preserve the distinction between:

- metadata tracks from search
- actually playable sources

Preferred concepts:

- `Track`: metadata result
- `SelectedTrack`: current chosen metadata result for a guild
- `QueueItem`: an item scheduled for playback
- `PlayableSource` or equivalent: a resolvable/playable audio input

If implementing queueing:

- queue is per guild
- adding a track must not interrupt the currently playing track unless the user explicitly skips
- playback should continue automatically to the next item when the current item finishes
- stop / leave should clean up state predictably

## Testing expectations

Every meaningful behavior change should come with tests where practical.

Prioritize tests for:

- use cases
- queue behavior
- repository behavior
- search session behavior
- playback sequencing logic
- empty-state and invalid-input behavior

Do not add placeholder tests just for coverage.

## Verification commands

Before considering a task done, run the relevant commands if available:

- install dependencies:
  - `npm install`

- run development bot:
  - `npm run dev`

- register slash commands:
  - `npm run register:commands`

- run tests:
  - `npm test`

- run build:
  - `npm run build`

If lint/typecheck scripts exist, run them too.

## Documentation expectations

If you add or significantly change behavior:

- update `GETTING_STARTED.md`
- update command documentation if needed
- document any new environment variables in `.env.example`
- document any new provider limitations or playback assumptions

## Contributor UX expectations

Favor improvements that make the bot easier to use and easier to understand:

- informative embeds
- clear queue feedback
- good empty-state messaging
- safe error messages
- consistent command naming
- minimal surprise in playback behavior

## Constraints

- do not hardcode secrets
- do not commit `.env`
- do not introduce hidden provider assumptions
- do not claim direct playback from unsupported metadata URLs unless the repo truly implements a compliant resolver path
- do not silently rewrite architecture boundaries just to “make it work”

## Definition of done

A task is done when:

- the implementation matches the requested behavior
- architecture boundaries remain understandable
- tests pass
- docs are updated where needed
- the change is reviewable by a human contributor without reverse-engineering intent
