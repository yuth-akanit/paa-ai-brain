# Shadow QA Production-First Patch Design

**Date:** 2026-04-25
**Owner:** Codex
**Status:** Draft for review

## Goal

Reduce the highest-ROI production errors surfaced by the latest Shadow QA pass without a large architectural rewrite.

This round targets three issue groups only:

- `missing_handler`
- `pricing_misfire`
- `scheduling_unhandled`

## Context

The latest QA summary reviewed 350 rows and estimated accuracy at 38.9%. The highest-value issue clusters were:

- `needs_rule`: 106 rows
- `scheduling_unhandled`: 30 rows
- `missing_handler`: 26 rows
- `pricing_misfire`: 26 rows
- `wrong_flow`: 22 rows

This patch intentionally focuses on the three groups that can be reduced fastest with bounded changes:

1. Stop non-text and command-style events from reaching the text AI path.
2. Force price-related questions into pricing-first handling.
3. Force queue/business-hours/scheduling questions into scheduling-first handling.

## Non-Goals

This round does **not** include:

- classifier rewrite
- major `case-manager` refactor
- full parity cleanup across every webhook path
- broad fixes for low-volume bug groups outside the top three targets

## Recommended Approach

Use a production-first hybrid patch:

1. Add an ingress guard in n8n so unsupported events never hit `/api/ai/respond` as if they were customer text.
2. Add deterministic pricing intercepts in the AI brain before contact-collection or stale flow continuation.
3. Add deterministic scheduling intercepts in the AI brain before unrelated booking, repair, or sales prompts.

This approach is preferred over a brain-only patch because `missing_handler` starts upstream, and over a large refactor because the QA data shows immediate ROI in targeted routing fixes.

## Current System Touchpoints

### n8n Workflow

Primary workflow in scope:

- [n8n/line_multi_oa_v3_3accounts.json](/root/paa-ai-brain/n8n/line_multi_oa_v3_3accounts.json:1)

Relevant nodes already visible in the workflow:

- `Explode Events`
- `Normalize cmd1`
- command routing nodes
- `Call Brain /api/ai/respond`

### Brain / API Code

Primary code paths in scope:

- [lib/cases/case-manager.ts](/root/paa-ai-brain/lib/cases/case-manager.ts:1)
- [lib/ai/response-generator.ts](/root/paa-ai-brain/lib/ai/response-generator.ts:1)
- [lib/knowledge/search.ts](/root/paa-ai-brain/lib/knowledge/search.ts:1)
- [app/api/ai/respond/route.ts](/root/paa-ai-brain/app/api/ai/respond/route.ts:1)

## Design

### 1. Ingress Guard

Add a narrow guard in the n8n workflow so only supported customer text traffic reaches `/api/ai/respond`.

Events that must **not** enter the text AI path:

- `follow`
- `unfollow`
- `postback` commands handled by menu/admin paths
- `message` events where `message.type !== "text"`
- items with no real customer text after normalization

Expected behavior:

- command-style traffic remains in the existing command branch
- unsupported events are ignored or logged, but not converted into fake text requests
- no synthetic `brain_response` should be created for unsupported events
- no customer-facing runtime error should be sent for these events

### 2. Pricing Router

Add a deterministic pricing-first intercept in `case-manager` before stale flow logic can force the conversation into name capture, symptom capture, or unrelated repair prompts.

This router should catch at least:

- general price questions
- cleaning price questions
- installation price questions
- add-on/service-charge questions such as disinfectant, refrigerant top-up, inspection fee, warranty, discount

Expected behavior:

- answer with price/policy content first when policy is known
- ask only pricing-relevant follow-up fields if needed, such as:
  - `machine_type`
  - `btu`
  - `machine_count`
  - service subtype when required for pricing
- do not ask `customer_name`
- do not ask `phone`
- do not ask `symptoms` unless the customer clearly pivots into repair diagnosis

### 3. Scheduling Router

Add a deterministic scheduling-first intercept in `case-manager`, backed where useful by `knowledge/search` and response-generation fallbacks.

This router should catch at least:

