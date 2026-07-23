---
tags: [research, recovered]
recovered_from: d3a277e
research_date: 2025-12-27
confidence: 0.85
---

# Integration Research: Orthopedic Patient Intake & Scheduling

**Business Process**: Patient Pre-Registration, Insurance Verification, Smart Scheduling
**Research Date**: 2025-12-27
**Researcher Confidence**: High (85%)
**Provenance**: reconstructed from research.db at commit d3a277e. This record was
stored in the pre-purge SQLite research library as a hand-curated (`generated=0`)
entry — the flagship complex worked example — but its prose body was never
committed to git, so the narrative below is rebuilt from the database's structured
fields (complexity, tier, hours, integration list) plus standard n8n node facts.
Re-run the [research waterfall](../docs/research-waterfall.md) to source-verify
before quoting hours.

---

## Executive Summary

A multi-system healthcare front-desk automation: pull new-patient demographics,
verify insurance eligibility, and offer smart scheduling across an orthopedic
practice. The complexity is driven by the EHR and insurance-eligibility surfaces,
neither of which has a native n8n node, and by the PHI-handling requirements that
sit on top of every hop.

## Detected Integrations

| Integration | Native Node | Auth Type | Docs Available | Confidence |
|-------------|-------------|-----------|----------------|------------|
| athenahealth (EHR) | No | OAuth2 | Yes | 85% |
| Insurance eligibility (270/271) | No | Custom / clearinghouse | Partial | 75% |
| RingCentral (telephony) | No | OAuth2 | Yes | 85% |
| Twilio (SMS) | Yes — `n8n-nodes-base.twilio` | API key | Yes | 95% |
| Square (payments) | Yes — `n8n-nodes-base.square` | OAuth2 | Yes | 90% |
| Jotform (intake forms) | No (webhook / HTTP) | API key | Yes | 90% |
| Gmail | Yes — `n8n-nodes-base.gmail` | OAuth2 | Yes | 95% |

## Complexity Analysis

### Overall Score: 7/10 → complex

**Contributing factors**:
- athenahealth and the eligibility clearinghouse both require HTTP Request nodes with custom auth; no native node exists for either.
- Insurance eligibility (X12 270/271 or a clearinghouse REST wrapper) is the single hardest surface — payer-specific quirks, partial docs.
- PHI handling threads HIPAA constraints through every node (logging, retention, transport).
- Offsetting the score: Twilio, Square, and Gmail are native nodes and lower the build cost of the notification and payment legs.

## Effort Recommendation

**Tier**: complex

**Base hours (curator override)**: 120

The research.db stored 120 base hours for this record — above the rubric's
complex band (80) — reflecting the insurance-eligibility integration and PHI
handling. `nkb estimate` reports the rubric figure for the `complex` tier by
default; treat 120 as the curator's source-of-truth for this specific build.

**Caveats**:
- Eligibility-check integration is the schedule risk; scope the clearinghouse (Availity, Change Healthcare, or payer-direct) before committing hours.
- Confirm the athenahealth API tier the practice is licensed for; some endpoints are gated to higher plans.

## Related records

- [athenahealth](athenahealth.json), [pipedrive](pipedrive.json), [twilio](twilio.json), [salesforce](salesforce.json)
