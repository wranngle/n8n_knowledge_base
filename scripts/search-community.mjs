#!/usr/bin/env node
// search-community — search the public community workflow corpora before building.
//
// Restores the "SEARCH (MANDATORY)" pre-build phase from the methodology
// framework: before placing a single node, check whether someone has already
// built the workflow. Two corpora:
//
//   (a) Zie619/n8n-workflows — ~4,343 community workflow JSONs on GitHub. This
//       module fetches the repo's file list via the GitHub API, caches it under
//       a gitignored .cache/ dir, and searches names/keywords locally with
//       minisearch. No API key required; set GITHUB_TOKEN to raise rate limits.
//   (b) n8n-MCP templates — 2,709 templates served by the n8n-MCP server. Those
//       are not fetched here (they need the live MCP server); `--mcp` prints the
//       exact tool calls to run when it is available.
//
// Usage:
//   node scripts/search-community.mjs <query> [--limit N] [--json]
//   node scripts/search-community.mjs --refresh        # fetch + cache the Zie619 index (network)
//   node scripts/search-community.mjs --mcp            # how to search MCP templates
//
// Env:
//   NKB_COMMUNITY_INDEX  path to an index JSON to search (overrides the cache; used by tests)
//   GITHUB_TOKEN         optional; raises the GitHub API rate limit on --refresh

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import MiniSearch from "minisearch";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CACHE_DIR = join(REPO_ROOT, ".cache", "community");
const CACHE_INDEX = join(CACHE_DIR, "zie619-index.json");
const REPO_SLUG = "Zie619/n8n-workflows";

// --- corpus refresh (network) --------------------------------------------

function ghHeaders() {
  const h = { "user-agent": "n8n_knowledge_base-search-community", accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function ghJson(url) {
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function entryFromPath(path, branch) {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const name = filename.replace(/\.json$/i, "").replace(/[_-]+/g, " ").trim();
  return {
    id: path,
    name,
    filename,
    path,
    url: `https://raw.githubusercontent.com/${REPO_SLUG}/${branch}/${path}`,
  };
}

async function refresh() {
  const meta = await ghJson(`https://api.github.com/repos/${REPO_SLUG}`);
  const branch = meta.default_branch || "main";
  const tree = await ghJson(`https://api.github.com/repos/${REPO_SLUG}/git/trees/${branch}?recursive=1`);
  if (tree.truncated) process.stderr.write("warning: GitHub tree was truncated; index may be partial\n");
  const workflows = (tree.tree || [])
    .filter((n) => n.type === "blob" && /(^|\/)workflows\/.+\.json$/i.test(n.path))
    .map((n) => entryFromPath(n.path, branch));
  const payload = {
    source: REPO_SLUG,
    branch,
    fetched_at: new Date().toISOString(),
    count: workflows.length,
    workflows,
  };
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_INDEX, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return payload;
}

// --- search (offline) ----------------------------------------------------

export async function loadIndex(indexPath) {
  const path = indexPath || process.env.NKB_COMMUNITY_INDEX || CACHE_INDEX;
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

export function searchWorkflows(payload, query, limit = 20) {
  const mini = new MiniSearch({
    fields: ["name", "filename"],
    storeFields: ["name", "filename", "path", "url"],
    searchOptions: { prefix: true, fuzzy: 0.2, combineWith: "AND" },
  });
  mini.addAll(payload.workflows);
  return mini.search(query).slice(0, limit);
}

const MCP_GUIDE = `Search the n8n-MCP template corpus (2,709 templates) when the MCP server is available:

  mcp__n8n-mcp__search_templates({ query: "<keywords>" })
  mcp__n8n-mcp__get_template({ templateId: "<id>" })      # inspect a match
  mcp__n8n-mcp__list_node_templates({ nodeType: "n8n-nodes-base.<node>" })

Run this alongside 'search-community <query>' (Zie619 corpus) and a search of your
own n8n instance before building. See docs/search-before-build.md.
`;

// --- CLI -----------------------------------------------------------------

function parseFlags(argv) {
  const flags = { limit: 20, json: false, refresh: false, mcp: false, help: false, index: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--refresh") flags.refresh = true;
    else if (a === "--mcp") flags.mcp = true;
    else if (a === "--json") flags.json = true;
    else if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--limit") flags.limit = Number.parseInt(argv[++i], 10);
    else if (a.startsWith("--limit=")) flags.limit = Number.parseInt(a.slice("--limit=".length), 10);
    else if (a === "--index") flags.index = argv[++i];
    else if (a.startsWith("--index=")) flags.index = a.slice("--index=".length);
    else positional.push(a);
  }
  if (!Number.isFinite(flags.limit) || flags.limit <= 0) flags.limit = 20;
  return { flags, query: positional.join(" ").trim() };
}

const HELP = `search-community — search public n8n workflow corpora before building

usage:
  node scripts/search-community.mjs <query> [--limit N] [--json]
  node scripts/search-community.mjs --refresh   # fetch + cache Zie619 index (network)
  node scripts/search-community.mjs --mcp       # how to search n8n-MCP templates

The Zie619 index is cached under .cache/community/ (gitignored). Run --refresh
once (needs network) to populate it, then search offline.`;

async function main() {
  const { flags, query } = parseFlags(process.argv.slice(2));
  if (flags.help) { process.stdout.write(HELP + "\n"); return; }
  if (flags.mcp) { process.stdout.write(MCP_GUIDE); return; }
  if (flags.refresh) {
    const payload = await refresh();
    process.stdout.write(`cached ${payload.count} workflows from ${payload.source}@${payload.branch} to ${join(".cache", "community", "zie619-index.json")}\n`);
    return;
  }
  if (!query) { process.stderr.write("usage: search-community <query>  (or --refresh / --mcp / --help)\n"); process.exit(2); }

  let payload;
  try {
    payload = await loadIndex(flags.index);
  } catch {
    process.stderr.write("no community index found. Run `node scripts/search-community.mjs --refresh` first (needs network).\n");
    process.exit(3);
  }
  const hits = searchWorkflows(payload, query, flags.limit);
  if (flags.json) { process.stdout.write(JSON.stringify({ query, count: hits.length, hits }, null, 2) + "\n"); return; }
  if (hits.length === 0) { process.stdout.write(`no community workflows match "${query}" (searched ${payload.count} from ${payload.source}).\n`); return; }
  for (const h of hits) process.stdout.write(`${h.name}  ${h.url}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { process.stderr.write(`search-community: ${err.message}\n`); process.exit(1); });
}
