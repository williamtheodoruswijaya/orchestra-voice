# Skill: docs-and-onboarding

Read this skill before working on:
- `GETTING_STARTED.md`
- `README.md`
- `CONTRIBUTING.md`
- `.env.example`
- Any new command documentation
- Any architectural documentation

---

## When to update docs

| Change | Required doc update |
|---|---|
| New command added | `README.md` command list, `GETTING_STARTED.md` commands section |
| Command behavior changed | Both, plus review checklist in `GETTING_STARTED.md` |
| New env var added | `.env.example` with comment, `GETTING_STARTED.md` env section |
| Architecture boundary changed | `GETTING_STARTED.md` architecture section |
| New provider added | Provider limits section in `GETTING_STARTED.md` |
| New test coverage area | `GETTING_STARTED.md` tests section |

---

## README.md rules

Keep `README.md` short and scannable.

Must contain:
- One-line description
- Requirements (Node version, yt-dlp)
- Quick setup (4–6 steps max)
- All commands listed with one-line descriptions
- Link to `GETTING_STARTED.md` for deeper info

Must NOT contain:
- Full architecture explanation (that belongs in `GETTING_STARTED.md`)
- Full env var documentation (duplicate of `.env.example`)
- Code examples longer than 3 lines

---

## GETTING_STARTED.md rules

This is the contributor guide. It must answer:

1. What does this bot actually do?
2. What is metadata-only vs actually playable?
3. How does the queue work end-to-end?
4. How do I set up locally in under 10 minutes?
5. What env vars do I need and why?
6. How do I register slash commands?
7. How does the architecture layer? (diagram if helpful)
8. Where do specific behaviors live in the code?
9. How do I run tests? What do they cover?
10. What CI checks run?
11. What are the contributor rules I must follow?

---

## .env.example rules

Every env var must have a comment above it explaining:
- What it is used for
- Whether it is required or optional
- Side effects if it is missing

Example:
```bash
# Required to authenticate the bot with Discord.
DISCORD_TOKEN=

# Required only when running register:commands.
# Not needed for normal bot operation after commands are registered.
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=

# Optional. Used by /search for YouTube metadata and playlist expansion.
# If missing, YouTube search is unavailable. /play with direct URLs still works.
YOUTUBE_API_KEY=
```

Never add a var to `.env.example` without a comment.
Never commit actual values to `.env.example`.

---

## Architecture diagram template

When updating the architecture section of `GETTING_STARTED.md`:

```
Request flow:
Discord slash command
  → src/infrastructure/discord/commands/<command>.ts  (parse, validate)
  → src/application/services/<service>.ts             (orchestrate)
  → src/domain/entities/<entity>.ts                   (business rules)
  → src/infrastructure/voice/DiscordVoiceGateway.ts   (play audio)
  → @discordjs/voice                                  (audio player)

Dependency direction:
app/bootstrap → infrastructure → application → domain
```

---

## Playback truth documentation

Every version of `README.md` and `GETTING_STARTED.md` must include
a clear statement that:

1. YouTube metadata ≠ playable audio
2. Spotify metadata ≠ playable audio
3. yt-dlp is the resolver that makes playback possible
4. Direct audio URLs work after validation

Do not soften this. Do not imply Spotify tracks play natively.

---

## CONTRIBUTING.md must cover

- How to set up the dev environment
- How to run tests
- The architecture rules (link to `AGENTS.md`)
- The PR checklist (typecheck, build, test pass)
- The definition of done

---

## What NOT to do

- Do not document a feature that does not exist
- Do not leave stale command descriptions after a command is changed
- Do not document `/play` as interrupting current playback — it does not
- Do not claim Spotify or YouTube page URLs are directly playable
- Do not add env vars to `.env.example` without comments
