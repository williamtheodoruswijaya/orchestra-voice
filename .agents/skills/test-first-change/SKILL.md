---
name: test-first-change
description: Use this skill when implementing non-trivial changes that should be protected by tests, especially queue logic, use cases, repository behavior, and regressions.
---

# Purpose

This skill guides changes that should be implemented with strong automated test coverage.

Use this skill whenever the task involves:

- queue behavior
- search session behavior
- selection behavior
- playback sequencing logic
- repository semantics
- bug fixes that could regress
- CI enforcement improvements

# Core principles

1. Prefer testing business behavior over implementation details.
   - Test what the system should do
   - avoid overly brittle tests tied to internal refactor noise

2. Prefer tests for domain and application layers first.
   - use cases
   - queue policies
   - repository semantics
   - selection/search session logic

3. Add regression tests for bugs before or alongside fixes.
   - If a bug is reproducible, encode it in a test when practical.

4. Keep tests readable.
   - clear setup
   - clear action
   - clear assertion
   - avoid giant monolithic tests

5. Do not add fake or trivial tests.
   - Tests should protect behavior that matters.

# Recommended testing order

When making a non-trivial feature change:

1. Identify the behavior to protect
2. Add or update tests for the intended behavior
3. Implement the change
4. Run the relevant test suite
5. Run build/typecheck if available
6. Update CI if the new tests need integration

# Important behaviors to test in this repo

High-priority behaviors include:

- enqueue behavior
- queue order preservation
- autoplay next track
- skip behavior
- clear queue behavior
- remove queue item behavior
- handling empty queue
- handling invalid queue indexes
- search result save behavior
- selected track behavior
- behavior when no search results exist
- provider adapter mapping behavior
- error handling for missing credentials or provider failures

# Suggested test style

Prefer the following:

- unit tests for domain/application
- adapter tests with mocked HTTP/fetch behavior
- minimal integration-style tests for important orchestration flows

Avoid:

- over-mocking everything
- making Discord SDK mocks the center of the test suite unless boundary behavior truly needs it

# CI expectations

If tests are added or expanded:

- ensure CI runs them
- ensure merge protection can rely on them
- keep CI commands simple and deterministic

Recommended checks:

- install
- typecheck
- build
- test

# Documentation expectations

If the testing approach changes:

- update `GETTING_STARTED.md`
- document the test commands in `package.json`
- mention CI expectations for contributors

# Anti-patterns to avoid

Do not:

- add empty smoke tests with no value
- skip tests for queue logic changes
- merge architectural changes without at least use-case-level coverage
- add CI that does not actually fail on test failures
