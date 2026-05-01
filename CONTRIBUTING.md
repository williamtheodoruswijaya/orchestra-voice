# Contributing to orchestra-voice

## Before you start

Read `AGENTS.md`. It contains the architectural rules, the queue loop contract,
and the playback truth that all contributions must preserve.

Read the relevant skill file in `.agents/skills/` for the area you are changing.

## Setup

```bash
npm install
cp .env.example .env   # fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
pip install -U yt-dlp
npm run register:commands
npm run dev
```

## Making changes

1. Read the relevant skill file.
2. Trace the current code path end-to-end before editing.
3. Write a short checklist of your planned changes.
4. Make one logical change at a time.
5. No dead imports, no commented-out code, no placeholder TODOs.

## The non-negotiables

- `/play` always enqueues. Never interrupts current playback.
- Metadata (YouTube/Spotify) is not audio. The resolver makes it audio.
- Domain layer never imports Discord SDK or HTTP clients.
- Business logic never lives in command handlers or `index.ts`.
- Bot never auto-leaves on idle (persistent voice presence is intentional).

## Testing

```bash
npm test           # vitest
npm run test:coverage # domain/application coverage thresholds
npm run typecheck  # zero TypeScript errors
npm run build      # must compile clean
```

Write tests for behavior changes. Prefer domain/application tests.
Do not write placeholder tests just for coverage.

## PR checklist

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run build` compiles cleanly
- [ ] `npm test` passes
- [ ] `npm run test:coverage` passes
- [ ] Docs updated if behavior or commands changed
- [ ] `.env.example` updated if new env vars added
- [ ] No dead imports, no commented-out code
- [ ] Metadata/playable-source distinction preserved
- [ ] Queue loop contract preserved (`/play` enqueues, never interrupts)

## CI

GitHub Actions runs `npm ci`, `npm run typecheck`, `npm run build`, and
`npm run test:coverage` on every PR. All must pass.
