---
name: research-waterfall
description: How a technical-research record gets made. The live integration research waterfall (n8n-MCP, Context7, Exa), the complexity rubric, and the tier-to-hours mapping that make every estimated_hours field in this repo mean something.
---

# The Research Waterfall

This is the canonical procedure for producing a record under `technical-research/`.
It descends from the `technical-research` skill of the presales pipeline (now
ported to `gtm_ops`); this repository keeps the method and curates the records it
produces. The complexity rubric and the tier-to-hours mapping below are the
contract that turns each record's `complexity` / `estimated_hours` fields from
decoration into an input `nkb estimate` can sum.

## Purpose

The waterfall performs **live integration research** before a workflow is built.
Each record it produces enriches three downstream consumers:

- Technical approach (native nodes, auth types, API complexity)
- Labor estimates (research-backed hour adjustments)
- FinOps calculations (accurate usage projections)

## When to run it

Before building any n8n workflow that touches an integration you do not already
have a fresh record for. A record older than 90 days is stale (see
[Freshness](#freshness-and-gap-reports)) and should be re-run.

## Research protocol

### Step 1: Extract integrations

Read the intake / brief and extract every system or integration mentioned:

- "Section C: Systems & Handoffs" style enumerations
- Direct mentions: "CRM (HubSpot)", "Email (Outlook)"
- Bare technology names: Salesforce, Slack, Twilio

### Step 2: Run the waterfall for each integration

Execute this waterfall, in order, for **each** detected integration. Stop at the
first tier that answers the question; fall through only when it does not.

#### 2a. Check n8n native-node availability (n8n-MCP)

```
mcp__n8n-mcp__search_nodes({ query: "{integration_name}" })
```

If found with high relevance:

```
mcp__n8n-mcp__get_node_documentation({ nodeType: "nodes-base.{name}" })
```

Extract:
- `has_native_node: true | false`
- `auth_type: "oauth2" | "api_key" | "basic" | "none"`
- `node_operations: ["create", "get", "update", "delete", ...]`

Do not invent nodes. If `search_nodes` returns nothing, the integration has **no
native node** — record that, do not guess a node name. (Several stub records in
this repo's history claimed nodes that do not exist; that is the failure this step
prevents.)

#### 2b. Get SDK / library documentation (Context7)

```
mcp__context7__resolve-library-id({ libraryName: "{integration_name} API" })
mcp__context7__get-library-docs({
  context7CompatibleLibraryID: "{resolved_id}",
  topic: "authentication",
  mode: "code"
})
```

Extract:
- `api_base_url`
- `rate_limits` (requests per minute / hour)
- `auth_flow` (OAuth scopes, API-key header, etc.)

#### 2c. Deep research (Exa)

```
mcp__exa__web_search_exa({
  query: "{integration_name} API integration best practices rate limits",
  numResults: 5
})
```

Extract:
- Known integration challenges
- Common pitfalls
- Third-party connector options

### Step 3: Score complexity

Score the integration from the research findings:

| Factor | Score impact |
|--------|--------------|
| Has native n8n node | -2 (easier) |
| OAuth2 auth required | +1 |
| Rate limits < 100/min | +1 |
| Webhook support | -1 (easier) |
| Custom auth / encryption | +2 |
| Legacy / SOAP API | +3 |
| No public docs | +2 |

**Complexity tiers → base hours:**

| Score | Tier | Base hours |
|-------|------|------------|
| 0-2 | `standard` | 40 |
| 3-5 | `moderate` | 60 |
| 6-8 | `complex` | 80 |
| 9+ | `enterprise` | 120 |

This tier-to-hours mapping is the one `nkb estimate` reads. A record's
`complexity.tier` is authoritative; its stored `estimated_hours` is advisory
context.

### Step 4: Write the record

Write the record under `technical-research/{slug}.md` (front-mattered markdown)
or `technical-research/{slug}.json` (matching the survivor schema, e.g.
`technical-research/salesforce.json`). Use kebab-case slugs.

Markdown template:

```markdown
---
tags: [research]
---

# {Integration Name} Integration Research

**Business Process**: {from brief}
**Research Date**: {ISO date}
**Researcher Confidence**: {percentage}%

## Executive Summary

{1-2 paragraph summary of integration approach}

## Detected Integrations

| Integration | Native Node | Auth Type | Docs Available | Confidence |
|-------------|-------------|-----------|----------------|------------|
| {name} | Yes/No | {auth} | Yes/No | {pct}% |

## Complexity Analysis

### Overall Score: {N}/10 → {tier}

**Estimated Nodes**: {count}

**Contributing Factors**:
- {factor 1}
- {factor 2}

## Labor Factors

| Factor | Impact | Notes |
|--------|--------|-------|
| {factor} | High/Medium/Low | {notes} |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| {risk} | {likelihood} | {impact} | {mitigation} |

## Effort Recommendation

**Tier**: {tier}

**Rationale**: {explanation}

**Caveats**:
- {caveat 1}

## Citations

1. {url} - {description}
```

JSON records follow the survivor schema: `integration`, `has_native_node`,
`native_node_name`, `auth_type`, `api_quality`, a `complexity` block
(`score` / `tier` / `estimated_hours`), an `effort_recommendation`
(`tier` / `base_hours` / `rationale`), and a `freshness` block. Records recovered
from git history additionally carry `recovered_from: <commit>`.

### Step 5: Rebuild the index

There is no hand-maintained library index in this repo. After adding or editing a
record, rebuild the search index:

```bash
node scripts/build-index.mjs
```

This regenerates `dist/index.json` from everything under `technical-research/`,
`workflow-patterns/`, and `elevenlabs-agents/`, which is what `nkb search` reads.

### Step 6: Return a summary

After research completes, report per integration:

```
Integrations researched: {count}
- {int1}: {tier} ({native node | HTTP required})
- {int2}: {tier} ({native node | HTTP required})

Overall complexity: {overall_tier}
Base-hours recommendation: {hours}
Record written to: technical-research/{slug}.{md|json}
```

## Freshness and gap reports

A record decays. The rubric this repo inherits:

- Research fresher than 30 days: full confidence.
- Research older than 90 days: score clamped to **0.2**, flagged stale.

`nkb freshness` walks every record and flags stale ones with an actionable gap
report line ("research_date older than 90d — re-run the research waterfall").
When `nkb estimate` is asked about an integration with no record at all, it emits
the same gap-report pattern rather than guessing a number.

## MCP tools used

| Tool | Purpose |
|------|---------|
| `mcp__n8n-mcp__search_nodes` | Check for a native n8n node |
| `mcp__n8n-mcp__get_node_documentation` | Get node usage docs |
| `mcp__n8n-mcp__get_node_essentials` | Quick node config reference |
| `mcp__context7__resolve-library-id` | Find SDK docs |
| `mcp__context7__get-library-docs` | Get API documentation |
| `mcp__exa__web_search_exa` | Deep research fallback |

## Downstream consumers

- `nkb estimate <integration...>` — sums tier base hours across records (this repo).
- `nkb freshness` — flags records past the 90-day decay line (this repo).
- The presales / FinOps pipeline in `gtm_ops` — consumes the same records for
  labor estimates and pricing. The KB curates and scores; `gtm_ops` renders.

## Troubleshooting

- **No native node found**: use the HTTP Request node with authentication; record `has_native_node: false`. Do not fabricate a node name.
- **Context7 returns empty**: fall back to Exa deep research.
- **Rate limits unknown**: default to a conservative 100/min and note the assumption.
- **Auth type unclear**: check official docs manually before recording.
