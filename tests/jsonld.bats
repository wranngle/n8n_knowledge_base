#!/usr/bin/env bats

# Outcome tests for `nkb export --jsonld`.
# Contract: every pattern markdown under workflow-patterns/ produces a
# corresponding dist/jsonld/<slug>.jsonld, each file parses as valid JSON,
# carries the schema.org @context, and declares schema.org/TechArticle as
# its @type. `--check` exits non-zero when an expected jsonld is missing.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  cd "$REPO_ROOT"
  rm -rf dist/jsonld
}

teardown() {
  rm -rf dist/jsonld
  # Best-effort: only delete the test fixture pattern if a test created it.
  rm -f workflow-patterns/zz-test-fixture-pattern-do-not-commit.md
}

# --- happy path -------------------------------------------------------------

@test "nkb export --jsonld writes dist/jsonld/<slug>.jsonld for every pattern" {
  run node scripts/nkb-export.mjs --jsonld
  [ "$status" -eq 0 ]
  [ -d dist/jsonld ]

  # Count markdown patterns under workflow-patterns/ (top level + _inbox if it exists).
  pattern_count=0
  if [ -d workflow-patterns ]; then
    pattern_count=$(find workflow-patterns -maxdepth 2 -type f -name '*.md' | wc -l)
  fi
  jsonld_count=$(find dist/jsonld -maxdepth 1 -type f -name '*.jsonld' | wc -l)
  [ "$jsonld_count" -eq "$pattern_count" ]
  [ "$jsonld_count" -ge 1 ]
}

@test "every emitted .jsonld parses as JSON and declares schema.org TechArticle" {
  run node scripts/nkb-export.mjs --jsonld
  [ "$status" -eq 0 ]

  while IFS= read -r file; do
    # JSON parse check.
    node -e "JSON.parse(require('node:fs').readFileSync('$file','utf8'))"
    # @context + @type assertions through jq if available, fall back to grep.
    if command -v jq >/dev/null 2>&1; then
      ctx=$(jq -r '."@context"' "$file")
      typ=$(jq -r '."@type"' "$file")
      [ "$ctx" = "https://schema.org" ]
      [ "$typ" = "TechArticle" ]
    else
      grep -q '"@context": "https://schema.org"' "$file"
      grep -q '"@type": "TechArticle"' "$file"
    fi
  done < <(find dist/jsonld -maxdepth 1 -type f -name '*.jsonld')
}

# --- coverage: every pattern.md has a corresponding jsonld ------------------

@test "each workflow-patterns/*.md has a matching dist/jsonld/<slug>.jsonld" {
  run node scripts/nkb-export.mjs --jsonld
  [ "$status" -eq 0 ]

  missing=0
  while IFS= read -r md; do
    base=$(basename "$md" .md)
    slug=$(echo "$base" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/-/g; s/^-\+//; s/-\+$//')
    if [ ! -f "dist/jsonld/${slug}.jsonld" ]; then
      echo "missing jsonld for: $md (expected dist/jsonld/${slug}.jsonld)"
      missing=$((missing + 1))
    fi
  done < <(find workflow-patterns -maxdepth 2 -type f -name '*.md')
  [ "$missing" -eq 0 ]
}

# --- new fixture pattern surfaces in next export ----------------------------

@test "a newly added pattern is picked up on the next export run" {
  fixture=workflow-patterns/zz-test-fixture-pattern-do-not-commit.md
  cat > "$fixture" <<'EOF'
---
title: "Test fixture pattern"
tags: [failure-mode]
submitter: "bats-suite@localhost"
submitted_at: "2026-05-14T00:00:00Z"
---

# Test fixture pattern

This paragraph should land in the description field of the emitted JSON-LD
because it is the first non-heading, non-metadata paragraph in the body.
EOF
  run node scripts/nkb-export.mjs --jsonld
  [ "$status" -eq 0 ]
  [ -f dist/jsonld/zz-test-fixture-pattern-do-not-commit.jsonld ]
  body=$(cat dist/jsonld/zz-test-fixture-pattern-do-not-commit.jsonld)
  echo "$body" | grep -q '"name": "Test fixture pattern"'
  echo "$body" | grep -q '"description": "This paragraph should land'
  echo "$body" | grep -q '"keywords": \[' # tags rendered as array
  echo "$body" | grep -q '"author":'      # submitter -> author.Person
  echo "$body" | grep -q '"dateCreated": "2026-05-14T00:00:00Z"'
}

# --- check mode -------------------------------------------------------------

@test "nkb export --check exits non-zero when a pattern lacks jsonld" {
  fixture=workflow-patterns/zz-test-fixture-pattern-do-not-commit.md
  printf '# Coverage gap fixture\n\nbody\n' > "$fixture"
  run node scripts/nkb-export.mjs --jsonld
  [ "$status" -eq 0 ]

  # Remove one jsonld to simulate drift.
  rm -f dist/jsonld/zz-test-fixture-pattern-do-not-commit.jsonld
  run node scripts/nkb-export.mjs --check
  [ "$status" -ne 0 ]
  echo "$output" | grep -q 'zz-test-fixture-pattern-do-not-commit'
}

# --- usage ------------------------------------------------------------------

@test "nkb export with no flags prints usage and exits non-zero" {
  run node scripts/nkb-export.mjs
  [ "$status" -ne 0 ]
  echo "$output" | grep -q 'usage:'
}
