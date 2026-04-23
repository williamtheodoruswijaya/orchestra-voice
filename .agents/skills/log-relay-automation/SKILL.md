---
name: log-relay-automation
description: Use this skill when implementing log ingestion, websocket relays, structured error events, automation triggers, and Codex-driven remediation workflows.
---

# Purpose

This skill governs the automation pipeline that turns runtime logs into safe, reviewable remediation work.

Use this skill whenever the task involves:

- websocket log ingestion
- log relays
- rolling log persistence
- structured error events
- error classification
- GitHub issue creation
- automation trigger payloads
- Codex remediation workflows
- branch/PR generation from observed failures

# Desired automation shape

Preferred flow:

1. ingest logs from a trusted relay/source
2. normalize logs
3. classify severity and error type
4. deduplicate repeated events
5. persist a structured incident record
6. trigger Codex automation with bounded context
7. Codex creates a branch and PR
8. CI acts as the safety gate

# Core rules

1. Do not rely on fragile browser-cookie scraping as the core automation model.
2. Prefer a relay/service you control for websocket ingestion.
3. Structured events are better than raw logs.
4. Deduplicate repeated errors aggressively.
5. Automation triggers must be bounded and reviewable.
6. Direct push to `master` is not the default.
7. Prefer branch + PR + CI.

# Recommended event model

Prefer a normalized incident shape such as:

- timestamp
- source
- guild/server if relevant
- error class
- severity
- summary
- raw excerpt
- fingerprint/hash
- occurrence count
- cooldown state
- recommended automation action

# Trigger guidance

Good triggers:

- startup crash
- missing runtime entrypoint
- provider 403 loops
- quota exceeded loops
- repeated unhandled rejections
- playback state loop regressions

Bad triggers:

- one-off warnings
- user misuse
- expected validation errors
- transient single-event noise

# Safety rules

Automation must not:

- create infinite patch loops
- open duplicate PRs for the same fingerprint repeatedly
- rewrite the branch strategy silently
- hide or discard critical context

# Testing requirements

If automation code is added, test:

- log classification
- deduplication
- cooldown behavior
- incident fingerprinting
- safe trigger gating

# Documentation requirements

Document:

- where logs come from
- how incidents are classified
- how Codex is triggered
- why branch + PR is preferred over direct push
