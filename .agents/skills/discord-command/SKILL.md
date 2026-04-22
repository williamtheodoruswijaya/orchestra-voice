---
name: discord-command
description: Use this skill when adding, modifying, or refactoring Discord slash commands, interaction handlers, embeds, command registration, or command UX.
---

# Purpose

This skill guides the implementation of Discord commands in `orchestra-voice`.

Use this skill whenever the task involves:

- adding a slash command
- changing command options
- updating command registration
- improving Discord interaction handling
- changing embeds or command replies
- improving validation or user-facing command UX

# Core rules

1. Keep Discord-specific logic near the boundary.
   - Discord interaction objects belong in infrastructure/bootstrap layers.
   - Do not leak `interaction` objects into domain entities.

2. Use use cases for business behavior.
   - Command handlers should parse user input, validate context, and call application use cases.
   - Avoid large if/else chains with embedded business logic.

3. Use deferred replies for longer operations.
   - If a command may take longer than a quick response, prefer `deferReply(...)` followed by `editReply(...)`.
   - Avoid interaction timeout issues.

4. Prefer consistent user feedback.
   - Validate whether the command is being used in a guild if required.
   - Validate whether the user is in a voice channel when needed.
   - Validate whether the bot is already in a different voice channel when relevant.
   - Use clear, concise, actionable messages.

5. Prefer embeds for structured output.
   - Search results
   - queue views
   - selected track
   - now playing
   - error summaries when appropriate

6. Keep command naming consistent.
   - Follow the existing naming style already used in the repo.
   - Keep option names descriptive and stable.

# Recommended command implementation flow

For a new command:

1. Add slash command definition in the command registration layer
2. Add or update the corresponding handler/controller
3. Validate Discord-specific context
4. Call an application use case
5. Format the response for Discord
6. Add/update tests if the command changes behavior
7. Update contributor documentation if necessary

# UX expectations

Good command UX includes:

- predictable command names
- helpful descriptions
- clear empty-state handling
- queue position confirmation
- clean formatting
- not forcing users to copy internal IDs manually

Examples:

- Good: "Added **Track Name** to queue at position #3."
- Good: "You need to join a voice channel first."
- Good: "No saved search results yet. Run `/search` first."
- Bad: vague replies like "Error occurred."

# Testing requirements

When commands change, test at least the use case behavior they invoke.

If Discord-boundary testing is practical, test:

- command parsing behavior
- required option handling
- invalid input handling
- expected message formatting in key cases

But prefer stable tests against use cases instead of brittle SDK mock-heavy tests unless necessary.

# Documentation requirements

If you add or change commands:

- update `GETTING_STARTED.md`
- update `.env.example` if new env variables are introduced
- keep command usage examples current

# Anti-patterns to avoid

Do not:

- place all command logic in one huge bootstrap file
- tightly couple embed formatting to low-level business logic
- create commands that silently do surprising things
- add commands without updating registration
- ignore long-running interaction timing concerns
