# n8n_knowledge_base

> catalog of system schemas and proactive workflow patterns for n8n agents.
>
> Two seconds from "what causes Twilio error 11200?" to a cited answer via the
> local `nkb` CLI, no SaaS round-trip. Schemas for CRM, EHR, and billing
> systems ground n8n agent prototypes in realistic data shapes before live
> API credentials enter the picture.

![Status](https://img.shields.io/badge/status-active-brightgreen.svg)

> [!NOTE]
> Active personal project. Used in my own workflow. Issues triaged on a personal-time cadence.

## What it does

Stores JSON blueprints for standard business platforms (CRM, EHR, billing, telephony) alongside markdown workflow patterns and incident notes. The `nkb` CLI searches the corpus locally so an agent (or an operator) can pull cited context in milliseconds before wiring up a real integration. It isolates the schema-design phase from production integration logic.

## Usage

```bash
$ nkb search "twilio 11200"
technical-research/twilio.json:42: ...error code 11200 (HTTP retrieval failure) when the webhook URL is unreachable...
workflow-patterns/proactive-error-monitoring-2026-05-13.md:18: ...Twilio 11200 retry budget exhausted; surface to ops-on-call channel...
```

Install once, then search anytime (Node 20+, no build step):

```bash
npm install
node scripts/nkb.mjs search "twilio 11200"
```

`nkb search <query>` prints ranked `path:line:snippet` hits across
`workflow-patterns/`, `technical-research/`, and `elevenlabs-agents/`.

Read raw schemas directly when you need the full document:

```bash
cat technical-research/crm.json
```

## License

See [LICENSE](LICENSE) for details.
