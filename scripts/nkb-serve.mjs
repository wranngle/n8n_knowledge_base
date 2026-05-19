#!/usr/bin/env node
import { createServer } from "node:http";
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
const DEFAULT_PORT = 7321;
const DEFAULT_HOST = "127.0.0.1";

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
  const line = text.slice(0, hit).split("\n").length;
  return {
    line,
    snippet: text.slice(start, end).replace(/\s+/g, " ").trim(),
  };
}

function parseArgs(argv) {
  const opts = { port: Number(process.env.NKB_PORT) || DEFAULT_PORT, host: process.env.NKB_HOST || DEFAULT_HOST };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port" || a === "-p") opts.port = Number(argv[++i]);
    else if (a === "--host" || a === "-h") opts.host = argv[++i];
    else if (a === "--help") opts.help = true;
  }
  return opts;
}

function searchOnce(idx, query) {
  const t0 = process.hrtime.bigint();
  const raw = idx.search(query, { combineWith: "AND" }).slice(0, MAX_RESULTS);
  const hits = raw.map((r) => {
    const { line, snippet } = snippetFor(r.text, query);
    return { path: r.path, line, snippet, score: r.score };
  });
  const elapsed_ms = Number((process.hrtime.bigint() - t0) / 1_000_000n);
  return { hits, elapsed_ms };
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write("nkb-serve — HTTP search shim over the n8n knowledge base\n\nusage:\n  node scripts/nkb-serve.mjs [--port N] [--host H]\n\nendpoints:\n  GET /search?q=<query> → { hits: [{path, line, snippet, score}], elapsed_ms }\n  GET /health           → { ok: true, docs: N }\n");
    return;
  }
  const docs = await loadDocs();
  const idx = buildIndex(docs);

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method !== "GET") {
      jsonResponse(res, 405, { error: "method_not_allowed" });
      return;
    }
    if (url.pathname === "/health") {
      jsonResponse(res, 200, { ok: true, docs: docs.length });
      return;
    }
    if (url.pathname === "/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        jsonResponse(res, 400, { error: "missing_q", hits: [], elapsed_ms: 0 });
        return;
      }
      jsonResponse(res, 200, searchOnce(idx, q));
      return;
    }
    jsonResponse(res, 404, { error: "not_found" });
  });

  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => {
      process.stdout.write(`nkb-serve listening on http://${opts.host}:${opts.port} (${docs.length} docs)\n`);
      resolveListen();
    });
  });

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => { server.close(() => process.exit(0)); });
  }
}

await main();
