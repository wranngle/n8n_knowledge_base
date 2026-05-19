#!/usr/bin/env bats

# Outcome tests for the `nkb` local full-text search CLI.
# Asserts the contract: query → exit code + stdout shape against the real on-disk corpus.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  cd "$REPO_ROOT"
}

@test "nkb search: known query 'twilio' returns >=1 hit with path:line:snippet shape" {
  run node scripts/nkb.mjs search twilio
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  echo "$output" | head -1 | grep -qE '^[^:]+:[0-9]+:.+'
}

@test "nkb search: unknown token 'zzznonexistentzzz' exits 0 with empty stdout" {
  run node scripts/nkb.mjs search zzznonexistentzzz
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "nkb search: 'elevenlabs' hits a real path under elevenlabs-agents/ or workflow-patterns/" {
  run node scripts/nkb.mjs search elevenlabs
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE '^(elevenlabs-agents|workflow-patterns)/'
}

# Failure-mode tag schema (per docs/conventions.md).

@test "nkb search --tag failure-mode: returns >=5 distinct workflow-patterns/ docs" {
  run node scripts/nkb.mjs search --tag failure-mode
  [ "$status" -eq 0 ]
  count="$(echo "$output" | grep -cE '^workflow-patterns/.+\.md:')"
  [ "$count" -ge 5 ]
}

@test "nkb lint: every failure-mode doc has '## Why this fails' heading" {
  run node scripts/nkb.mjs lint
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE '^lint ok: [0-9]+ failure-mode doc'
}

@test "nkb search --tag failure-mode 'twilio': narrows to twilio failure-mode doc" {
  run node scripts/nkb.mjs search --tag failure-mode twilio
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'twilio-11200-stream-disconnect.md'
}
