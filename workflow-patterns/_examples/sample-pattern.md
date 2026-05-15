---
title: Sample echo webhook
slug: sample-pattern
tags: [failure-mode]
submitter: nkb-team
submitted_at: 2026-05-14T00:00:00Z
sources: []
sandbox:
  webhook_path: /webhook/echo
  sample_payload:
    message: "hello sandbox"
---

## Why this fails

Placeholder pattern used by `nkb run --sandbox` integration tests. The
embedded workflow JSON is the minimum shape required to exercise the
sandbox runner contract end-to-end: a single webhook node that echoes its
input. Keep this file small and stable — the bats suite asserts the
sandbox runner can locate the fenced JSON below and reference it in the
generated docker import command.

## Workflow

```json
{
  "name": "sample-echo",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "echo",
        "responseMode": "lastNode"
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "values": {
          "string": [
            { "name": "echoed", "value": "={{$json[\"body\"][\"message\"]}}" }
          ]
        }
      },
      "name": "Set",
      "type": "n8n-nodes-base.set",
      "typeVersion": 1,
      "position": [480, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{ "node": "Set", "type": "main", "index": 0 }]]
    }
  },
  "active": false,
  "settings": {},
  "id": "sample-echo"
}
```

## Sources

- internal: nkb sandbox runner contract test fixture
