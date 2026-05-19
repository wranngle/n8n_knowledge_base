---
tags: [failure-mode, dead-end]
---

# Twilio Error 11200 on Media Streams

> Pattern: voice-agent calls die mid-conversation with Twilio Error 11200 ("HTTP retrieval failure") on `<Stream>` connect.

## Symptom

A Twilio Programmable Voice call to an n8n webhook returns TwiML containing `<Stream url="wss://..."/>`. The call connects, plays a greeting, then drops within 1–3 seconds. The Twilio debugger logs Error 11200 with the WebSocket URL. The n8n workflow's webhook node shows no execution for the stream URL.

## Why this fails

Twilio's Media Streams transport requires a **WebSocket** endpoint (`wss://`), not an HTTP webhook. n8n's built-in Webhook node only speaks HTTP/HTTPS — it cannot accept a WebSocket upgrade. When Twilio tries to open the stream it gets back an HTTP response instead of a 101 upgrade, logs 11200, and tears the call down. The root cause is a category mismatch between "n8n webhook" (HTTP) and "Twilio Media Stream" (WebSocket); the protocol surface is incompatible.

## Workaround

Terminate the Twilio Media Stream in a service that speaks WebSocket — typically a small Node/Bun worker, ElevenLabs Conversational AI's native Twilio integration, or a Cloudflare Worker — and have *that* service POST transcripts to the n8n webhook when each turn closes. Never point `<Stream url>` at an n8n webhook URL directly.

## Sources

- Twilio Voice Insights debugger output (private).
- ElevenLabs ↔ Twilio integration docs.
- Internal incident log, 2026-Q1.
