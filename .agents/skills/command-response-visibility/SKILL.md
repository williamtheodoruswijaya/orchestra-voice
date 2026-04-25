---
name: command-response-visibility
description: Use this skill when changing whether command responses are ephemeral, public, sent to a music channel, or suppressed to avoid self-visible/self-triggered bot behavior.
---

# Purpose

This skill governs response visibility and command feedback behavior in `orchestra-voice`.

Use this skill whenever the task involves:
- ephemeral responses
- public Discord replies
- music channel announcements
- command acknowledgement behavior
- avoiding bot self-display/self-triggering
- making UX less noisy
- Discord interaction response strategy

# Core rules

1. Use ephemeral replies for personal command feedback.
   Examples:
   - validation errors
   - permission/channel mismatch
   - "you need to join a voice channel"
   - command succeeded but only the requester needs to know

2. Use music channel public messages for shared playback events.
   Examples:
   - now playing
   - queue ended
   - corpus autoplay started
   - queue summary when explicitly requested publicly

3. Avoid duplicate feedback.
   If a command already updates the music channel, the interaction reply should be short and usually ephemeral.

4. Never process the bot's own messages.
   Bot-authored messages must be ignored in message handlers.

5. Do not leak internal errors publicly.
   Provider failures, stack traces, and debug messages belong in logs.
   User-facing errors should be concise and safe.

# Recommended visibility matrix

## Ephemeral
Use for:
- command acknowledgements
- validation failures
- permission failures
- same-channel mismatch
- "selected track saved"
- "autoplay mode changed"

## Public music channel
Use for:
- now playing
- queue started
- corpus autoplay started
- queue ended
- major state transition

## Logs only
Use for:
- stack traces
- provider quota errors
- Spotify account restriction errors
- websocket/log relay diagnostics
- internal retry/cooldown state

# Architecture rules

Preferred design:
- application layer returns response/announcement intent
- infrastructure layer maps that intent to Discord interaction or channel message
- domain layer must not know Discord visibility types

Useful concepts:
- `CommandResponse`
- `AnnouncementIntent`
- `ResponseVisibility`
- `MusicChannelAnnouncement`
- `UserFeedback`

# Testing requirements

Add/update tests for:
- ephemeral vs public response decisions
- no duplicate message decisions
- bot-authored messages ignored
- music-channel announcement routing
- low-noise response policy

# Documentation requirements

If response behavior changes:
- update command docs
- document which messages appear in music channel
- document low-noise mode if present
- document bot self-message ignore behavior

# Anti-patterns to avoid

Do not:
- make every command public
- put stack traces in Discord replies
- send duplicate interaction + channel messages with same content
- process bot messages as user commands
- put Discord response visibility logic deep in domain entities
