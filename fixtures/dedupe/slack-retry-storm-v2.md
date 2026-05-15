[tags=failure-mode,workaround]

# Slack Duplicate Messages on Webhook Retry

> Pattern: when Slack retries a webhook after a 408 or 5xx response, a
> naive n8n workflow re-posts the same message multiple times because
> dedupe is keyed on the workflow run id instead of the upstream event id.

## Why this fails

The Slack Events API retries with the same `event_id` for up to three
attempts when the receiver does not return a 200 status code within
three seconds. If the n8n webhook node hands off to a long downstream
chain (LLM classification, vector lookup, message formatting) before
returning a response, Slack retries while the first execution is still
running, which produces two or three identical messages in the channel.

## Workaround

Use the "Respond Immediately" option on the webhook node so the 200 ACK
goes back to Slack before any heavy work begins, then continue
processing in a sibling branch. Persist each `event_id` in a key-value
store (Postgres, Redis, or an n8n Data Table) and short-circuit any
branch where the `event_id` has already been seen.

## Fingerprints

- The same exact Slack message appears 2x or 3x in the channel within a
  few seconds of one another.
- The n8n execution log shows two or three executions of the same
  workflow with adjacent timestamps and identical input payloads.
- The `event_id` field in the Slack event payload matches across the
  duplicate executions.
