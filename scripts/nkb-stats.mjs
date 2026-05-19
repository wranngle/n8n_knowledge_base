#!/usr/bin/env node
// nkb stats — adoption telemetry rollup CLI. Reads a JSONL event stream
// (default: fixtures/telemetry-sample.jsonl) where every line is a
// `{ts, event, pattern, actor}` record, and prints the top-N patterns by
// view count to stdout.
//
// Designed to plug into the unified `scripts/nkb.mjs` dispatcher established
// in round-1 PR #3 (`feat(nkb): local full-text search CLI`). Until that
// dispatcher re-lands on main, this script is invokable standalone via
// `node scripts/nkb-stats.mjs [--input <path>] [--top N] [--format text|json]`.
//
// Tie-break: counts descending, then pattern slug ascending — deterministic
// so test assertions can pin ordering even when two patterns share a count.

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_INPUT = join(REPO_ROOT, "fixtures", "telemetry-sample.jsonl");

function parseFlags(argv) {
  const flags = { input: DEFAULT_INPUT, top: 10, format: "text", help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") flags.input = argv[++i];
    else if (a.startsWith("--input=")) flags.input = a.slice("--input=".length);
    else if (a === "--top") flags.top = Number.parseInt(argv[++i], 10);
    else if (a.startsWith("--top=")) flags.top = Number.parseInt(a.slice("--top=".length), 10);
    else if (a === "--format") flags.format = argv[++i];
    else if (a.startsWith("--format=")) flags.format = a.slice("--format=".length);
    else if (a === "--help" || a === "-h") flags.help = true;
  }
  if (!Number.isFinite(flags.top) || flags.top <= 0) flags.top = 10;
  if (flags.format !== "text" && flags.format !== "json") flags.format = "text";
  return flags;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: nkb stats [--input <path>] [--top N] [--format text|json]",
      "",
      "Reads JSONL telemetry events and prints the top-N patterns by view count.",
      "Each event line must be a JSON object with at minimum a `pattern` string field;",
      "lines without `pattern` are skipped, malformed JSON lines are skipped.",
      "",
      "Defaults:",
      "  --input   fixtures/telemetry-sample.jsonl",
      "  --top     10",
      "  --format  text",
      "",
      "Tie-break order: count descending, then pattern slug ascending.",
      "",
    ].join("\n"),
  );
}

function tallyEvents(text) {
  const counts = new Map();
  let total = 0;
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      skipped++;
      continue;
    }
    const pattern = record && typeof record.pattern === "string" ? record.pattern.trim() : "";
    if (!pattern) {
      skipped++;
      continue;
    }
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
    total++;
  }
  return { counts, total, skipped };
}

function rank(counts, top) {
  return [...counts.entries()]
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => (b.count - a.count) || a.pattern.localeCompare(b.pattern))
    .slice(0, top);
}

function renderText(rows, meta) {
  const lines = [];
  lines.push(`# nkb adoption stats — top ${rows.length} of ${meta.distinct} patterns`);
  lines.push(`# events tallied: ${meta.total}${meta.skipped ? ` (skipped: ${meta.skipped})` : ""}`);
  lines.push("");
  const rankWidth = String(rows.length).length;
  const countWidth = rows.reduce((w, r) => Math.max(w, String(r.count).length), 1);
  rows.forEach((row, i) => {
    const rankCol = String(i + 1).padStart(rankWidth, " ");
    const countCol = String(row.count).padStart(countWidth, " ");
    lines.push(`${rankCol}. ${countCol}  ${row.pattern}`);
  });
  return `${lines.join("\n")}\n`;
}

function renderJson(rows, meta) {
  return `${JSON.stringify({ generated_at: new Date().toISOString(), meta, top: rows }, null, 2)}\n`;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return 0;
  }
  let text;
  try {
    text = await readFile(flags.input, "utf8");
  } catch (err) {
    process.stderr.write(`nkb-stats: cannot read ${flags.input}: ${err.message}\n`);
    return 2;
  }
  const { counts, total, skipped } = tallyEvents(text);
  const distinct = counts.size;
  const rows = rank(counts, flags.top);
  const meta = { total, skipped, distinct, input: flags.input, top: flags.top };
  const out = flags.format === "json" ? renderJson(rows, meta) : renderText(rows, meta);
  process.stdout.write(out);
  return 0;
}

main().then(
  (code) => process.exit(code ?? 0),
  (err) => {
    process.stderr.write(`nkb-stats: ${err.stack || err.message}\n`);
    process.exit(1);
  },
);
