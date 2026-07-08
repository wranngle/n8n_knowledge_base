# n8n_knowledge_base

> catalog of system schemas and proactive workflow patterns for n8n agents.

![nkb searching the catalog: two real queries returning ranked path:line:snippet hits](docs/hero.svg)

![Status](https://img.shields.io/badge/status-active-brightgreen.svg)

> [!NOTE]
> Active personal project. Used in my own workflow. Issues triaged on a personal-time cadence.

## Usage

Search the catalog with the local `nkb` CLI (Node 20+, no build step):

```bash
npm install
node scripts/nkb.mjs search "twilio 11200"
# → workflow-patterns/twilio-11200-stream-disconnect.md:2: # Twilio Error 11200 on Media Streams > Pattern: voice-agent calls die mid-conversation...
```

`nkb search <query>` prints ranked `path:line:snippet` hits across
`workflow-patterns/`, `technical-research/`, and `elevenlabs-agents/`.

## What it does

This repository provides structural definitions for standard business software platforms: CRMs (HubSpot, Salesforce), point of sale, calendars, email, forms, Twilio, Slack, and SQL. You consume these JSON blueprints in n8n to ground agent interactions in realistic data shapes before wiring up live API credentials. It isolates the schema design phase from production integration logic.

Read raw schemas directly when you need the full document:

```bash
cat technical-research/hubspot.json
```

## License

MIT, declared in `package.json`.
