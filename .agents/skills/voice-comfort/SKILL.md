---
name: voice-comfort
description: Use this skill when implementing or modifying features that make the bot feel more pleasant, calm, and supportive inside voice channels without sacrificing maintainability.
---

# Purpose

This skill governs "voice comfort" behavior in `orchestra-voice`.

Use this skill whenever the task involves:

- reducing noisy UX
- making the bot feel calm and helpful in voice channels
- channel politeness
- ambience / mood behavior
- queue-ended messaging
- comfort presets
- staying in voice channels without being disruptive

Important product truth:

- This bot is intended to stay online 24/7
- It may stay in a voice channel continuously
- Do NOT implement idle auto-leave as a default comfort behavior

# Core rules

1. Do not auto-leave on idle by default.
   - The bot is allowed to remain connected in voice channels for long periods.
   - Idle cleanup should not be treated as a primary comfort feature in this repository.
   - If ever introduced, it must be explicit, optional, and not the default.

2. Comfort means "pleasant and non-disruptive", not "chatty".
   - Prefer low-noise UX.
   - Avoid spamming text channels with unnecessary updates.

3. Favor ephemeral or minimal responses where appropriate.
   - Public messages should be reserved for meaningful events:
     - now playing
     - queue ended
     - autoplay suggestion
     - major playback state changes
   - Do not flood channels with repetitive acknowledgements.

4. Channel politeness matters.
   - Validate whether the user is in the same voice channel as the bot for playback-control actions when appropriate.
   - Give clear, friendly messages when they are not.

5. Comfort features should remain maintainable.
   - Do not add gimmicks.
   - Do not turn the bot into a social chatbot unless the feature clearly supports the voice experience.

# Recommended comfort features

Good candidate features:

- low-noise mode
- calm queue-ended messages
- helpful "now playing" embed formatting
- gentle autoplay suggestion embeds
- mood presets that influence recommendation ranking
- same-channel validation UX
- "ambient continuation" behavior when queue ends
- reduced public messaging unless important

# Mood / ambience guidance

If implementing mood presets, keep them simple.

Suggested moods:

- `focus`
- `chill`
- `upbeat`

Mood can influence:

- related-track suggestion ranking
- embed tone / formatting
- autoplay behavior preferences

Mood should not radically alter architecture.
It should be a lightweight guild setting.

# UX messaging principles

Prefer messages like:

- "Added **Track Name** to queue at position #3."
- "Queue ended. Suggested next track: **...**"
- "You need to be in the same voice channel as the bot to use this command."

Avoid:

- vague "error occurred" replies
- overly chatty ambient messages
- multiple public messages for one logical event

# Architectural guidance

Comfort features should be implemented through:

- guild-level settings
- application use cases
- well-contained infrastructure formatting

Do not bury comfort policy in giant Discord handlers.

# Testing requirements

Voice-comfort changes should include tests where practical for:

- same-channel validation behavior
- mood setting persistence / isolation per guild
- low-noise setting behavior if implemented
- queue-ended suggestion behavior
- guild comfort setting defaults

# Documentation requirements

If comfort features are added or changed:

- update `GETTING_STARTED.md`
- document any new commands such as `/mood` or `/comfort`
- document that the bot is designed to stay online and may remain in voice channels

# Anti-patterns to avoid

Do not:

- add idle auto-leave as a default behavior
- spam text channels
- make comfort features overly magical or unpredictable
- add features that make the bot noisier without improving experience
