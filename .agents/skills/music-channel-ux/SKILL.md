---
name: music-channel-ux
description: Use this skill when implementing or modifying messages sent to the dedicated music text channel, now-playing announcements, queue updates, playback status messages, or low-noise music UX.
---

# Purpose

This skill governs how `orchestra-voice` communicates music-related status to users.

Use this skill whenever the task involves:
- sending messages to a dedicated `music` text channel
- now playing announcements
- queue update messages
- corpus autoplay notifications
- autoplay status messages
- low-noise UX
- avoiding bot self-message loops
- preventing duplicate/spam messages

# Product direction

Music-related public messages should go to a dedicated music text channel when configured.

The bot should not spam the channel.
The bot should not respond to its own messages.
The bot should not display redundant messages only visible to itself.

# Core rules

1. Prefer a dedicated music channel for public music updates.
   - If a guild has a configured music channel, send public music updates there.
   - If no music channel is configured, fall back to the interaction channel only when safe and appropriate.

2. Slash command acknowledgements can remain ephemeral.
   - User-specific confirmations should usually be ephemeral.
   - Public channel messages should be reserved for meaningful music events.

3. Do not send messages to yourself or process your own messages.
   - Ignore bot-authored messages/events.
   - Avoid feedback loops where bot messages trigger bot logic.

4. Public music updates should be meaningful.
   Good public messages:
   - now playing
   - added to queue summary, if not too noisy
   - queue ended
   - corpus autoplay started
   - autoplay disabled/unavailable
   - major playback state changes

5. Message visibility must be intentional.
   - Ephemeral for user-specific command results
   - Public music channel for shared playback status
   - Logs for internal diagnostics

# Recommended commands

Good command candidates:
- `/musicchannel set channel:<channel>`
- `/musicchannel clear`
- `/musicchannel status`
- `/comfort lownoise:on|off`

Follow existing command style if already established.

# Recommended data model

Prefer explicit concepts:
- `GuildMusicChannelSettings`
- `MusicChannelPort`
- `MusicAnnouncementService`
- `PlaybackAnnouncement`
- `AnnouncementVisibility`
- `LowNoiseMode`

# Bot self-message rule

When handling Discord message events:
- ignore messages where `message.author.bot === true`
- never let bot messages trigger queue/search/playback commands
- do not parse bot's own public announcements as user input

When sending announcements:
- do not DM or target the bot itself
- do not create messages that only the bot can see
- avoid duplicate messages if an interaction already returned an equivalent public reply

# Testing requirements

Add or update tests for:
- music channel selection behavior
- fallback channel behavior
- low-noise suppression
- no duplicate announcement behavior
- bot-authored messages are ignored
- public vs ephemeral intent mapping
- queue/corpus announcements are generated at the right time

# Documentation requirements

If music channel UX changes:
- update `GETTING_STARTED.md`
- document `/musicchannel`
- document low-noise behavior
- document which messages are public vs ephemeral
- document that bot self-messages are ignored

# Anti-patterns to avoid

Do not:
- send all command responses publicly
- spam the music channel
- process bot-authored messages
- bury Discord channel lookup inside domain logic
- require a music channel for the bot to function
