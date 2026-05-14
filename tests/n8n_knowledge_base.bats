#!/usr/bin/env bats

# Behavior tests for the n8n_knowledge_base repo.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  cd "$REPO_ROOT"
}

# First-user-moment contract: the README must open with the nkb search example
# so a cold reader sees the product promise before any other narrative.
@test "README first-user-moment: 'nkb search' appears within the first 50 lines" {
  run head -n 50 README.md
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'nkb search'
}

# Guard the ordering: the fenced demo block must precede any '## ' section
# heading. Otherwise the snippet drifts back into a buried Usage subsection.
@test "README first-user-moment: fenced demo block precedes the first '## ' heading" {
  local readme_path="$REPO_ROOT/README.md"
  local first_fence first_h2
  first_fence=$(grep -n '^```' "$readme_path" | head -n 1 | cut -d: -f1)
  first_h2=$(grep -n '^## ' "$readme_path" | head -n 1 | cut -d: -f1)
  [ -n "$first_fence" ]
  [ -n "$first_h2" ]
  [ "$first_fence" -lt "$first_h2" ]
}
