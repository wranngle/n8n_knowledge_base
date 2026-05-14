---
tags: [failure-mode, workaround]
---

> Pattern: cross-workflow error handling and alerting in n8n.
> Source: migrated 2026-05-06 from the legacy `~/.claude/docs/` shelf.
> Pairs with: `workflow-patterns/voice-agent-elevenlabs-patterns.md` (when voice agents need to surface errors) and the n8n governance rules in `~/projects/n8n/AGENTS.md`.

# n8n Error Monitoring Framework

This framework provides a standardized way to monitor and alert on n8n workflow failures.

## Components

1.  **Error Handler Workflow**: A dedicated workflow (`templates/n8n/error-handler-framework.json`) that processes errors and sends notifications.
2.  **Notification Channels**: Pre-configured (but disabled) nodes for Slack and Email.
3.  **Global Configuration**: How to attach this handler to any workflow.

## Installation

### 1. Import the Error Handler
- In n8n, create a new workflow.
- Click the three dots menu (top right) and select **Import from File**.
- Select `templates/n8n/error-handler-framework.json`.
- Enable the notification nodes you want to use (Slack, Email, etc.) and configure their credentials.
- **Save and Activate** the workflow. Take note of the Workflow ID.

### 2. Attach to Other Workflows
To monitor a workflow, you must specify the Error Handler in its settings:

1.  Open the workflow you want to monitor.
2.  Open **Settings** (gear icon in the left sidebar).
3.  In the **Error Workflow** dropdown, select the "Global Error Handler Framework" you just created.
4.  Save the workflow.

## Best Practices

- **Centralization**: Use ONE error handler workflow for all your production workflows. This makes it easy to update notification logic (e.g., switching from Slack to PagerDuty) in one place.
- **Environment Context**: The framework uses `process.env.N8N_BASE_URL` to generate execution links. Ensure this environment variable is set in your n8n instance.
- **Execution ID**: Always include the Execution ID in alerts to allow for quick debugging in the n8n UI.

## Adding Custom Logging
You can extend the "Format Error Message" node to log errors to a database or n8n Data Table for long-term auditing and error-rate analysis.

## Why this fails

Without a centralized error workflow, individual workflows silently swallow failures: n8n's default behavior on a failed node is to halt the execution and surface the error only in the n8n UI's Executions tab. Nobody is watching that tab. The most common observed outcome is a webhook receiver that has been broken for hours before someone notices a downstream metric dip. The workaround is to attach a Global Error Handler workflow to every production workflow so failure routes through a single notifier — and to log the Execution ID, since the UI link is the only fast path back to the failed run.

## Cloudflare Pages Error Monitoring

If you are using Cloudflare Pages Functions (like `functions/api/leads.ts`), you should also monitor their health:

1.  **Analytics**: Monitor the `/api/leads` error rates in the Cloudflare Pages dashboard under the **Analytics** tab. Look for spikes in 5xx errors.
2.  **Sentry/Logflare Integration**: For real-time alerting on Cloudflare failures, consider adding a logging middleware to your Pages functions that sends errors to Sentry or a webhook.
3.  **Webhook to n8n**: You can have your Cloudflare function `catch` errors and `POST` them to an n8n webhook node, which then routes through the same Global Error Handler workflow.

## Sources

- Migrated 2026-05-06 from legacy `~/.claude/docs/` shelf; original notes were captured during n8n production rollout for the Wranngle voice-ops stack.
- n8n documentation: <https://docs.n8n.io/flow-logic/error-handling/> — Error Workflow configuration and the `$json.error` payload contract.
- Companion repo: `~/projects/n8n/AGENTS.md` — governance rules for production-grade error workflows referenced above.
- Template artifact: `templates/n8n/error-handler-framework.json` in this repo (the workflow JSON the installation steps import).
