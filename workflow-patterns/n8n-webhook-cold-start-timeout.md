---
tags: [failure-mode, workaround]
---

# n8n Webhook Cold-Start Timeout on Voice-Triggered Workflows

> Pattern: voice agents that POST to an n8n webhook intermittently time out on the first call of the day, then succeed on retry.

## Symptom

An ElevenLabs (or Retell / Vapi / Voiceflow) agent fires a tool call to `https://n8n.example.com/webhook/abc`. The first invocation after a quiet period returns 504 or stalls past the agent's 8s tool-call budget. The agent narrates a fallback line. Subsequent invocations within the same hour return in 200–600ms.

## Why this fails

Self-hosted n8n on shared compute (Render, Railway, Fly free-tier, or a small VPS with swap pressure) cold-starts the node process on demand. The first request pays for module load, credential decryption, and any execution-history DB warmup. Voice agents budget tool calls in single-digit seconds because users hear silence; n8n's cold-start envelope can exceed that budget. The failure is not in the workflow logic — it is in the platform's idle-to-warm transition being slower than a synchronous voice turn allows.

## Workaround

1. Keep n8n warm with a 5-minute external pinger on a trivial `webhook/ping` route. UptimeRobot, Cronitor, or a single `*/5 * * * *` cron on a separate host is sufficient.
2. For latency-critical voice tools, prefer a dedicated edge function (Cloudflare Worker, Vercel Edge) that fronts n8n and returns a synchronous stub while POSTing the real payload to n8n asynchronously.
3. Increase the agent's tool-call timeout only if both 1 and 2 are infeasible — it papers over the symptom without fixing the cause.

## Sources

- n8n community thread on idle worker recycling.
- ElevenLabs `client_tool` timeout documentation.
- Internal latency dashboard, 2026-Q1.
