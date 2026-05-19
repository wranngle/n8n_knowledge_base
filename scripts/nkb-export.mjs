#!/usr/bin/env node
// nkb export --jsonld — emit one schema.org/TechArticle JSON-LD document per
// knowledge-base pattern under `dist/jsonld/<slug>.jsonld`, so downstream LLM
// agents can ingest the corpus through a structured-data lens instead of raw
// markdown scraping.
//
// Designed to plug into the unified `scripts/nkb.mjs` dispatcher established in
// round-1 PR #3 (`feat(nkb): local full-text search CLI`). Until that dispatcher
// re-lands on main, this script is invokable standalone via
// `node scripts/nkb-export.mjs --jsonld`.

import { mkdir, readFile, readdir, writeFile, rm, stat } from "node:fs/promises";
import { dirname, join, resolve, basename, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const PATTERN_DIRS = [
  join(REPO_ROOT, "workflow-patterns"),
  join(REPO_ROOT, "workflow-patterns", "_inbox"),
];
const OUT_DIR = join(REPO_ROOT, "dist", "jsonld");

function parseFlags(argv) {
  const flags = { jsonld: false, help: false, check: false, clean: false };
  for (const a of argv) {
    if (a === "--jsonld") flags.jsonld = true;
    else if (a === "--check") flags.check = true;
    else if (a === "--clean") flags.clean = true;
    else if (a === "--help" || a === "-h") flags.help = true;
  }
  return flags;
}

function slugFromFilename(file) {
  return basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFrontmatter(text) {
  if (!text.startsWith("---")) return { frontmatter: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: text };
  const block = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const fm = {};
  for (const raw of block.split(/\r?\n/)) {
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
    }
    fm[key] = value;
  }
  return { frontmatter: fm, body };
}

function extractH1(body) {
  const match = body.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

function extractAbstract(body) {
  for (const block of body.split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("|")) continue;
    if (trimmed.startsWith("```")) continue;
    if (trimmed.startsWith("---")) continue;
    if (trimmed.startsWith(">")) continue;
    // Skip "metadata blocks" where every line is **Key**: value style.
    const lines = trimmed.split(/\r?\n/);
    const allMetadata = lines.every((line) => /^\*\*[^*]+\*\*:/.test(line.trim()));
    if (allMetadata) continue;
    const flattened = trimmed.replace(/\s+/g, " ").replace(/\*\*/g, "");
    return flattened.length > 600 ? `${flattened.slice(0, 597)}...` : flattened;
  }
  return "";
}

function wordCount(body) {
  return body.split(/\s+/).filter(Boolean).length;
}

async function* walkPatternFiles() {
  for (const dir of PATTERN_DIRS) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".md")) continue;
      yield join(dir, entry.name);
    }
  }
}

function buildJsonLd({ slug, sourcePath, frontmatter, body }) {
  const title = (typeof frontmatter.title === "string" && frontmatter.title) || extractH1(body) || slug;
  const description = extractAbstract(body);
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
  const submitter = typeof frontmatter.submitter === "string" ? frontmatter.submitter : null;
  const submittedAt = typeof frontmatter.submitted_at === "string" ? frontmatter.submitted_at : null;
  const relPath = relative(REPO_ROOT, sourcePath).replace(/\\/g, "/");
  const doc = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `urn:nkb:pattern:${slug}`,
    identifier: slug,
    name: title,
    headline: title,
    description,
    inLanguage: "en",
    keywords: tags,
    isPartOf: {
      "@type": "Dataset",
      name: "wranngle/n8n_knowledge_base",
      url: "https://github.com/wranngle/n8n_knowledge_base",
    },
    sourceFile: relPath,
    wordCount: wordCount(body),
    proficiencyLevel: "Expert",
  };
  if (submitter) doc.author = { "@type": "Person", name: submitter };
  if (submittedAt) doc.dateCreated = submittedAt;
  return doc;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help || (!flags.jsonld && !flags.check)) {
    process.stdout.write(
      "nkb export — emit machine-readable representations of patterns.\n\n" +
        "usage:\n" +
        "  nkb export --jsonld          write dist/jsonld/<slug>.jsonld for every pattern\n" +
        "  nkb export --jsonld --clean  remove dist/jsonld/ before writing\n" +
        "  nkb export --check           exit non-zero if dist/jsonld/ is missing a pattern\n",
    );
    return flags.help ? 0 : 2;
  }

  const patternFiles = [];
  for await (const file of walkPatternFiles()) patternFiles.push(file);

  if (flags.check) {
    const missing = [];
    for (const file of patternFiles) {
      const slug = slugFromFilename(file);
      const target = join(OUT_DIR, `${slug}.jsonld`);
      if (!(await exists(target))) missing.push(slug);
    }
    if (missing.length > 0) {
      process.stderr.write(`nkb export --check: missing jsonld for ${missing.length} pattern(s):\n`);
      for (const slug of missing) process.stderr.write(`  - ${slug}\n`);
      return 1;
    }
    process.stdout.write(`nkb export --check: all ${patternFiles.length} pattern(s) have jsonld output\n`);
    return 0;
  }

  if (flags.clean) {
    await rm(OUT_DIR, { recursive: true, force: true });
  }
  await mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const file of patternFiles) {
    const slug = slugFromFilename(file);
    if (!slug) continue;
    const text = await readFile(file, "utf8");
    const { frontmatter, body } = parseFrontmatter(text);
    const doc = buildJsonLd({ slug, sourcePath: file, frontmatter, body });
    const target = join(OUT_DIR, `${slug}.jsonld`);
    await writeFile(target, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    written += 1;
  }
  process.stdout.write(`nkb export --jsonld: wrote ${written} file(s) to ${relative(REPO_ROOT, OUT_DIR)}/\n`);
  return 0;
}

main().then(
  (code) => process.exit(code || 0),
  (err) => {
    process.stderr.write(`nkb export: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  },
);
