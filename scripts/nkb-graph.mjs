#!/usr/bin/env node
// nkb-graph: render a Mermaid dependency graph of pattern docs, and
// optionally fail-closed when any pattern references a non-existent slug.
//
// Convention: each pattern doc is `<dir>/<slug>.md`. A pattern declares its
// dependencies via a `## Depends-on` section containing a bullet list:
//
//   ## Depends-on
//   - other-pattern-slug
//   - another-pattern-slug
//
// Slugs match the basename of a sibling `.md` file (case-sensitive).
//
// Usage:
//   node scripts/nkb-graph.mjs                       # mermaid to stdout
//   node scripts/nkb-graph.mjs --dir workflow-patterns
//   node scripts/nkb-graph.mjs --check               # exit 1 on broken links
//   node scripts/nkb-graph.mjs --check --format json # json report

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = { dir: "workflow-patterns", check: false, format: "mermaid" };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dir") opt.dir = args[++i];
  else if (a === "--check") opt.check = true;
  else if (a === "--format") opt.format = args[++i];
  else if (a === "-h" || a === "--help") {
    process.stdout.write(
      "Usage: nkb-graph [--dir <path>] [--check] [--format mermaid|json]\n",
    );
    process.exit(0);
  } else {
    process.stderr.write(`nkb-graph: unknown arg: ${a}\n`);
    process.exit(2);
  }
}

const dir = resolve(opt.dir);
let entries;
try {
  entries = readdirSync(dir).filter((n) => n.endsWith(".md"));
} catch (err) {
  process.stderr.write(`nkb-graph: cannot read ${dir}: ${err.message}\n`);
  process.exit(2);
}

const patterns = new Map(); // slug -> { slug, deps: [], path }
for (const name of entries.sort()) {
  const path = join(dir, name);
  if (!statSync(path).isFile()) continue;
  const slug = basename(name, ".md");
  patterns.set(slug, { slug, deps: parseDeps(readFileSync(path, "utf8")), path });
}

function parseDeps(src) {
  const lines = src.split(/\r?\n/);
  let inSection = false;
  const deps = [];
  for (const line of lines) {
    if (/^##\s+Depends-on\s*$/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (/^##\s+/.test(line)) break; // next section
      const m = line.match(/^\s*-\s+([a-z0-9][a-z0-9-]*)\s*$/i);
      if (m) deps.push(m[1]);
    }
  }
  return deps;
}

// Resolve broken links: any dep slug that is not a known pattern.
const broken = [];
const known = new Set(patterns.keys());
for (const p of patterns.values()) {
  for (const dep of p.deps) {
    if (!known.has(dep)) broken.push({ from: p.slug, to: dep });
  }
}

if (opt.check) {
  if (opt.format === "json") {
    process.stdout.write(
      JSON.stringify(
        {
          patterns: patterns.size,
          edges: countEdges(patterns),
          broken,
          ok: broken.length === 0,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    if (broken.length === 0) {
      process.stdout.write(
        `nkb-graph check: ok — ${patterns.size} pattern(s), ${countEdges(patterns)} edge(s), 0 broken\n`,
      );
    } else {
      process.stderr.write(
        `nkb-graph check: ${broken.length} broken link(s):\n`,
      );
      for (const b of broken) {
        process.stderr.write(`  - ${b.from} → ${b.to} (no such pattern)\n`);
      }
    }
  }
  process.exit(broken.length === 0 ? 0 : 1);
}

if (opt.format === "json") {
  process.stdout.write(
    JSON.stringify(
      {
        patterns: [...patterns.values()].map((p) => ({
          slug: p.slug,
          deps: p.deps,
        })),
        broken,
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(0);
}

// Default: mermaid
const out = ["graph LR"];
for (const slug of [...patterns.keys()].sort()) {
  out.push(`  ${mid(slug)}["${slug}"]`);
}
for (const p of [...patterns.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
  for (const dep of p.deps) {
    const arrow = known.has(dep) ? "-->" : "-.->|missing|";
    out.push(`  ${mid(p.slug)} ${arrow} ${mid(dep)}`);
  }
}
process.stdout.write("```mermaid\n" + out.join("\n") + "\n```\n");

function mid(slug) {
  return slug.replace(/-/g, "_");
}

function countEdges(map) {
  let n = 0;
  for (const p of map.values()) n += p.deps.length;
  return n;
}
