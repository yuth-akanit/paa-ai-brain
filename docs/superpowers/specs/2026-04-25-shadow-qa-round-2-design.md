# Shadow QA Round 2 Design

**Date:** 2026-04-25
**Owner:** Codex
**Status:** Draft for review

## Goal

Use the momentum from the production-first patch to reduce the next highest-value QA failures without expanding into a large classifier or architecture rewrite.

Round 2 targets two outcomes:

- reduce `wrong_flow` failures in live conversation handling
- turn `needs_rule` into actionable sub-groups instead of a catch-all review label

## Context

The latest Shadow QA summary reviewed 350 rows and surfaced these main groups:

- `needs_rule`: 106 rows
- `scheduling_unhandled`: 30 rows
- `missing_handler`: 26 rows
- `pricing_misfire`: 26 rows
- `wrong_flow`: 22 rows
- `wrong_intent`: 2 rows
- `faq_not_pivoted`: 2 rows

Round 1 already addressed the highest-ROI upstream and routing failures:

- `missing_handler`
- `pricing_misfire`
- `scheduling_unhandled`

With those paths patched, the next bottleneck is conversation state quality. The remaining QA pain is less about unsupported events entering the system and more about the system carrying the wrong flow forward after the customer changes topic, asks a clarifying question, or returns from a menu-like turn.

## Non-Goals

Round 2 does **not** include:

- classifier rewrite
- full route parity refactor
- large `case-manager` decomposition
- broad cleanup of all low-volume QA labels
- redesign of the entire QA export pipeline

## Recommended Approach

Use a hybrid QA-and-production round:

1. add deterministic flow reset and pivot hardening for the most common stale-flow patterns
2. create a tighter QA taxonomy so `needs_rule` is split into actionable root-cause buckets
3. add instrumentation fields to shadow review output so future misroutes can be diagnosed without manual reconstruction

This approach is preferred over a taxonomy-only round because it would not improve customer-visible behavior enough, and over a code-only round because `needs_rule` would remain too ambiguous to guide the next patch cycle.

## Current System Touchpoints

Primary production logic still lives in:

- [lib/cases/case-manager.ts](/root/paa-ai-brain/lib/cases/case-manager.ts:1)
- [lib/ai/response-generator.ts](/root/paa-ai-brain/lib/ai/response-generator.ts:1)
- [lib/knowledge/search.ts](/root/paa-ai-brain/lib/knowledge/search.ts:1)
- [app/api/ai/respond/route.ts](/root/paa-ai-brain/app/api/ai/respond/route.ts:1)

Likely QA and review touchpoints:

- shadow review export or analysis scripts used to produce the QA workbook
- test fixtures derived from reviewed rows
- any structured logging or review payload generation currently available in the AI path

## Design

### 1. Flow Reset And Pivot Hardening

Add a narrow set of deterministic checks in `case-manager` that can override stale conversation flow when the customer clearly pivots to a different task.

The initial golden set should focus on real failure patterns seen in QA:

- repair flow to pricing question
- pricing flow to scheduling question
- sales or collection flow to FAQ question
- greeting or menu-like turn entering an already active stale flow
- short follow-up turns that should continue the new topic rather than the old one

Expected behavior:

- when a current turn clearly signals a new topic, the active flow should reset or pivot before old collection prompts continue
- follow-up questions after a pivot should stay inside the new topic
- FAQ-style turns should not be dragged back into unrelated repair, sales, or collection prompts

This should stay bounded to proven patterns from the QA examples rather than becoming a general-purpose conversation rewrite.

### 2. Golden QA Set For Flow Decisions

Create a curated regression set of approximately 30 to 40 real examples from reviewed rows covering:

- `continue_current_flow`
- `pivot_to_pricing`
- `pivot_to_scheduling`
- `pivot_to_faq`
- `reset_from_stale_flow`

This set becomes the shared truth source for Round 2 verification. It should be small enough to maintain, but broad enough to cover the known stale-flow families.

Expected behavior:

- each example includes the customer turn, prior flow state, expected canonical topic, and expected next response shape
- tests and QA analysis should use the same examples where possible

### 3. `needs_rule` Re-Labeling Taxonomy

Split `needs_rule` into narrower review buckets so each unresolved QA row points to a likely fix path.

Initial buckets:

