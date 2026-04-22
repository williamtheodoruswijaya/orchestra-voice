---
name: deployment-runtime
description: Use this skill when working on startup entrypoints, long-running hosting environments, runtime compatibility, environment variables, deployment docs, or Node/TypeScript startup behavior.
---

# Purpose

This skill governs runtime and deployment safety for `orchestra-voice`.

Use this skill whenever the task involves:

- startup commands
- runtime entrypoint changes
- tsx/ts-node/build output behavior
- hosting on Pterodactyl, VPS, containers, or similar long-running environments
- Node.js version expectations
- environment variable handling
- FFmpeg/runtime prerequisites

# Core rules

1. Keep runtime entrypoint explicit.
   - Do not assume build artifacts exist unless the build step is guaranteed.
   - Do not assume source `.ts` files exist in deployed environments unless that path is intentional.

2. Keep one documented startup model.
   - source-run with `tsx`, or
   - build-run from `dist`
   - do not leave startup assumptions half-mixed

3. Document runtime expectations clearly.
   - required Node version
   - whether FFmpeg is required
   - required env vars
   - expected working directory and entrypoint

4. Long-running bot behavior is intentional.
   - this bot is meant to stay online 24/7
   - it may stay in voice channels continuously
   - do not add default idle auto-leave

5. Environment variables must be documented and safe.
   - keep `.env.example` complete
   - never commit secrets
   - handle missing env vars clearly

# Preferred verification

For deployment-related changes, verify:

- startup command matches real file paths
- package scripts still work
- runtime version expectations are documented
- source-run vs build-run is unambiguous

# Documentation requirements

If runtime behavior changes, update:

- `GETTING_STARTED.md`
- `README.md`
- `.env.example`

Include:

- Node version
- install/build/start flow
- FFmpeg requirements
- hosting notes for persistent bot runtime

# Anti-patterns to avoid

Do not:

- assume host filesystem matches local dev blindly
- assume build output paths without checking
- leave startup commands undocumented
- introduce host-specific hacks without docs
