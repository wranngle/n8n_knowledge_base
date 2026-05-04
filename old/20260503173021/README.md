# n8n_knowledge_base

> a catalog of system schemas and proactive workflow patterns for n8n agents.

![Status](https://img.shields.io/badge/status-active-brightgreen.svg)

> [!NOTE]
> Active personal project. Used in my own workflow. Issues triaged on a personal-time cadence.

## What it does

This repo holds structural research on the software platforms an n8n agent is most likely to drive: CRMs, EHRs, and internal tools. Each entry captures entity shapes, field semantics, and the relationships that matter for automation, paired with proactive workflow blueprints (trigger conditions and recommended actions). The point is to ground agent reasoning in realistic data structures during design, before any live API connection exists, so workflows start from a working pattern instead of a blank canvas.

## Usage

Read a system schema directly from the research directory to supply context to your workflow or agent prompt.

```bash
cat technical-research/crm.json
```

## License

See [LICENSE](LICENSE) for details.
