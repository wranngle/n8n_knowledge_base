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

# --- Line-number accuracy across stripped YAML front matter ---
# Regression guard: nkb strips front matter before indexing, so a naive line
# count reports lines short by the size of the front matter. The reported
# `path:line:` must resolve to the same content in the real source file.

@test "nkb search: reported line for a front-mattered doc resolves to the real file line" {
  run node scripts/nkb.mjs search "twilio 11200"
  [ "$status" -eq 0 ]
  hit="$(echo "$output" | grep 'twilio-11200-stream-disconnect.md' | head -1)"
  [ -n "$hit" ]
  path="$(echo "$hit" | cut -d: -f1)"
  reported="$(echo "$hit" | cut -d: -f2)"
  # The hit lands on the H1; that heading must actually live on `reported` in the file.
  real="$(grep -nF '# Twilio Error 11200 on Media Streams' "$path" | head -1 | cut -d: -f1)"
  [ -n "$real" ]
  [ "$reported" -eq "$real" ]
}

@test "nkb search --tag: listed line resolves to the doc's first content line, not line 1" {
  run node scripts/nkb.mjs search --tag failure-mode
  [ "$status" -eq 0 ]
  hit="$(echo "$output" | grep 'twilio-11200-stream-disconnect.md' | head -1)"
  [ -n "$hit" ]
  path="$(echo "$hit" | cut -d: -f1)"
  reported="$(echo "$hit" | cut -d: -f2)"
  real="$(grep -nF '# Twilio Error 11200 on Media Streams' "$path" | head -1 | cut -d: -f1)"
  [ "$reported" -eq "$real" ]
  [ "$reported" -ne 1 ]
}

# --- Community corpus search (search-community.mjs, offline via fixture) ---
# Network is never touched: the fixture index stands in for the cached Zie619
# file list. A real --refresh against GitHub is only exercised when NKB_NET_TESTS=1.

COMMUNITY_FIXTURE="fixtures/community/zie619-index.sample.json"

@test "search-community: keyword 'twilio' returns matching community workflows with URLs" {
  run node scripts/search-community.mjs twilio --index "$COMMUNITY_FIXTURE"
  [ "$status" -eq 0 ]
  count="$(echo "$output" | grep -cE 'https://raw\.githubusercontent\.com/Zie619/n8n-workflows/')"
  [ "$count" -ge 2 ]
  echo "$output" | grep -qi 'twilio'
}

@test "search-community: unmatched keyword reports zero, does not fabricate hits" {
  run node scripts/search-community.mjs zzznotacorpusworkflowzzz --index "$COMMUNITY_FIXTURE"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'no community workflows match'
}

@test "search-community: missing index exits non-zero with a refresh hint, not a stack trace" {
  NKB_COMMUNITY_INDEX="/nonexistent/index.json" run node scripts/search-community.mjs twilio
  [ "$status" -ne 0 ]
  echo "$output" | grep -q -- '--refresh'
}

@test "search-community: real Zie619 refresh caches >1000 workflows (network; NKB_NET_TESTS=1)" {
  [ "${NKB_NET_TESTS:-0}" = "1" ] || skip "network test; set NKB_NET_TESTS=1 to run"
  run node scripts/search-community.mjs --refresh
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE 'cached [0-9]{4,} workflows'
}

# --- Estimator interface (nkb estimate / nkb freshness) ---
# The estimator reads each integration's complexity tier and applies the
# research-waterfall rubric (standard 40 / moderate 60 / complex 80 /
# enterprise 120), summing a total. Unknown integrations must not be priced.

@test "nkb estimate: sums rubric tier hours across known integrations" {
  run node scripts/nkb.mjs estimate salesforce athenahealth
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE 'salesforce +moderate +60h'
  echo "$output" | grep -qE 'athenahealth +complex +80h'
  echo "$output" | grep -qE 'TOTAL +140h'
}

@test "nkb estimate: unknown integration is flagged with the research-waterfall gap report, not priced" {
  run node scripts/nkb.mjs estimate zzznosuchintegrationzzz
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'no research record'
  echo "$output" | grep -q 'research waterfall'
  echo "$output" | grep -qE 'TOTAL +0h'
}

@test "nkb freshness: flags records older than 90 days at score 0.2 with an actionable gap line" {
  run node scripts/nkb.mjs freshness
  [ "$status" -eq 0 ]
  # Survivor records are dated 2025-12-31 — long past the 90-day line.
  echo "$output" | grep -qE 'salesforce\.json: research_date [0-9]+d old .*score 0\.2'
  echo "$output" | grep -q 'run the research waterfall'
  echo "$output" | grep -qE 'freshness: [0-9]+ of [0-9]+ dated record\(s\) stale'
}

# --- HTTP shim (nkb-serve.mjs) ---
# Boots the server on an ephemeral port, asserts the JSON contract that the n8n
# HTTP Request node consumes, then tears it down. Port chosen high to avoid
# clashing with the documented default 7321 if a real instance is running.

NKB_SERVE_PORT=27321

_nkb_serve_start() {
  node scripts/nkb-serve.mjs --port "$NKB_SERVE_PORT" --host 127.0.0.1 >/tmp/nkb-serve.log 2>&1 &
  NKB_SERVE_PID=$!
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sf "http://127.0.0.1:$NKB_SERVE_PORT/health" >/dev/null 2>&1; then return 0; fi
    sleep 0.3
  done
  echo "nkb-serve failed to start; log:" >&2
  cat /tmp/nkb-serve.log >&2
  return 1
}

_nkb_serve_stop() {
  [ -n "${NKB_SERVE_PID:-}" ] && kill "$NKB_SERVE_PID" 2>/dev/null
  wait "$NKB_SERVE_PID" 2>/dev/null || true
}

@test "nkb-serve: GET /search?q=twilio returns HTTP 200 with hits array and elapsed_ms" {
  _nkb_serve_start
  run curl -sS -o /tmp/nkb-resp.json -w '%{http_code}' "http://127.0.0.1:$NKB_SERVE_PORT/search?q=twilio"
  _nkb_serve_stop
  [ "$status" -eq 0 ]
  [ "$output" = "200" ]
  node -e 'const r=JSON.parse(require("fs").readFileSync("/tmp/nkb-resp.json","utf8")); if(!Array.isArray(r.hits)) process.exit(1); if(r.hits.length<1) process.exit(2); if(typeof r.elapsed_ms!=="number") process.exit(3); if(!r.hits[0].path||typeof r.hits[0].line!=="number"||typeof r.hits[0].snippet!=="string") process.exit(4);'
}

@test "nkb-serve: GET /search with no q returns HTTP 400 + missing_q error" {
  _nkb_serve_start
  run curl -sS -o /tmp/nkb-noq.json -w '%{http_code}' "http://127.0.0.1:$NKB_SERVE_PORT/search"
  _nkb_serve_stop
  [ "$status" -eq 0 ]
  [ "$output" = "400" ]
  grep -q '"error":"missing_q"' /tmp/nkb-noq.json
}

@test "nkb-serve: GET /search?q=zzznonexistentzzz returns 200 with empty hits[]" {
  _nkb_serve_start
  run curl -sS -o /tmp/nkb-empty.json -w '%{http_code}' "http://127.0.0.1:$NKB_SERVE_PORT/search?q=zzznonexistentzzz"
  _nkb_serve_stop
  [ "$status" -eq 0 ]
  [ "$output" = "200" ]
  node -e 'const r=JSON.parse(require("fs").readFileSync("/tmp/nkb-empty.json","utf8")); if(!Array.isArray(r.hits)) process.exit(1); if(r.hits.length!==0) process.exit(2);'
}
