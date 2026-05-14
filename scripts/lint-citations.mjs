#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PATTERN_DIR = join(ROOT, "workflow-patterns");
const SOURCES_HEADING = /^##\s+Sources\s*$/m;

async function listPatternDocs() {
  const entries = await readdir(PATTERN_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => join(PATTERN_DIR, e.name))
    .sort();
}

function violationFor(path, body) {
  if (!SOURCES_HEADING.test(body)) {
    return `${relative(ROOT, path)}: missing "## Sources" section`;
  }
  const afterHeading = body.split(SOURCES_HEADING)[1] ?? "";
  const firstNonBlank = afterHeading
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstNonBlank) {
    return `${relative(ROOT, path)}: "## Sources" section is empty`;
  }
  return null;
}

async function main() {
  const docs = await listPatternDocs();
  if (docs.length === 0) {
    console.log("no pattern docs found under workflow-patterns/ — nothing to lint");
    return;
  }
  const violations = [];
  for (const path of docs) {
    const body = await readFile(path, "utf8");
    const v = violationFor(path, body);
    if (v) violations.push(v);
  }
  if (violations.length > 0) {
    console.error("citation lint failed:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      `\nevery workflow-patterns/*.md must end with a "## Sources" section listing slack/github/transcript references.`,
    );
    process.exit(1);
  }
  console.log(`citation lint passed: ${docs.length} pattern doc(s) have "## Sources"`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(2);
});
