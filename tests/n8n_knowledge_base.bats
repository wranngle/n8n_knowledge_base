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
