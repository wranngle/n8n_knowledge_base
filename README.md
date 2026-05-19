# n8n_knowledge_base

> catalog of system schemas and proactive workflow patterns for n8n agents.

![Status](https://img.shields.io/badge/status-active-brightgreen.svg)

> [!NOTE]
> Active personal project. Used in my own workflow. Issues triaged on a personal-time cadence.

## Usage

Search the catalog with the local `nkb` CLI (Node 20+, no build step):

```bash
npm install
node scripts/nkb.mjs search "twilio 11200"
# → technical-research/twilio.json:42: ...error code 11200 (HTTP retrieval failure)...
```

`nkb search <query>` prints ranked `path:line:snippet` hits across
`workflow-patterns/`, `technical-research/`, and `elevenlabs-agents/`.

## What it does

This repository provides structural definitions for standard business software platforms like customer relationship managers and electronic health records. You consume these JSON blueprints in n8n to ground agent interactions in realistic data shapes before wiring up live API credentials. It isolates the schema design phase from production integration logic.

Read raw schemas directly when you need the full document:

```bash
cat technical-research/crm.json
```

## License

See [LICENSE](LICENSE) for details.
