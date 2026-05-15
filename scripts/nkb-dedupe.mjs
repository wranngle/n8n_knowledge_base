#!/usr/bin/env node
// nkb-dedupe — flag near-duplicate pattern docs via TF-IDF cosine similarity.
// Defaults to scanning workflow-patterns/ plus fixtures/dedupe/ when --include-fixtures is set.

process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });

import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const PATTERN_ROOTS = ["workflow-patterns"];
const FIXTURE_ROOT = "fixtures/dedupe";
const PATTERN_EXTS = new Set([".md"]);
const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","is","are","was","were","be",
  "been","being","of","in","on","at","to","for","with","by","from","as","this",
  "that","these","those","it","its","into","over","under","you","your","we","our",
  "i","my","they","their","them","not","no","do","does","did","can","cannot","will",
  "would","should","could","may","might","have","has","had","so","such","than",
  "which","who","whom","what","when","where","why","how","there","here","one","two",
  "tags","failure-mode","dead-end","workaround",
]);

function args() {
  const out = { threshold: 0.75, includeFixtures: false, json: false, paths: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--threshold" || a === "-t") out.threshold = parseFloat(argv[++i]);
    else if (a === "--include-fixtures") out.includeFixtures = true;
    else if (a === "--json") out.json = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else out.paths.push(a);
  }
  return out;
}

async function walk(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf(".");
      const ext = dot === -1 ? "" : entry.name.slice(dot).toLowerCase();
      if (PATTERN_EXTS.has(ext)) out.push(full);
    }
  }
  return out;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[^a-z0-9\-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function termFreq(tokens) {
  const tf = new Map();
  for (const tok of tokens) tf.set(tok, (tf.get(tok) || 0) + 1);
  return tf;
}

function docFreq(docs) {
  const df = new Map();
  for (const d of docs) for (const tok of d.tf.keys()) df.set(tok, (df.get(tok) || 0) + 1);
  return df;
}

function tfidfVector(tf, df, N) {
  const vec = new Map();
  for (const [tok, count] of tf) {
    const idf = Math.log((N + 1) / ((df.get(tok) || 0) + 1)) + 1;
    vec.set(tok, count * idf);
  }
  return vec;
}

function norm(vec) {
  let s = 0;
  for (const v of vec.values()) s += v * v;
  return Math.sqrt(s);
}

function cosine(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [tok, v] of small) {
    const w = large.get(tok);
    if (w !== undefined) dot += v * w;
  }
  const na = norm(a), nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot / (na * nb);
}

async function loadDocs(roots) {
  const docs = [];
  for (const root of roots) {
    const abs = join(REPO_ROOT, root);
    try { await stat(abs); } catch { continue; }
    const files = await walk(abs);
    for (const file of files) {
      try {
        const text = await readFile(file, "utf8");
        const tokens = tokenize(text);
        if (tokens.length < 10) continue;
        docs.push({ path: relative(REPO_ROOT, file), tf: termFreq(tokens) });
      } catch { /* skip */ }
    }
  }
  return docs;
}

function pairs(docs, threshold) {
  const df = docFreq(docs);
  const N = docs.length;
  const vecs = docs.map((d) => ({ path: d.path, vec: tfidfVector(d.tf, df, N) }));
  const out = [];
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      const sim = cosine(vecs[i].vec, vecs[j].vec);
      if (sim >= threshold) out.push({ a: vecs[i].path, b: vecs[j].path, similarity: sim });
    }
  }
  out.sort((x, y) => y.similarity - x.similarity);
  return out;
}

function renderTable(rows) {
  if (rows.length === 0) return "no duplicate pairs above threshold\n";
  const aw = Math.max(...rows.map((r) => r.a.length), 1);
  const bw = Math.max(...rows.map((r) => r.b.length), 1);
  const lines = [
    `${"similarity".padEnd(10)}  ${"path a".padEnd(aw)}  path b`,
    `${"-".repeat(10)}  ${"-".repeat(aw)}  ${"-".repeat(bw)}`,
  ];
  for (const r of rows) lines.push(`${r.similarity.toFixed(4).padEnd(10)}  ${r.a.padEnd(aw)}  ${r.b}`);
  return lines.join("\n") + "\n";
}

async function main() {
  const opts = args();
  if (opts.help) {
    process.stdout.write(
      "nkb-dedupe — find near-duplicate pattern docs via TF-IDF cosine\n\n" +
      "usage:\n  node scripts/nkb-dedupe.mjs [--threshold 0.75] [--include-fixtures] [--json]\n",
    );
    return;
  }
  if (!Number.isFinite(opts.threshold) || opts.threshold < 0 || opts.threshold > 1) {
    process.stderr.write("nkb-dedupe: --threshold must be a number in [0,1]\n");
    process.exit(2);
  }
  const roots = [...PATTERN_ROOTS];
  if (opts.includeFixtures) roots.push(FIXTURE_ROOT);
  const docs = await loadDocs(roots);
  const found = pairs(docs, opts.threshold);
  if (opts.json) process.stdout.write(JSON.stringify({ threshold: opts.threshold, pairs: found }, null, 2) + "\n");
  else process.stdout.write(renderTable(found));
}

await main();
