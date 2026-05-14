#!/usr/bin/env node
// Build dist/index.json from markdown + JSON under workflow-patterns/, technical-research/,
// elevenlabs-agents/. Parses YAML front-matter `tags:` (block or flow form) and indexes
// each document with id, path, tags[], and a trimmed text excerpt. Output is a plain JSON
// object that MiniSearch can ingest via `idx.addAll(payload.docs)`.

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const ROOTS = ["workflow-patterns", "technical-research", "elevenlabs-agents"];
const EXTS = new Set([".md", ".json", ".yaml", ".yml"]);
const TEXT_LIMIT = 4000;

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
      if (EXTS.has(ext)) out.push(full);
    }
  }
  return out;
}

function parseFrontMatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return { tags: [], body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { tags: [], body: text };
  const header = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const tags = extractTags(header);
  return { tags, body };
}

function extractTags(header) {
  const flow = header.match(/^tags:\s*\[([^\]]*)\]\s*$/m);
  if (flow) {
    return flow[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  const block = header.match(/^tags:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m);
  if (block) {
    return block[1]
      .split("\n")
      .map((line) => line.match(/^\s*-\s*(.+?)\s*$/))
      .filter(Boolean)
      .map((m) => m[1].replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [];
}

async function buildPayload() {
  const docs = [];
  for (const root of ROOTS) {
    const abs = join(REPO_ROOT, root);
    try { await stat(abs); } catch { continue; }
    const files = await walk(abs);
    for (const file of files.sort()) {
      let text;
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const ext = file.slice(file.lastIndexOf("."));
      const { tags, body } = ext === ".md" ? parseFrontMatter(text) : { tags: [], body: text };
      const path = relative(REPO_ROOT, file);
      docs.push({
        id: path,
        path,
        tags,
        text: body.length > TEXT_LIMIT ? body.slice(0, TEXT_LIMIT) : body,
      });
    }
  }
  return {
    generatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    schema: {
      fields: ["path", "tags", "text"],
      storeFields: ["path", "tags"],
      idField: "id",
    },
    docs,
  };
}

async function main() {
  const payload = await buildPayload();
  const distDir = join(REPO_ROOT, "dist");
  await mkdir(distDir, { recursive: true });
  const out = join(distDir, "index.json");
  await writeFile(out, JSON.stringify(payload, null, 2) + "\n", "utf8");
  process.stdout.write(`build-index: wrote ${relative(REPO_ROOT, out)} (${payload.docs.length} docs)\n`);
}

main().catch((err) => {
  process.stderr.write(`build-index: ${err.stack || err.message}\n`);
  process.exit(1);
});