- `มีคิวไหม`
- `ว่างวันไหน`
- `วันไหนสะดวก`
- `ช่างเข้าได้เมื่อไร`
- `เปิดกี่โมง`
- `เวลาทำการ`

Expected behavior:

- business-hours questions get business-hours answers first
- queue availability questions get scheduling-first replies first
- the router must override stale repair/sales continuation when the current customer turn is explicitly about scheduling
- if a schedule is incomplete, the next question should be schedule-related, not a pivot back to unrelated collection

### 4. Verification Layer

Add regression coverage for the exact failure classes above.

Required test outcomes:

- unsupported ingress events do not call the AI text path
- pricing questions produce pricing-first behavior
- scheduling questions produce scheduling-first behavior

Fixture style should match real QA examples where possible.

## Data Flow After Patch

### Non-Text / Unsupported Event

1. LINE webhook enters n8n.
2. Workflow normalizes the event.
3. Guard detects unsupported event type or empty customer text.
4. Workflow exits AI text path.
5. Optional logging/shadow capture may happen, but no `/api/ai/respond` call is made.

### Pricing Question

1. Customer sends a price-oriented text.
2. n8n forwards supported text to `/api/ai/respond`.
3. `case-manager` pricing router intercepts before stale flow continuation causes the wrong follow-up.
4. Customer receives pricing-first reply or pricing-relevant follow-up question.

### Scheduling Question

1. Customer sends a queue/business-hours/scheduling text.
2. n8n forwards supported text to `/api/ai/respond`.
3. `case-manager` scheduling router intercepts before repair/sales continuity logic takes over.
4. Customer receives scheduling-first or business-hours-first reply.

## Error Handling

### Ingress Errors

- Unsupported events should be ignored or logged safely.
- They should not be transformed into fake text requests.
- They should not create customer-visible runtime apology messages.

### Brain Errors

- Existing API fallback behavior can remain in place for true runtime failures.
- Failures should be distinguishable from routing bugs in review data where possible.

## Rollout Plan

### Phase 1: Shadow-Safe Patch

- update the n8n workflow guard
- add deterministic pricing and scheduling intercepts
- keep rollout behavior bounded to the selected issue groups

### Phase 2: Regression Validation

- rerun targeted regression tests locally
- validate new shadow reviews against the three targeted bug groups

### Phase 3: Promote

- deploy once ingress and brain tests both pass
- compare new shadow batch against current baseline

## Success Metrics

Success for this patch is defined by meaningful reductions in the three target groups, not by total-system perfection.

Target reductions:

- `missing_handler`: reduce by more than 80%
- `pricing_misfire`: reduce by more than 50%
- `scheduling_unhandled`: reduce by more than 50%

Secondary success signals:

- fewer customer turns incorrectly asking for name/contact on pure price questions
- fewer scheduling questions routed into repair or sales collection
- fewer non-text/command events appearing as broken text AI turns in review logs

## Files Expected To Change

Likely workflow and code touchpoints:

- [n8n/line_multi_oa_v3_3accounts.json](/root/paa-ai-brain/n8n/line_multi_oa_v3_3accounts.json:1)
- [lib/cases/case-manager.ts](/root/paa-ai-brain/lib/cases/case-manager.ts:1)
- [lib/knowledge/search.ts](/root/paa-ai-brain/lib/knowledge/search.ts:1)
- [lib/ai/response-generator.ts](/root/paa-ai-brain/lib/ai/response-generator.ts:1)
- test files to be added for ingress and routing regressions

## Risks

### Over-Matching

Hard rules may catch broad text that only partially looks like pricing or scheduling. This is acceptable only if tests cover the intended boundaries.

### Rule Drift

If rule placement is too deep in `case-manager`, stale flow logic may still win. Intercepts should be placed early enough to be authoritative for the current turn.

### Workflow Drift

The active n8n workflow in use must match the version being patched. The current design is based on `line_multi_oa_v3_3accounts.json`, which should be treated as the source workflow for this change.

## Decision Summary

Ship a narrow, production-first patch that:

- blocks unsupported events from entering the AI text path
- forces price questions into pricing-first replies
- forces queue/business-hours questions into scheduling-first replies

This is the fastest path to reducing the most expensive QA failures without taking on a larger refactor in the same round.
