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
// Research-waterfall rubric: complexity tier -> base hours (docs/research-waterfall.md).
const RUBRIC_TIER_HOURS = { standard: 40, moderate: 60, complex: 80, enterprise: 120 };
const RESEARCH_DIR = join(REPO_ROOT, "technical-research");
const FRESHNESS_MAX_DAYS = 90;
const WATERFALL_HINT = "run the research waterfall (docs/research-waterfall.md)";

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
    return { tags: [], body: text, lineOffset: 0 };
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { tags: [], body: text, lineOffset: 0 };
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
  // Front matter is dropped from `body`, so any line number computed against
  // `body` runs short by the number of lines the front matter occupied. Count
  // those stripped lines here and add the offset back wherever a file line is
  // reported (snippetFor, tag listing), so `path:line:` points at the real file.
  const lineOffset = text.slice(0, after).split("\n").length - 1;
  return { tags, body: text.slice(after), lineOffset };
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
        const { tags, body, lineOffset } = parseFrontMatter(raw);
        const path = relative(REPO_ROOT, file);
        docs.push({ id: path, path, text: body, tags, tagsText: tags.join(" "), lineOffset });
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
    storeFields: ["path", "text", "tags", "lineOffset"],
    searchOptions: { boost: { path: 2 }, prefix: true, fuzzy: 0.1 },
  });
  idx.addAll(docs);
  return idx;
}

function snippetFor(text, query, lineOffset = 0) {
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
  const line = lineOffset + text.slice(0, hit).split("\n").length;
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
      const lines = d.text.split("\n");
      const idx = lines.findIndex((l) => l.trim().length > 0);
      const firstLine = idx === -1 ? "" : lines[idx];
      const line = d.lineOffset + (idx === -1 ? 1 : idx + 1);
      process.stdout.write(`${d.path}:${line}:[tags=${d.tags.join(",")}] ${firstLine.slice(0, 160).trim()}\n`);
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
    const { line, snippet } = snippetFor(r.text, query, r.lineOffset);
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

async function loadJsonRecords() {
  const out = [];
  let files;
  try { files = await readdir(RESEARCH_DIR); } catch { return out; }
  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    try {
      const rec = JSON.parse(await readFile(join(RESEARCH_DIR, name), "utf8"));
      out.push({
        slug: name.replace(/\.json$/, ""),
        integration: rec.integration ?? null,
        dbMatch: rec._database_match ?? null,
        tier: rec.complexity?.tier ?? rec.effort_recommendation?.tier ?? null,
        estimatedHours: rec.complexity?.estimated_hours ?? rec.effort_recommendation?.base_hours ?? null,
      });
    } catch {
      // skip unparseable record
    }
  }
  return out;
}

function matchRecord(records, name) {
  const q = name.toLowerCase();
  const eq = (v) => v && v.toLowerCase() === q;
  const has = (v) => v && v.toLowerCase().includes(q);
  return (
    records.find((r) => eq(r.slug) || eq(r.integration) || eq(r.dbMatch)) ||
    records.find((r) => has(r.slug) || has(r.integration) || has(r.dbMatch)) ||
    null
  );
}

async function runEstimate(rest) {
  const names = rest.filter((a) => !a.startsWith("-"));
  if (names.length === 0) {
    process.stderr.write("usage: nkb estimate <integration> [<integration>...]\n");
    process.exit(2);
  }
  const records = await loadJsonRecords();
  const lines = [];
  const gaps = [];
  let total = 0;
  for (const name of names) {
    const rec = matchRecord(records, name);
    if (!rec || !rec.tier) {
      gaps.push(name);
      lines.push(`  ${name.padEnd(22)} —          no research record — ${WATERFALL_HINT}`);
      continue;
    }
    const hours = RUBRIC_TIER_HOURS[rec.tier];
    if (hours === undefined) {
      lines.push(`  ${name.padEnd(22)} ${rec.tier.padEnd(10)} not a build tier — skipped`);
      continue;
    }
    total += hours;
    const note = rec.estimatedHours != null && rec.estimatedHours !== hours ? ` (record notes ${rec.estimatedHours}h)` : "";
    lines.push(`  ${name.padEnd(22)} ${rec.tier.padEnd(10)} ${hours}h${note}`);
  }
  process.stdout.write("estimate — rubric tier hours (docs/research-waterfall.md):\n");
  for (const l of lines) process.stdout.write(l + "\n");
  process.stdout.write(`  ${"TOTAL".padEnd(22)} ${"".padEnd(10)} ${total}h across ${names.length - gaps.length} known integration(s)\n`);
  if (gaps.length > 0) {
    process.stdout.write(`  ${gaps.length} unknown: ${gaps.join(", ")}\n`);
  }
}

async function loadDatedRecords() {
  const out = [];
  let files;
  try { files = await readdir(RESEARCH_DIR); } catch { return out; }
  for (const name of files) {
    const full = join(RESEARCH_DIR, name);
    let researchDate = null;
    if (name.endsWith(".json")) {
      try { researchDate = JSON.parse(await readFile(full, "utf8")).research_date ?? null; } catch { continue; }
    } else if (name.endsWith(".md")) {
      try {
        const m = (await readFile(full, "utf8")).match(/^research_date:\s*(.+)$/m);
        researchDate = m ? m[1].trim() : null;
      } catch { continue; }
    } else {
      continue;
    }
    if (researchDate) out.push({ path: `technical-research/${name}`, researchDate });
  }
  return out;
}

async function runFreshness() {
  const records = await loadDatedRecords();
  const now = Date.now();
  const stale = [];
  for (const r of records) {
    const t = Date.parse(r.researchDate);
    if (Number.isNaN(t)) continue;
    const days = Math.floor((now - t) / 86_400_000);
    if (days > FRESHNESS_MAX_DAYS) stale.push({ ...r, days });
  }
  if (stale.length === 0) {
    process.stdout.write(`freshness ok: ${records.length} dated record(s), none older than ${FRESHNESS_MAX_DAYS}d\n`);
    return;
  }
  stale.sort((a, b) => b.days - a.days);
  for (const s of stale) {
    process.stdout.write(`${s.path}: research_date ${s.days}d old (>${FRESHNESS_MAX_DAYS}d) — score 0.2 — ${WATERFALL_HINT}\n`);
  }
  process.stdout.write(`\nfreshness: ${stale.length} of ${records.length} dated record(s) stale\n`);
}

const [, , subcommand, ...rest] = process.argv;

if (subcommand === "search") {
  await runSearch(rest);
} else if (subcommand === "lint") {
  await runLint();
} else if (subcommand === "estimate") {
  await runEstimate(rest);
} else if (subcommand === "freshness") {
  await runFreshness();
} else if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  process.stdout.write("nkb — local search + estimation over the n8n knowledge base\n\nusage:\n  nkb search [--tag <name>] <query>\n  nkb search --tag <name>\n  nkb lint\n  nkb estimate <integration> [<integration>...]\n  nkb freshness\n");
} else {
  process.stderr.write(`nkb: unknown subcommand "${subcommand}"\n`);
  process.exit(2);
}
