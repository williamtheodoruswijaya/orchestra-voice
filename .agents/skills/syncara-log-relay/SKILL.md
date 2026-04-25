---
name: syncara-log-relay
description: Use this skill when implementing or modifying Syncara log ingestion, websocket consumption, log normalization, incident creation, or deduplication for production-runtime monitoring.
---

# Purpose

This skill governs how `orchestra-voice` consumes operational/runtime signals from Syncara.

Use this skill whenever the task involves:
- Syncara websocket ingestion
- parsing runtime logs
- turning raw log lines into structured events
- deduplicating recurring failures
- incident fingerprinting
- relay/proxy-based log collection
- preparing inputs for Codex remediation automation

# Source context

Known deployment source context:
- Panel URL: `https://panel.syncara.host/server/e8c9ec0a`
- WebSocket source: `wss://fenrir.syncara.host:8080/api/servers/e8c9ec0a-bc19-463f-a53c-d1584e5abc3b/ws`

These are observability inputs only.
Do not hardcode brittle browser-cookie or panel-session logic into the core bot runtime.

# Preferred architecture

Preferred flow:
1. consume Syncara events through a relay or normalized ingestion layer
2. parse raw log messages
3. classify severity and error category
4. fingerprint/deduplicate incidents
5. emit bounded structured incidents for downstream automation

# Recommended incident shape

Prefer a structure with fields like:
- `source`
- `timestamp`
- `serverId`
- `guildId` if derivable
- `severity`
- `errorClass`
- `summary`
- `fingerprint`
- `occurrenceCount`
- `cooldownUntil`
- `rawExcerpt`
- `recommendedAction`

# Core rules

1. Raw logs are not the final automation interface.
   - Convert them into structured incidents.

2. Deduplicate aggressively.
   - Repeated identical provider failures should not create repeated remediation tasks.

3. Bound incident creation.
   - Apply windows, suppression, or cooldowns to avoid spam.

4. Separate ingestion from remediation.
   - Log ingestion should not directly mutate source code or Git state.
   - It should produce normalized incident data.

5. Keep the bot online.
   - Observability logic must not destabilize playback or uptime.

# High-priority incident categories

Examples worth detecting:
- startup crash
- missing runtime entrypoint
- ffmpeg missing
- provider quota exceeded
- provider 403 subscription restriction
- autoplay retry loop
- unhandled rejection
- repeated voice-state failure loops

# Testing requirements

If this area is modified, add tests for:
- log parsing
- incident classification
- fingerprinting
- deduplication
- cooldown suppression
- bounded incident emission

# Anti-patterns to avoid

Do not:
- depend on brittle browser cookies as the core architecture
- open duplicate incidents endlessly
- emit remediation tasks directly from every raw log line
- tie relay logic tightly to Discord command handling
