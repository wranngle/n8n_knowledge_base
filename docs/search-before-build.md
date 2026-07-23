---
name: search-before-build
description: The mandatory pre-build search phase. Before placing a single node in a new n8n workflow, search the three corpora — your own instance, the Zie619 community library, and the n8n-MCP templates — so "has someone already built this?" is a query, not a guess.
---

# Search before you build (mandatory)

This is a build discipline recovered from the methodology framework, where
searching the existing corpora was a required step — "2. SEARCH (MANDATORY)" —
that ran before any node was placed. The corpora together index roughly **7,052
workflows** (Zie619 4,343 + n8n-MCP templates 2,709). Skipping the search is how
you rebuild something that already exists.

Run all three searches before building a new workflow:

## 1. Your own n8n instance

Search the workflows already deployed on your instance (n8n-MCP, when connected):

```
mcp__n8n-mcp__list_workflows({ query: "<keywords>" })
```

A match here means the capability already exists in production — extend or clone
it rather than starting over. This is also where the DEV-only governance rules in
the project CLAUDE.md apply.

## 2. The Zie619 community library (~4,343 workflows)

The public `Zie619/n8n-workflows` repository is a large corpus of community
workflow JSONs. This repo ships a search module over it:

```bash
# One-time (needs network): fetch and cache the file index under .cache/ (gitignored)
node scripts/search-community.mjs --refresh

# Then search offline
node scripts/search-community.mjs "twilio voice webhook"
node scripts/search-community.mjs "salesforce lead" --json
```

Each hit prints the workflow name and a raw GitHub URL you can open or import.
`GITHUB_TOKEN` in the environment raises the API rate limit on `--refresh`.

## 3. The n8n-MCP template corpus (2,709 templates)

When the n8n-MCP server is connected, search its template corpus too:

```
mcp__n8n-mcp__search_templates({ query: "<keywords>" })
mcp__n8n-mcp__get_template({ templateId: "<id>" })
```

`node scripts/search-community.mjs --mcp` prints these calls as a reminder.

## Then, and only then

If none of the three corpora has it, proceed to build — and run the
[research waterfall](research-waterfall.md) for each integration the new workflow
touches, so its cost and gotchas are known before the first node lands.
