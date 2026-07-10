![nkb searching the catalog: two real queries showing top ranked path:line:snippet hits](docs/hero.svg)

# n8n_knowledge_base

> catalog of system schemas and proactive workflow patterns for n8n agents.

![CI](https://github.com/wranngle/n8n_knowledge_base/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/github/license/wranngle/n8n_knowledge_base?color=A371F7)
![Status](https://img.shields.io/badge/status-active-brightgreen.svg)

> [!NOTE]
> Active personal project. Used in my own workflow. Issues triaged on a personal-time cadence.

## Quick start

```bash
git clone https://github.com/wranngle/n8n_knowledge_base.git
cd n8n_knowledge_base
npm install
```

## What it does

This repository provides structural definitions for standard business software platforms: CRMs (HubSpot, Salesforce), point of sale, calendars, email, forms, Twilio, Slack, and SQL. You consume these JSON blueprints in n8n to ground agent interactions in realistic data shapes before wiring up live API credentials. It isolates the schema design phase from production integration logic.

## Usage

Search the catalog with the local `nkb` CLI (Node 20+, no build step):

```bash
node scripts/nkb.mjs search "twilio 11200"
# → workflow-patterns/twilio-11200-stream-disconnect.md:2: # Twilio Error 11200 on Media Streams > Pattern: voice-agent calls die mid-conversation...
```

`nkb search <query>` prints ranked `path:line:snippet` hits across
`workflow-patterns/`, `technical-research/`, and `elevenlabs-agents/`.

Read raw schemas directly when you need the full document:

```bash
cat technical-research/hubspot.json
```

## License

[MIT](LICENSE), declared in `package.json`.
