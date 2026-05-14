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

async function loadDocs() {
  const docs = [];
  for (const root of SEARCH_ROOTS) {
    const abs = join(REPO_ROOT, root);
    try { await stat(abs); } catch { continue; }
    const files = await walk(abs);
    for (const file of files) {
      try {
        const text = await readFile(file, "utf8");
        docs.push({ id: relative(REPO_ROOT, file), path: relative(REPO_ROOT, file), text });
      } catch {
        // skip unreadable
      }
    }
  }
  return docs;
}

function buildIndex(docs) {
  const idx = new MiniSearch({
    fields: ["path", "text"],
    storeFields: ["path", "text"],
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
  const before = text.slice(0, start).lastIndexOf("\n");
  const line = before === -1 ? 1 : text.slice(0, hit).split("\n").length;
  return {
    line,
    snippet: text.slice(start, end).replace(/\s+/g, " ").trim(),
  };
}

async function runSearch(query) {
  if (!query) {
    process.stderr.write("usage: nkb search <query>\n");
    process.exit(2);
  }
  const docs = await loadDocs();
  const idx = buildIndex(docs);
  const results = idx.search(query, { combineWith: "AND" }).slice(0, MAX_RESULTS);
  if (results.length === 0) {
    return;
  }
  for (const r of results) {
    const { line, snippet } = snippetFor(r.text, query);
    process.stdout.write(`${r.path}:${line}:${snippet}\n`);
  }
}

const [, , subcommand, ...rest] = process.argv;

if (subcommand === "search") {
  await runSearch(rest.join(" "));
} else if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  process.stdout.write("nkb — local full-text search over the n8n knowledge base\n\nusage:\n  nkb search <query>\n");
} else {
  process.stderr.write(`nkb: unknown subcommand "${subcommand}"\n`);
  process.exit(2);
}