- `insufficient_context`
- `missing_business_rule`
- `missing_catalog_copy`
- `unhandled_followup`
- `review_artifact_missing`

Definitions:

- `insufficient_context`: the row does not contain enough customer or conversation context to decide correctness
- `missing_business_rule`: the system lacks a deterministic or documented handling rule for the request
- `missing_catalog_copy`: pricing, service, warranty, or FAQ content is conceptually supported but copy or policy content is missing or too weak
- `unhandled_followup`: the prior turn established context, but the current short follow-up was not resolved correctly
- `review_artifact_missing`: missing event payload, missing flow state, or missing metadata prevents reliable analysis

Expected behavior:

- the old `needs_rule` label should stop being the default bucket for uncertain rows
- each re-labeled row should make the next engineering action more obvious

### 4. Instrumentation For Shadow QA

Add lightweight structured fields to review output so analysts can understand why a turn was handled the way it was.

Desired fields:

- `event_type`
- `message_type`
- `active_flow_before`
- `active_flow_after`
- `rule_hit`
- `intercept_source`
- `canonical_topic`
- `handoff_state`

Expected behavior:

- reviewers should be able to see whether a turn was handled by legacy flow continuation, a deterministic intercept, or a fallback path
- ambiguous rows should become easier to classify without rereading entire threads

Round 2 should prefer additive instrumentation over invasive logging changes.

## Data Flow After Round 2

### Stale Flow Pivot

1. Customer sends a turn that conflicts with the currently active flow.
2. `case-manager` evaluates deterministic pivot rules before continuing stale collection logic.
3. The turn is reassigned to the stronger current-topic signal.
4. The stored flow state and outgoing reply align with the new topic.

### QA Review Classification

1. Shadow review row is generated with richer flow and intercept metadata.
2. Analyst classifies the row using the narrower `needs_rule` taxonomy.
3. Root-cause counts are grouped by actionable bucket instead of a single ambiguous label.

## Error Handling

### Production

- if pivot confidence is weak, the system may continue the current flow rather than over-resetting
- hard resets should be used only for known stale-flow patterns covered by tests

### QA / Analytics

- if instrumentation fields are unavailable for older rows, the export should degrade gracefully rather than fail the review pipeline
- re-labeling rules should not erase the original raw row content

## Rollout Plan

### Phase 1: QA Dataset Preparation

- collect representative `wrong_flow`, `wrong_intent`, `faq_not_pivoted`, and `needs_rule` examples
- build the Round 2 golden set
- define mapping rules for the new `needs_rule` sub-labels

### Phase 2: Bounded Production Patch

- add flow reset and pivot hardening for the proven stale-flow families
- add instrumentation fields needed for future review

### Phase 3: Re-Run Shadow QA

- generate a fresh shadow review sample after deployment
- compare `wrong_flow` and re-labeled `needs_rule` counts against the current baseline

## Success Metrics

Round 2 is successful if it produces both customer-facing and analyst-facing improvements.

Target outcomes:

- `wrong_flow` reduced by at least 50%
- more than 80% of current `needs_rule` rows re-classified into narrower buckets
- new shadow rows expose enough metadata to explain most misroutes without manual thread reconstruction

Secondary signals:

- fewer pricing or scheduling turns dragged back into stale repair flow
- fewer short follow-up turns misread after a topic pivot
- lower reviewer time per row because the cause of a misroute is visible in the exported data

## Files Expected To Change

Likely production touchpoints:

- [lib/cases/case-manager.ts](/root/paa-ai-brain/lib/cases/case-manager.ts:1)
- [lib/ai/response-generator.ts](/root/paa-ai-brain/lib/ai/response-generator.ts:1)
- [lib/knowledge/search.ts](/root/paa-ai-brain/lib/knowledge/search.ts:1)

Likely QA and verification touchpoints:

- shadow review export or analysis scripts
- test fixtures built from reviewed examples
- regression tests for stale-flow pivots and topic resets

## Risks

### Over-Resetting

If pivot rules are too broad, the system may abandon a valid active flow too aggressively. Round 2 should bias toward proven examples and narrow rules.

### Taxonomy Drift

If the new `needs_rule` buckets are underspecified, reviewers may apply them inconsistently. Definitions must stay short, explicit, and mutually distinct.

### Instrumentation Bloat

If too many review fields are added without clear usage, the export becomes noisy. Only fields that support routing diagnosis should be included.
