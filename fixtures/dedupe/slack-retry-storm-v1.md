[tags=failure-mode,workaround]

# Slack Retry Storm on Duplicate Webhook Delivery

> Pattern: when Slack retries a webhook after a 408 or 5xx, a naive n8n
> workflow posts the same message multiple times because the dedupe key is
> the workflow run id rather than the upstream event id.

## Why this fails

The Slack Events API retries with the same `event_id` for at least three
attempts when the receiver does not return a 200 within three seconds.
If the n8n webhook node hands off to a long downstream chain (LLM
classification, vector lookup, formatting) before responding, Slack
retries while the first run is still in flight, producing two or three
identical messages in the channel.

## Workaround

Respond 200 immediately from the webhook node using the "Respond
Immediately" option, then process the event in a sibling branch. Persist
the `event_id` in a key-value store (Postgres, Redis, n8n Data Table) and
short-circuit any branch where the `event_id` is already present.

## Fingerprints

- Same exact Slack message repeated 2x or 3x in the channel within a
  few seconds.
- n8n execution log shows two or three executions of the same workflow
  with adjacent timestamps and identical input payloads.
- `event_id` field in the Slack payload matches across the duplicate
  runs.
