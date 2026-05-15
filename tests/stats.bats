#!/usr/bin/env bats

# Outcome tests for `nkb stats`.
# Contract: given fixtures/telemetry-sample.jsonl, the CLI prints exactly the
# top-10 patterns ordered by descending event count, with deterministic
# alphabetical tie-break. Malformed lines and records missing `pattern` are
# skipped without aborting the run.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  cd "$REPO_ROOT"
  TMPDIR_LOCAL="$(mktemp -d)"
}

teardown() {
  rm -rf "$TMPDIR_LOCAL"
}

# --- ordering --------------------------------------------------------------

@test "stats: top-10 ordering matches highest-count patterns from telemetry fixture" {
  run node scripts/nkb-stats.mjs --input fixtures/telemetry-sample.jsonl --top 10
  [ "$status" -eq 0 ]

  # Strip header lines, blank lines, and the leading "rank. count  " column to
  # isolate just the ordered slug column.
  ordered=$(printf '%s\n' "$output" \
    | grep -E '^[[:space:]]*[0-9]+\.' \
    | sed -E 's/^[[:space:]]*[0-9]+\.[[:space:]]+[0-9]+[[:space:]]+//')

  expected="slack-retry-storm
http-retry-idempotency
webhook-dedup-key
voice-agent-elevenlabs-patterns
stripe-idempotency-key
airtable-rate-limit-backoff
queue-backpressure-fanout
error-monitoring-fanout
google-sheets-batched-append
shopify-orders-webhook"

  [ "$ordered" = "$expected" ]
}

@test "stats: rank 1 is the pattern with the most events (slack-retry-storm @ 10)" {
  run node scripts/nkb-stats.mjs --input fixtures/telemetry-sample.jsonl --top 10
  [ "$status" -eq 0 ]
  line1=$(printf '%s\n' "$output" | grep -E '^[[:space:]]*1\.' | head -n1)
  [[ "$line1" == *"slack-retry-storm"* ]]
  [[ "$line1" == *"10"* ]]
}

@test "stats: exactly 10 ranked rows when --top 10 with 12 distinct patterns" {
  run node scripts/nkb-stats.mjs --input fixtures/telemetry-sample.jsonl --top 10
  [ "$status" -eq 0 ]
  count=$(printf '%s\n' "$output" | grep -cE '^[[:space:]]*[0-9]+\.')
  [ "$count" -eq 10 ]
}

# --- tie-break is deterministic (alphabetical on equal counts) -------------

@test "stats: ties at count=2 break alphabetically (google-sheets... before shopify-...)" {
  run node scripts/nkb-stats.mjs --input fixtures/telemetry-sample.jsonl --top 10
  [ "$status" -eq 0 ]
  rank9=$(printf '%s\n' "$output" | grep -E '^[[:space:]]*9\.' | head -n1)
  rank10=$(printf '%s\n' "$output" | grep -E '^[[:space:]]*10\.' | head -n1)
  [[ "$rank9" == *"google-sheets-batched-append"* ]]
  [[ "$rank10" == *"shopify-orders-webhook"* ]]
}

# --- header + meta line --------------------------------------------------

@test "stats: header reports total events tallied (58 in fixture)" {
  run node scripts/nkb-stats.mjs --input fixtures/telemetry-sample.jsonl --top 10
  [ "$status" -eq 0 ]
  [[ "$output" == *"events tallied: 58"* ]]
}

# --- JSON output format --------------------------------------------------

@test "stats --format json: emits parseable JSON with descending counts" {
  run node scripts/nkb-stats.mjs --input fixtures/telemetry-sample.jsonl --top 10 --format json
  [ "$status" -eq 0 ]
  echo "$output" > "$TMPDIR_LOCAL/out.json"
  node -e "const d=JSON.parse(require('node:fs').readFileSync('$TMPDIR_LOCAL/out.json','utf8'));
    if(!Array.isArray(d.top)||d.top.length!==10) process.exit(11);
    if(d.top[0].pattern!=='slack-retry-storm'||d.top[0].count!==10) process.exit(12);
    for(let i=1;i<d.top.length;i++){if(d.top[i].count>d.top[i-1].count) process.exit(13);}
    if(d.meta.total!==58) process.exit(14);"
}

# --- robustness: skip malformed + missing-pattern lines --------------------

@test "stats: malformed JSON lines and records lacking pattern are skipped, not fatal" {
  cat > "$TMPDIR_LOCAL/mixed.jsonl" <<'EOF'
{"ts":"2026-05-02T00:00:00Z","event":"pattern_view","pattern":"alpha"}
this is not json
{"ts":"2026-05-02T00:01:00Z","event":"pattern_view"}
{"ts":"2026-05-02T00:02:00Z","event":"pattern_view","pattern":"alpha"}
{"ts":"2026-05-02T00:03:00Z","event":"pattern_view","pattern":"beta"}
EOF
  run node scripts/nkb-stats.mjs --input "$TMPDIR_LOCAL/mixed.jsonl" --top 5
  [ "$status" -eq 0 ]
  rank1=$(printf '%s\n' "$output" | grep -E '^[[:space:]]*1\.' | head -n1)
  [[ "$rank1" == *"alpha"* ]]
  [[ "$rank1" == *"2"* ]]
  [[ "$output" == *"(skipped: 2)"* ]]
}

# --- missing input file is a clean error ----------------------------------

@test "stats: missing input file exits non-zero with message on stderr" {
  run node scripts/nkb-stats.mjs --input "$TMPDIR_LOCAL/does-not-exist.jsonl"
  [ "$status" -ne 0 ]
  [[ "$output" == *"cannot read"* ]]
}
