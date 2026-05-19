#!/usr/bin/env node
// nkb submit — interactive (and headless) intake CLI for new knowledge-base patterns.
// Emits `workflow-patterns/_inbox/<slug>.md` with YAML front-matter validated against
// the failure-mode tag schema documented in docs/conventions.md (round-1 PR #4).
//
// Designed to be wired into the unified `scripts/nkb.mjs` dispatcher (round-1 PR #3)
// once that script merges into main; until then this is a standalone entrypoint
// invokable via `node scripts/nkb-submit.mjs ...`.

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const INBOX_DIR = join(REPO_ROOT, "workflow-patterns", "_inbox");

// Controlled vocabulary mirrors docs/conventions.md from round-1 PR #4.
// Kept in-file so this script is testable against `main` before PR #4 merges;
// post-merge, refactor to import from a shared module.
const ALLOWED_TAGS = new Set(["failure-mode", "dead-end", "workaround"]);

function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseFlags(argv) {
  const flags = { headless: false, fixture: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--headless") flags.headless = true;
    else if (a === "--fixture") flags.fixture = argv[++i];
    else if (a.startsWith("--fixture=")) flags.fixture = a.slice("--fixture=".length);
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--help" || a === "-h") flags.help = true;
  }
  return flags;
}

// Tiny YAML loader — supports the subset we use in fixtures: scalar key/value pairs
// and flow-style `[a, b]` arrays. No anchors, no nested mappings. Good enough for a
// fixture file; refusing anything richer keeps the contract small.
function loadYamlSubset(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      value = inner === "" ? [] : inner.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
    } else if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else if (value.startsWith("|") || value.startsWith(">")) {
      // Block scalars not supported; signal explicitly so fixture authors don't
      // silently lose content.
      throw new Error(`block scalars are not supported (key '${key}')`);
    }
    out[key] = value;
  }
  return out;
}

function validateRecord(record) {
  const errors = [];
  if (!record.title || typeof record.title !== "string") {
    errors.push("title: required string");
  }
  if (!record.problem || typeof record.problem !== "string") {
    errors.push("problem: required string (one-line problem statement)");
  }
  if (!Array.isArray(record.tags) || record.tags.length === 0) {
    errors.push("tags: required non-empty array (failure-mode | dead-end | workaround)");
  } else {
    for (const t of record.tags) {
      if (!ALLOWED_TAGS.has(t)) {
        errors.push(`tags: '${t}' is not a recognized failure-mode tag (allowed: ${[...ALLOWED_TAGS].join(", ")})`);
      }
    }
  }
  if (!record.submitter || typeof record.submitter !== "string") {
    errors.push("submitter: required string");
  }
  if (record.snippet && typeof record.snippet !== "string") {
    errors.push("snippet: must be a string if provided");
  }
  if (record.story && typeof record.story !== "string") {
    errors.push("story: must be a string if provided");
  }
  return errors;
}

function renderMarkdown(record, submittedAt) {
  const tags = `[${record.tags.join(", ")}]`;
  const lines = [
    "---",
    `title: ${JSON.stringify(record.title)}`,
    `tags: ${tags}`,
    `submitter: ${JSON.stringify(record.submitter)}`,
    `submitted_at: ${submittedAt}`,
    "sources: []  # TODO: cite primary sources before review (see docs/conventions.md)",
    "---",
    "",
    `# ${record.title}`,
    "",
    `> Pattern: ${record.problem}`,
    "",
    "## Symptom",
    "",
    record.story
      ? record.story
      : "TODO: describe what the operator sees when this fails (logs, error codes, user-facing behavior).",
    "",
  ];
  if (record.tags.includes("failure-mode")) {
    lines.push("## Why this fails", "");
    lines.push("TODO: root-cause explanation (required for failure-mode docs — `nkb lint` enforces this heading).", "");
  }
  if (record.snippet) {
    lines.push("## Reproducer", "", "```json", record.snippet, "```", "");
  }
  lines.push("## Sources", "", "TODO: replace this section with primary citations before submitting for review.", "");
  return lines.join("\n");
}

async function readStdinPrompts() {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
  const ask = (q) => new Promise((res) => rl.question(`${q}\n> `, (a) => res(a.trim())));
  const title = await ask("Pattern title (one line)");
  const problem = await ask("Problem statement (one line)");
  const tagLine = await ask("Failure-mode tags (comma-separated; choose from: failure-mode, dead-end, workaround)");
  const submitter = await ask("Your handle / email (for attribution)");
  const snippet = await ask("Optional JSON snippet (paste single line, or blank to skip)");
  const story = await ask("Optional story / context (single line, or blank to skip)");
  rl.close();
  return {
    title,
    problem,
    tags: tagLine.split(",").map((s) => s.trim()).filter(Boolean),
    submitter,
    snippet: snippet || undefined,
    story: story || undefined,
  };
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(
      "nkb submit — intake a new knowledge-base pattern.\n\n" +
        "usage:\n" +
        "  nkb submit                              interactive prompts\n" +
        "  nkb submit --headless --fixture <yaml>  read record from yaml fixture\n" +
        "  nkb submit --dry-run [--headless ...]   print proposed file, write nothing\n",
    );
    return 0;
  }

  let record;
  if (flags.headless) {
    if (!flags.fixture) {
      process.stderr.write("nkb submit: --headless requires --fixture <path>\n");
      return 2;
    }
    const text = await readFile(resolve(REPO_ROOT, flags.fixture), "utf8");
    try {
      record = loadYamlSubset(text);
    } catch (err) {
      process.stderr.write(`nkb submit: fixture parse error: ${err.message}\n`);
      return 2;
    }
    if (typeof record.tags === "string") record.tags = [record.tags];
  } else {
    record = await readStdinPrompts();
  }

  const errors = validateRecord(record);
  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`nkb submit: ${e}\n`);
    return 2;
  }

  const slug = slugify(record.slug || record.title);
  if (!slug) {
    process.stderr.write("nkb submit: could not derive slug from title\n");
    return 2;
  }
  const target = join(INBOX_DIR, `${slug}.md`);
  const submittedAt = process.env.NKB_SUBMITTED_AT || new Date().toISOString();
  const body = renderMarkdown(record, submittedAt);

  if (flags.dryRun) {
    process.stdout.write(`--- would write: ${target} ---\n`);
    process.stdout.write(body);
    return 0;
  }

  if (await exists(target)) {
    process.stderr.write(`nkb submit: refusing to overwrite ${target}\n`);
    return 2;
  }

  await mkdir(INBOX_DIR, { recursive: true });
  await writeFile(target, body, "utf8");
  process.stdout.write(`wrote ${target}\n`);
  return 0;
}

main().then(
  (code) => process.exit(code || 0),
  (err) => {
    process.stderr.write(`nkb submit: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  },
);
