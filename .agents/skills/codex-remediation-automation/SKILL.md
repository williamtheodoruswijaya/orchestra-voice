---
name: codex-remediation-automation
description: Use this skill when implementing or modifying the flow that turns structured incidents into bounded Codex remediation tasks, branches, commits, and PRs.
---

# Purpose

This skill governs the safe automation loop from structured incidents to Codex-generated fixes.

Use this skill whenever the task involves:
- incident-to-task mapping
- bounded remediation generation
- branch naming
- commit safety
- PR creation
- CI-gated auto-remediation
- prevention of automation loops

# Preferred remediation model

Preferred flow:
1. structured incident arrives from relay/source
2. incident is classified and checked against suppression rules
3. a bounded remediation task is created
4. Codex works in a branch/worktree
5. tests/build/typecheck run
6. Codex opens a PR
7. CI acts as the gate

# Core rules

1. Do not default to direct push to `master`.
   - Preferred model is branch + PR.

2. Bound the scope of each remediation task.
   - One incident class or tightly related issue per task.

3. Suppress repeated tasks for identical incidents.
   - Use fingerprinting and cooldowns.

4. Require verification.
   - Typecheck, build, and tests should run before a remediation is considered valid.

5. Keep incident context concise and useful.
   - Include summary, fingerprint, and a log excerpt.
   - Avoid dumping entire noisy raw logs into the task prompt.

# Good candidates for automation

Examples:
- runtime entrypoint mismatch
- provider retry loop bug
- missing env validation
- provider cooldown missing
- repeated autoplay failure loop
- regression in queue/playback behavior

# Bad candidates for automatic remediation

Examples:
- vague one-off warnings
- unexplained transient network blips
- user misuse
- issues requiring secret rotation or manual billing/account action

# Branch and PR guidance

Prefer branch names like:
- `codex/fix-provider-retry-loop`
- `codex/fix-syncara-startup-entrypoint`
- `codex/fix-youtube-quota-cooldown`

PRs should summarize:
- incident fingerprint
- observed runtime symptom
- intended fix
- tests added or updated

# Testing requirements

If this automation flow is implemented, test:
- incident suppression
- task gating rules
- branch/PR payload generation
- refusal to auto-remediate unsafe classes of incidents

# Anti-patterns to avoid

Do not:
- let one recurring incident create endless branches
- auto-push directly to protected branches by default
- trigger remediation from every raw log line
- hide deployment/account limitations behind fake code fixes
