#!/usr/bin/env bats

# Outcome tests for `nkb-dedupe` — the TF-IDF cosine duplicate detector.
# Asserts the contract: a fixture of two near-identical pattern docs surfaces
# as a flagged pair at the default 0.75 threshold; the real on-disk corpus
# alone does not produce false positives.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  cd "$REPO_ROOT"
}

@test "nkb-dedupe: --include-fixtures flags the two seeded near-duplicate pattern files" {
  run node scripts/nkb-dedupe.mjs --include-fixtures
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "fixtures/dedupe/slack-retry-storm-v1.md"
  echo "$output" | grep -q "fixtures/dedupe/slack-retry-storm-v2.md"
}

@test "nkb-dedupe: similarity score of the seeded pair is >= 0.75" {
  run node scripts/nkb-dedupe.mjs --include-fixtures --json
  [ "$status" -eq 0 ]
  pair_score="$(echo "$output" | node -e '
    let buf = ""; process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => {
      const j = JSON.parse(buf);
      const p = j.pairs.find((p) =>
        (p.a.endsWith("v1.md") && p.b.endsWith("v2.md")) ||
        (p.a.endsWith("v2.md") && p.b.endsWith("v1.md"))
      );
      if (!p) { process.exit(2); }
      process.stdout.write(String(p.similarity));
    });
  ')"
  [ -n "$pair_score" ]
  node -e "process.exit(parseFloat(process.argv[1]) >= 0.75 ? 0 : 1)" "$pair_score"
}

@test "nkb-dedupe: real corpus alone produces no flagged pairs at default threshold" {
  run node scripts/nkb-dedupe.mjs
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "no duplicate pairs above threshold"
}

@test "nkb-dedupe: --threshold 0.99 suppresses the seeded pair" {
  run node scripts/nkb-dedupe.mjs --include-fixtures --threshold 0.99
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "no duplicate pairs above threshold"
}

@test "nkb-dedupe: invalid --threshold exits non-zero" {
  run node scripts/nkb-dedupe.mjs --threshold 2
  [ "$status" -ne 0 ]
}
