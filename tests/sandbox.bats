#!/usr/bin/env bats

# Outcome tests for the `nkb run --sandbox` pattern sandbox runner.
# The dry-run path is the primary surface — it must print a stable docker
# plan without touching docker. Full e2e is gated by RUN_DOCKER=1 and only
# exercised when the operator opts in.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  cd "$REPO_ROOT"
  unset RUN_DOCKER
}

# --- dry-run plan shape ----------------------------------------------------

@test "dry-run prints plan header citing slug and pattern path" {
  run node scripts/nkb-run.mjs sample-pattern --sandbox --dry-run
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "nkb sandbox plan for slug='sample-pattern'"
  echo "$output" | grep -q "workflow-patterns/_examples/sample-pattern.md"
}

@test "dry-run output is annotated as a non-executing preview" {
  run node scripts/nkb-run.mjs sample-pattern --sandbox --dry-run
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "This is a dry run"
  echo "$output" | grep -q "RUN_DOCKER=1"
}

@test "dry-run plan contains the seven expected steps in order" {
  run node scripts/nkb-run.mjs sample-pattern --sandbox --dry-run
  [ "$status" -eq 0 ]
  expected=(
    "remove-stale-container"
    "write-workflow-json"
    "run-n8n"
    "wait-for-ready"
    "import-workflow"
    "post-sample-payload"
    "teardown"
  )
  prev=-1
  for step in "${expected[@]}"; do
    line="$(echo "$output" | grep -n "^## $step$" | head -1 | cut -d: -f1)"
    [ -n "$line" ] || { echo "missing step: $step"; return 1; }
    [ "$line" -gt "$prev" ] || { echo "step $step out of order"; return 1; }
    prev="$line"
  done
}

@test "dry-run plan includes a docker run invocation with port mapping" {
  run node scripts/nkb-run.mjs sample-pattern --sandbox --dry-run
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE "docker run .* -p 5678:5678"
  echo "$output" | grep -qE "docker run .* --name nkb-sandbox"
  echo "$output" | grep -q "n8nio/n8n:latest"
}

@test "dry-run plan embeds the pattern's workflow JSON inline" {
  run node scripts/nkb-run.mjs sample-pattern --sandbox --dry-run
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"name": "sample-echo"'
  echo "$output" | grep -q '"type": "n8n-nodes-base.webhook"'
}

@test "dry-run plan ends with teardown" {
  run node scripts/nkb-run.mjs sample-pattern --sandbox --dry-run
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "^## teardown$"
  # teardown must reference docker rm
  teardown_section="$(echo "$output" | awk '/^## teardown$/{flag=1;next} /^## /{flag=0} flag')"
  echo "$teardown_section" | grep -q "docker rm -f nkb-sandbox"
}

# --- flag handling ---------------------------------------------------------

@test "--port and --container override defaults in dry-run plan" {
  run node scripts/nkb-run.mjs sample-pattern --sandbox --dry-run --port 6789 --container alt-sandbox
  [ "$status" -eq 0 ]
  # Port mapping is host:container — container always 5678 (n8n default).
  echo "$output" | grep -qE "docker run .* -p 6789:5678"
  echo "$output" | grep -qE "docker run .* --name alt-sandbox"
  echo "$output" | grep -q "http://localhost:6789"
}

@test "no --dry-run + no RUN_DOCKER falls back to dry-run preview, exit 0" {
  unset RUN_DOCKER
  run node scripts/nkb-run.mjs sample-pattern --sandbox
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "RUN_DOCKER!=1, falling back to dry-run"
  echo "$output" | grep -q "nkb sandbox plan for slug='sample-pattern'"
}

# --- error contracts -------------------------------------------------------

@test "missing slug exits 2 with usage" {
  run node scripts/nkb-run.mjs --sandbox --dry-run
  [ "$status" -eq 2 ]
  echo "$output" | grep -q "missing <slug>"
  echo "$output" | grep -q "usage: nkb run"
}

@test "missing --sandbox exits 2 with usage" {
  run node scripts/nkb-run.mjs sample-pattern --dry-run
  [ "$status" -eq 2 ]
  echo "$output" | grep -q -- "--sandbox is required"
}

@test "unknown slug exits 3" {
  run node scripts/nkb-run.mjs no-such-pattern-xyz --sandbox --dry-run
  [ "$status" -eq 3 ]
  echo "$output" | grep -q "no pattern found"
}

@test "--help prints usage and exits 0" {
  run node scripts/nkb-run.mjs --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "usage: nkb run"
}
