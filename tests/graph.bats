#!/usr/bin/env bats
# nkb-graph: pattern dependency graph + broken-link check

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/nkb-graph.mjs"
  OK_DIR="$REPO_ROOT/fixtures/graph/ok"
  BAD_DIR="$REPO_ROOT/fixtures/graph/broken"
}

# central promise: mermaid renders every fixture pattern as a node
@test "graph: mermaid output lists every pattern in the ok fixture as a node" {
  run node "$SCRIPT" --dir "$OK_DIR"
  [ "$status" -eq 0 ]
  [[ "$output" == *'```mermaid'* ]]
  [[ "$output" == *'graph LR'* ]]
  [[ "$output" == *'webhook_dedup_key["webhook-dedup-key"]'* ]]
  [[ "$output" == *'http_retry_idempotency["http-retry-idempotency"]'* ]]
  [[ "$output" == *'error_monitoring_fanout["error-monitoring-fanout"]'* ]]
}

@test "graph: edges in mermaid mirror Depends-on declarations" {
  run node "$SCRIPT" --dir "$OK_DIR"
  [ "$status" -eq 0 ]
  [[ "$output" == *'webhook_dedup_key --> http_retry_idempotency'* ]]
  [[ "$output" == *'http_retry_idempotency --> error_monitoring_fanout'* ]]
}

# central promise of --check: non-zero exit when any dep is a missing slug
@test "graph --check: ok fixture passes with exit 0" {
  run node "$SCRIPT" --dir "$OK_DIR" --check
  [ "$status" -eq 0 ]
  [[ "$output" == *'ok'* ]]
  [[ "$output" == *'0 broken'* ]]
}

@test "graph --check: broken fixture fails with exit 1 and names the missing slug" {
  run node "$SCRIPT" --dir "$BAD_DIR" --check
  [ "$status" -eq 1 ]
  [[ "$output" == *'webhook-dedup-key'* ]]
  [[ "$output" == *'nonexistent-upstream'* ]]
  [[ "$output" == *'no such pattern'* ]]
}

@test "graph --check --format json: ok fixture reports ok:true, broken:[]" {
  run node "$SCRIPT" --dir "$OK_DIR" --check --format json
  [ "$status" -eq 0 ]
  [[ "$output" == *'"ok": true'* ]]
  [[ "$output" == *'"broken": []'* ]]
}

@test "graph --check --format json: broken fixture reports the from/to edge" {
  run node "$SCRIPT" --dir "$BAD_DIR" --check --format json
  [ "$status" -eq 1 ]
  [[ "$output" == *'"from": "webhook-dedup-key"'* ]]
  [[ "$output" == *'"to": "nonexistent-upstream"'* ]]
  [[ "$output" == *'"ok": false'* ]]
}

@test "graph: --format json (no --check) dumps every pattern with its deps list" {
  run node "$SCRIPT" --dir "$OK_DIR" --format json
  [ "$status" -eq 0 ]
  [[ "$output" == *'"slug": "webhook-dedup-key"'* ]]
  [[ "$output" == *'"deps": ['* ]]
  [[ "$output" == *'"http-retry-idempotency"'* ]]
}

@test "graph: pattern with no Depends-on section produces zero edges from it" {
  run node "$SCRIPT" --dir "$OK_DIR" --format json
  [ "$status" -eq 0 ]
  python3 -c "
import json, sys
data = json.loads('''$output''')
emf = next(p for p in data['patterns'] if p['slug'] == 'error-monitoring-fanout')
assert emf['deps'] == [], f'expected no deps, got {emf[\"deps\"]}'
"
}

@test "graph: missing --dir target exits non-zero with stderr message" {
  run node "$SCRIPT" --dir /tmp/__nkb_graph_does_not_exist__
  [ "$status" -ne 0 ]
  [[ "$output" == *'cannot read'* ]]
}

@test "graph: mermaid output marks missing dep edges with dotted-arrow annotation" {
  run node "$SCRIPT" --dir "$BAD_DIR"
  [ "$status" -eq 0 ]
  [[ "$output" == *'-.->|missing| nonexistent_upstream'* ]]
}
