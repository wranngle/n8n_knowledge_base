# Knowledge Base Conventions

Conventions for authoring markdown under `workflow-patterns/`, `technical-research/`, and `elevenlabs-agents/`. Indexed by `scripts/nkb.mjs` and enforced by `nkb lint`.

## Front-matter tag schema

Pattern docs that describe a *known failure*, a *dead-end approach to avoid*, or a *workaround for a platform limitation* MUST declare their nature via YAML front-matter:

```markdown
---
tags: [failure-mode, dead-end, workaround]
---
```

### Tag vocabulary

| Tag | Meaning |
|---|---|
| `failure-mode` | The doc describes a real failure observed in production or development; readers should expect a root-cause explanation. Requires `## Why this fails` heading (see below). |
| `dead-end` | The doc documents an approach that *cannot* be made to work — protocol mismatch, missing platform support, model-side limitation — so readers stop trying. |
| `workaround` | The doc documents how to ship around a platform limitation (e.g., a missing native node, a timeout budget) without fixing the underlying cause. |

Tags are additive — a single doc can be `[failure-mode, workaround]` when it describes both the failure and the way around it.

## Required heading for `failure-mode` docs

Every doc tagged `failure-mode` MUST contain an exact `## Why this fails` heading. The section explains the root cause: protocol mismatch, model ambiguity, platform behavior, etc. — not just the symptom.

`scripts/nkb.mjs lint` enforces this and exits non-zero if any tagged doc is missing the heading.

## Querying

```bash
# List all failure-mode docs
node scripts/nkb.mjs search --tag failure-mode

# Full-text search restricted to a tag
node scripts/nkb.mjs search --tag failure-mode "twilio 11200"

# Lint the failure-mode collection
node scripts/nkb.mjs lint
```
