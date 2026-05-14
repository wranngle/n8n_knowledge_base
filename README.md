# n8n_knowledge_base

```bash
$ nkb search "twilio 11200"
technical-research/twilio.json:42: ...error code 11200 (HTTP retrieval failure) when the webhook URL is unreachable...
workflow-patterns/proactive-error-monitoring-2026-05-13.md:18: ...Twilio 11200 retry budget exhausted; surface to ops-on-call channel...
```

Two seconds from "what causes Twilio error 11200?" to a cited answer, locally,
no SaaS round-trip. That is the promise of this repo.

> catalog of system schemas and proactive workflow patterns for n8n agents.

![Status](https://img.shields.io/badge/status-active-brightgreen.svg)

> [!NOTE]
> Active personal project. Used in my own workflow. Issues triaged on a personal-time cadence.

## What it does

This repository provides structural definitions for standard business software platforms like customer relationship managers and electronic health records. You consume these JSON blueprints in n8n to ground agent interactions in realistic data shapes before wiring up live API credentials. It isolates the schema design phase from production integration logic.

## Usage

Search the catalog with the local `nkb` CLI (Node 20+, no build step):

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
