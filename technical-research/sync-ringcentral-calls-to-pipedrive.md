---
tags: [research, recovered]
recovered_from: d3a277e
research_date: 2025-12-20
confidence: 0.85
---

# Integration Research: Sync RingCentral Calls to Pipedrive

**Business Process**: Log RingCentral call activity against Pipedrive deals/contacts
**Research Date**: 2025-12-20
**Researcher Confidence**: High (85%)
**Provenance**: reconstructed from research.db at commit d3a277e — a hand-curated
(`generated=0`) entry whose prose body was never committed. The narrative below is
rebuilt from the database's structured fields (complexity score 6, `moderate`
tier, integrations: RingCentral, Pipedrive) plus standard n8n node facts. Re-run
the [research waterfall](../docs/research-waterfall.md) to source-verify.

---

## Executive Summary

Push RingCentral telephony events (completed calls, recordings, voicemail) into
Pipedrive as activities linked to the matching person or deal. The work is
webhook plumbing plus contact matching: RingCentral has no native n8n node so the
call side is HTTP Request + OAuth2, while Pipedrive has a native node that carries
the CRM writes.

## Detected Integrations

| Integration | Native Node | Auth Type | Docs Available | Confidence |
|-------------|-------------|-----------|----------------|------------|
| RingCentral | No (HTTP Request) | OAuth2 (JWT / auth-code) | Yes | 85% |
| Pipedrive | Yes — `n8n-nodes-base.pipedrive` | OAuth2 or API token | Yes | 90% |

## Complexity Analysis

### Overall Score: 6/10 → moderate

**Contributing factors**:
- RingCentral requires an HTTP Request integration with OAuth2 and webhook subscription management (subscriptions expire and must be renewed).
- Contact/deal matching from a phone number to a Pipedrive person is the fiddly middle step — E.164 normalization and dedupe.
- Pipedrive's native node reduces the CRM-write cost.

## Effort Recommendation

**Tier**: moderate

The research.db left `base_hours` unset for this record; `nkb estimate` applies
the rubric hours for the `moderate` tier.

**Caveats**:
- RingCentral webhook subscriptions expire (default 7 days on some event filters); build a renewal path or calls will silently stop logging.
- Normalize numbers to E.164 before matching, or CRM lookups will miss.

## Related records

- [pipedrive](pipedrive.json), [ringcentral](ringcentral.json)
