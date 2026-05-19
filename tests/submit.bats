#!/usr/bin/env bats

# Outcome tests for the `nkb submit` intake CLI.
# Asserts contract: fixture → exit code + filesystem side-effects + frontmatter shape.
#
# Tests deliberately exercise the failure-mode tag controlled vocabulary from
# round-1 PR #4 (docs/conventions.md). Once #4 merges, the vocabulary moves to a
# shared module; this test continues to assert the same observable contract.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  cd "$REPO_ROOT"
  # Stable timestamp so generated frontmatter is reproducible.
  export NKB_SUBMITTED_AT="2026-05-14T00:00:00Z"
  # Each test gets a clean inbox.
  rm -f workflow-patterns/_inbox/duplicate-slack-on-retry.md
}

teardown() {
  rm -f workflow-patterns/_inbox/duplicate-slack-on-retry.md
}

# --- happy path -------------------------------------------------------------

@test "nkb submit --headless writes a pattern to workflow-patterns/_inbox/" {
  run node scripts/nkb-submit.mjs --headless --fixture fixtures/sample-submission.yaml
  [ "$status" -eq 0 ]
  [ -f workflow-patterns/_inbox/duplicate-slack-on-retry.md ]
  echo "$output" | grep -q 'wrote .*duplicate-slack-on-retry.md'
}

@test "generated file has required frontmatter (title, tags, submitter, submitted_at, sources)" {
  run node scripts/nkb-submit.mjs --headless --fixture fixtures/sample-submission.yaml
  [ "$status" -eq 0 ]
  body="$(cat workflow-patterns/_inbox/duplicate-slack-on-retry.md)"
  echo "$body" | head -1 | grep -qE '^---$'
  echo "$body" | grep -qE '^title: '
  echo "$body" | grep -qE '^tags: \[failure-mode, workaround\]'
  echo "$body" | grep -qE '^submitter: '
  echo "$body" | grep -qE '^submitted_at: 2026-05-14T00:00:00Z'
  echo "$body" | grep -qE '^sources: '
}

@test "generated file includes the '## Why this fails' heading for failure-mode tag" {
  # Required by round-1 PR #4's lint rule; submit-emitted stubs must satisfy it
  # (with a TODO body the reviewer fills in) so the inbox is lint-clean.
  run node scripts/nkb-submit.mjs --headless --fixture fixtures/sample-submission.yaml
  [ "$status" -eq 0 ]
  grep -qE '^## Why this fails$' workflow-patterns/_inbox/duplicate-slack-on-retry.md
}

# --- vocabulary validation --------------------------------------------------

@test "nkb submit rejects unknown failure-mode tag with exit 2" {
  run node scripts/nkb-submit.mjs --headless --fixture fixtures/bad-tag-submission.yaml
  [ "$status" -eq 2 ]
  echo "$output" | grep -qE "'meme-status' is not a recognized failure-mode tag"
  # Nothing written on rejection.
  [ ! -f workflow-patterns/_inbox/bogus-tag-test.md ]
}

# --- dry-run path -----------------------------------------------------------

@test "nkb submit --dry-run prints proposed file and writes nothing" {
  run node scripts/nkb-submit.mjs --headless --fixture fixtures/sample-submission.yaml --dry-run
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'would write: '
  echo "$output" | grep -qE '^tags: \[failure-mode, workaround\]'
  [ ! -f workflow-patterns/_inbox/duplicate-slack-on-retry.md ]
}

# --- idempotency ------------------------------------------------------------

@test "nkb submit refuses to overwrite an existing inbox entry" {
  run node scripts/nkb-submit.mjs --headless --fixture fixtures/sample-submission.yaml
  [ "$status" -eq 0 ]
  run node scripts/nkb-submit.mjs --headless --fixture fixtures/sample-submission.yaml
  [ "$status" -eq 2 ]
  echo "$output" | grep -q 'refusing to overwrite'
}

# --- usage ------------------------------------------------------------------

@test "nkb submit --headless without --fixture exits 2" {
  run node scripts/nkb-submit.mjs --headless
  [ "$status" -eq 2 ]
  echo "$output" | grep -q 'requires --fixture'
}
