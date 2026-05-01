# Skill: deployment-runtime

Read this skill before working on:
- `src/app/bootstrap/index.ts`
- `src/app/bootstrap/register-commands.ts`
- `Dockerfile`
- `.env` / `.env.example`
- CI workflow
- npm scripts
- Startup assumptions

---

## Two startup modes

| Mode | Command | Use case |
|---|---|---|
| Source-run | `npm run dev` | Local development |
| Build-run | `npm run build` then `npm start` | Production / Docker |

Production entrypoint: `node dist/app/bootstrap/index.js`

`npm start` runs that file. Do NOT run `npm start` before building.
The `dist/` folder must exist first.

---

## Required env vars

| Variable | Required | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot login |
| `DISCORD_CLIENT_ID` | Yes (for register) | Slash command registration |
| `DISCORD_GUILD_ID` | Yes (for register) | Guild-scoped command registration |
| `YOUTUBE_API_KEY` | No | YouTube metadata search, playlist expansion |
| `SPOTIFY_CLIENT_ID` | No | Spotify metadata search |
| `SPOTIFY_CLIENT_SECRET` | No | Spotify metadata search |
| `SPOTIFY_MARKET` | No | Spotify market region (e.g. `ID`, `US`) |
| `YT_DLP_PATH` | No | Path to yt-dlp if not on system PATH |
| `DISCORD_VOICE_DEBUG` | No | `true` for verbose voice state logs |

The bot starts and runs without YouTube/Spotify credentials.
`/search` with those providers will degrade gracefully.
yt-dlp must be available for any audio playback.

---

## yt-dlp installation

Option 1 — pip:
```bash
pip install -U yt-dlp
```

Option 2 — download binary:
Download from https://github.com/yt-dlp/yt-dlp/releases
Set `YT_DLP_PATH=/path/to/yt-dlp` in `.env`

The `ffmpeg-static` npm package provides FFmpeg.
A separate system FFmpeg install is not required.

---

## Slash command registration

Commands are registered per-guild (for fast iteration during development):
```bash
npm run register:commands
```

This uses `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID`.
Run it once after adding or changing slash commands.
Do not run it on every bot startup — it has API rate limits.

---

## Bootstrap file rules

`src/app/bootstrap/index.ts` must only:
- Load env vars (`dotenv`)
- Instantiate concrete dependencies
- Wire ports and adapters together
- Register Discord event handlers
- Start the client
- Wire the voice idle callback to `PlaybackQueueService.handleTrackFinished`

It must NOT contain:
- Business logic
- Queue manipulation
- Provider API calls
- Embed construction

If a bootstrap file grows beyond wiring and startup, extract the logic
into a use case or service.

---

## Docker

The Dockerfile should:
1. Use Node 22 LTS
2. Copy source, install deps (`npm ci`)
3. Build TypeScript (`npm run build`)
4. Install `ffmpeg` and `yt-dlp` system-wide
5. Start with `npm run start`
6. Receive env vars at runtime (not baked into image)

Example Dockerfile structure:
```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN apt-get update && apt-get install -y ffmpeg python3-pip
RUN pip3 install -U yt-dlp
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Do not hardcode `DISCORD_TOKEN` in the image. Use `docker run -e` or
environment files at runtime.

---

## CI workflow (GitHub Actions)

The CI file lives at `.github/workflows/ci.yml`.

Required checks in order:
```yaml
- name: Install
  run: npm ci
- name: Typecheck
  run: npm run typecheck
- name: Build
  run: npm run build
- name: Test
  run: npm test
```

All checks must pass before a PR is considered ready.
CI does not run `npm run dev` or `npm run register:commands`.

---

## Long-running host checklist

1. Node.js 20 or newer
2. Run from repo root (`.env` must be resolvable)
3. `npm ci` (not `npm install` — locked deps)
4. `npm run build`
5. `npm run start`
6. `yt-dlp` on PATH or `YT_DLP_PATH` set
7. Process manager recommended (PM2, systemd, Docker)

The bot is designed for 24/7 uptime. It does not need restart on idle.

---

## npm scripts reference

| Script | Command |
|---|---|
| `dev` | `tsx src/app/bootstrap/index.ts` |
| `typecheck` | `tsc --noEmit` |
| `build` | `tsc` |
| `start` | `node dist/app/bootstrap/index.js` |
| `test` | `vitest` |
| `register:commands` | `tsx src/app/bootstrap/register-commands.ts` |

If any of these are missing from `package.json`, add them — CI depends on all of them.
