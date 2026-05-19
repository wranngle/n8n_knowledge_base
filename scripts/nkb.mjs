#!/usr/bin/env node
process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import MiniSearch from "minisearch";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const SEARCH_ROOTS = ["workflow-patterns", "technical-research", "elevenlabs-agents"];
const SEARCH_EXTS = new Set([".md", ".json", ".yaml", ".yml"]);
const SNIPPET_RADIUS = 100;
const MAX_RESULTS = 20;
const FAILURE_MODE_REQUIRED_HEADING = "## Why this fails";

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf(".");
      const ext = dot === -1 ? "" : entry.name.slice(dot).toLowerCase();
      if (SEARCH_EXTS.has(ext)) out.push(full);
    }
  }
  return out;
}

function parseFrontMatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { tags: [], body: text };
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { tags: [], body: text };
  const block = text.slice(4, end);
  const tags = [];
  const tagLine = block.match(/^tags:\s*(.+)$/m);
  if (tagLine) {
    const raw = tagLine[1].trim();
    if (raw.startsWith("[")) {
      const inner = raw.replace(/^\[/, "").replace(/\]$/, "");
      for (const part of inner.split(",")) {
        const t = part.trim().replace(/^['"]|['"]$/g, "");
        if (t) tags.push(t);
      }
    } else {
      tags.push(raw.replace(/^['"]|['"]$/g, ""));
    }
  }
  const flowEnd = end + 4;
  const after = text[flowEnd] === "\n" ? flowEnd + 1 : flowEnd;
  return { tags, body: text.slice(after) };
}

async function loadDocs() {
  const docs = [];
  for (const root of SEARCH_ROOTS) {
    const abs = join(REPO_ROOT, root);
    try { await stat(abs); } catch { continue; }
    const files = await walk(abs);
    for (const file of files) {
      try {
        const raw = await readFile(file, "utf8");
        const { tags, body } = parseFrontMatter(raw);
        const path = relative(REPO_ROOT, file);
        docs.push({ id: path, path, text: body, tags, tagsText: tags.join(" ") });
      } catch {
        // skip unreadable
      }
    }
  }
  return docs;
}

function buildIndex(docs) {
  const idx = new MiniSearch({
    fields: ["path", "text", "tagsText"],
    storeFields: ["path", "text", "tags"],
    searchOptions: { boost: { path: 2 }, prefix: true, fuzzy: 0.1 },
  });
  idx.addAll(docs);
  return idx;
}

function snippetFor(text, query) {
  const haystack = text.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  let hit = -1;
  for (const tok of tokens) {
    const found = haystack.indexOf(tok);
    if (found !== -1) { hit = found; break; }
  }
  if (hit === -1) hit = 0;
  const start = Math.max(0, hit - SNIPPET_RADIUS);
  const end = Math.min(text.length, hit + SNIPPET_RADIUS);
  const line = text.slice(0, hit).split("\n").length;
  return {
    line,
    snippet: text.slice(start, end).replace(/\s+/g, " ").trim(),
  };
}

function parseArgs(rest) {
  const flags = { tag: null };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--tag") { flags.tag = rest[++i]; continue; }
    if (a.startsWith("--tag=")) { flags.tag = a.slice(6); continue; }
    positional.push(a);
  }
  return { flags, query: positional.join(" ") };
}

async function runSearch(rest) {
  const { flags, query } = parseArgs(rest);
  const docs = await loadDocs();

  if (flags.tag && !query) {
    const hits = docs.filter((d) => d.tags.includes(flags.tag));
    for (const d of hits) {
      const firstLine = d.text.split("\n").find((l) => l.trim().length > 0) || "";
      process.stdout.write(`${d.path}:1:[tags=${d.tags.join(",")}] ${firstLine.slice(0, 160).trim()}\n`);
    }
    return;
  }

  if (!query) {
    process.stderr.write("usage: nkb search [--tag <name>] <query>\n");
    process.exit(2);
  }

  const pool = flags.tag ? docs.filter((d) => d.tags.includes(flags.tag)) : docs;
  const idx = buildIndex(pool);
  const results = idx.search(query, { combineWith: "AND" }).slice(0, MAX_RESULTS);
  if (results.length === 0) return;
  for (const r of results) {
    const { line, snippet } = snippetFor(r.text, query);
    process.stdout.write(`${r.path}:${line}:${snippet}\n`);
  }
}

async function runLint() {
  const docs = await loadDocs();
  const failures = [];
  for (const d of docs) {
    if (!d.tags.includes("failure-mode")) continue;
    if (!d.text.includes(FAILURE_MODE_REQUIRED_HEADING)) {
      failures.push(`${d.path}: missing "${FAILURE_MODE_REQUIRED_HEADING}" heading`);
    }
  }
  if (failures.length > 0) {
    for (const f of failures) process.stderr.write(`${f}\n`);
    process.exit(1);
  }
  const tagged = docs.filter((d) => d.tags.includes("failure-mode")).length;
  process.stdout.write(`lint ok: ${tagged} failure-mode doc(s) checked\n`);
}

const [, , subcommand, ...rest] = process.argv;

if (subcommand === "search") {
  await runSearch(rest);
} else if (subcommand === "lint") {
  await runLint();
} else if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  process.stdout.write("nkb — local full-text search over the n8n knowledge base\n\nusage:\n  nkb search [--tag <name>] <query>\n  nkb search --tag <name>\n  nkb lint\n");
} else {
  process.stderr.write(`nkb: unknown subcommand "${subcommand}"\n`);
  process.exit(2);
}
