---
tags: [failure-mode, dead-end]
---

# ElevenLabs Conversational AI Tool-Name Collisions

> Pattern: a Conversational AI agent silently calls the wrong tool, or refuses to call any tool, when two tool definitions share a prefix or near-identical name.

## Symptom

An agent is configured with tools like `lookup_customer` and `lookup_customer_orders`. In production, the agent either (a) routes both intents to `lookup_customer` and ignores the orders one, or (b) returns a generic "I can't help with that" turn despite the intent clearly matching a tool. Re-prompting does not help. Logs show the model output a tool call to the wrong name, or no tool call at all.

## Why this fails

The agent's tool-routing layer uses the model's natural-language description of the tool plus the tool name to disambiguate. When names share a common prefix and the descriptions are too similar ("Look up a customer" vs "Look up a customer's orders"), the model collapses them into a single semantic slot. This is a model-side ambiguity, not an n8n bug — the workflow on the other side of the webhook never gets called because the tool selection never happens, or it happens for the wrong tool. There is no console error; the failure is silent.

## Workaround

1. Rename tools by **verb + object + qualifier** so the names are lexically distinct: `customer_lookup_by_phone` vs `customer_orders_list_recent`.
2. Make tool descriptions assert the *boundary*, not just the capability: "Use ONLY when the caller has not yet given their order number; do NOT use to retrieve orders."
3. If two tools genuinely share a domain, collapse them into one with a required `mode` enum parameter.

## Sources

- ElevenLabs Conversational AI tool-definition guide.
- OpenAI function-calling best-practices doc (general LLM tool-routing principle).
- Internal agent-eval transcripts, 2026-Q1.
