# Shadow QA Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `wrong_flow` and make `needs_rule` actionable by adding bounded stale-flow pivot rules, a shared golden QA set, and richer shadow-review metadata.

**Architecture:** Build Round 2 around one shared truth source: a small golden set of real QA examples that drives both regression tests and review taxonomy. Then add narrow `case-manager` pivot logic for proven stale-flow families and extend the shadow-review export with just enough metadata to diagnose why a turn was routed the way it was.

**Tech Stack:** Next.js 15, TypeScript, existing AI brain modules under `lib/cases`, `lib/knowledge`, and `lib/ai`, n8n JSON workflow, Node `node:test`, `npx tsx --test`.

---

## File Structure

### Existing files to modify

- Modify: [lib/cases/case-manager.ts](/root/paa-ai-brain/lib/cases/case-manager.ts:1)
- Modify: [lib/knowledge/search.ts](/root/paa-ai-brain/lib/knowledge/search.ts:1)
- Modify: [lib/ai/response-generator.ts](/root/paa-ai-brain/lib/ai/response-generator.ts:1)
- Modify: [n8n/line_multi_oa_v3_3accounts.json](/root/paa-ai-brain/n8n/line_multi_oa_v3_3accounts.json:1)
- Modify: [package.json](/root/paa-ai-brain/package.json:1)

### New files to create

- Create: `lib/cases/flow-pivot-router.ts`
- Create: `lib/cases/flow-pivot-router.test.ts`
- Create: `lib/cases/qa-golden-set.ts`
- Create: `lib/cases/qa-golden-set.test.ts`
- Create: `docs/superpowers/qa/2026-04-25-shadow-round-2-taxonomy.md`

### Responsibility split

- `qa-golden-set.ts`: compact set of reviewed examples with expected flow decision and topic.
- `flow-pivot-router.ts`: pure helpers that decide whether to continue, pivot, or reset from stale flow.
- `case-manager.ts`: orchestrates the new pivot rules before stale-flow continuation.
- `search.ts` and `response-generator.ts`: align canonical topic and fallback behavior with Round 2 decisions.
- `line_multi_oa_v3_3accounts.json`: emits richer shadow-review metadata for QA analysis.
- taxonomy doc: defines the new `needs_rule` sub-labels for consistent review.

## Task 1: Create The Golden QA Set And Verify The Taxonomy

**Files:**
- Create: `lib/cases/qa-golden-set.ts`
- Create: `lib/cases/qa-golden-set.test.ts`
- Create: `docs/superpowers/qa/2026-04-25-shadow-round-2-taxonomy.md`
- Modify: [package.json](/root/paa-ai-brain/package.json:1)

- [ ] **Step 1: Write the failing golden-set test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { ROUND_2_GOLDEN_SET, NEEDS_RULE_LABELS } from "./qa-golden-set";

test("round 2 golden set covers the expected flow families", () => {
  assert.ok(ROUND_2_GOLDEN_SET.length >= 12);

  const outcomes = new Set(ROUND_2_GOLDEN_SET.map((item) => item.expectedOutcome));
  assert.ok(outcomes.has("continue_current_flow"));
  assert.ok(outcomes.has("pivot_to_pricing"));
  assert.ok(outcomes.has("pivot_to_scheduling"));
  assert.ok(outcomes.has("pivot_to_faq"));
  assert.ok(outcomes.has("reset_from_stale_flow"));
});

test("needs_rule labels stay explicit and stable", () => {
  assert.deepEqual(NEEDS_RULE_LABELS, [
    "insufficient_context",
    "missing_business_rule",
    "missing_catalog_copy",
    "unhandled_followup",
    "review_artifact_missing",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx --yes tsx --test lib/cases/qa-golden-set.test.ts
```

Expected: FAIL with `Cannot find module './qa-golden-set'`

- [ ] **Step 3: Add the Round 2 golden set and review taxonomy**

Create `lib/cases/qa-golden-set.ts`:

```ts
export const NEEDS_RULE_LABELS = [
  "insufficient_context",
  "missing_business_rule",
  "missing_catalog_copy",
  "unhandled_followup",
  "review_artifact_missing",
] as const;

export type NeedsRuleLabel = (typeof NEEDS_RULE_LABELS)[number];

export type FlowOutcome =
  | "continue_current_flow"
  | "pivot_to_pricing"
  | "pivot_to_scheduling"
  | "pivot_to_faq"
  | "reset_from_stale_flow";

export type Round2GoldenCase = {
  id: string;
  priorFlow: string;
  customerText: string;
  expectedTopic: string;
  expectedOutcome: FlowOutcome;
};

export const ROUND_2_GOLDEN_SET: Round2GoldenCase[] = [
  {
    id: "repair-to-pricing-01",
    priorFlow: "repair_diagnosis",
    customerText: "ล้างแอร์ราคาเท่าไหร่",
    expectedTopic: "pricing_cleaning",
    expectedOutcome: "pivot_to_pricing",
  },
  {
    id: "pricing-to-scheduling-01",
    priorFlow: "pricing_cleaning",
    customerText: "มีคิววันเสาร์ไหมครับ",
    expectedTopic: "scheduling_request",
    expectedOutcome: "pivot_to_scheduling",
  },
  {
    id: "sales-to-faq-01",
    priorFlow: "collect_contact",
    customerText: "เปิดกี่โมง",
    expectedTopic: "business_hours",
    expectedOutcome: "pivot_to_faq",
  },
  {
    id: "stale-reset-01",
    priorFlow: "repair_diagnosis",
    customerText: "ขอเบอร์ช่างครับ",
    expectedTopic: "contact_request",
    expectedOutcome: "reset_from_stale_flow",
  },
  {
    id: "continue-01",
    priorFlow: "pricing_cleaning",
    customerText: "2 เครื่องครับ",
    expectedTopic: "pricing_cleaning",
    expectedOutcome: "continue_current_flow",
  },
];
```

Create `docs/superpowers/qa/2026-04-25-shadow-round-2-taxonomy.md`:

```md
# Shadow QA Round 2 Taxonomy

- `insufficient_context`: row lacks enough customer or thread context to judge correctness
- `missing_business_rule`: request needs a deterministic handling rule that does not exist yet
- `missing_catalog_copy`: supported service or policy exists, but reply copy is too weak or incomplete
- `unhandled_followup`: prior turn established context, but the current short follow-up was handled incorrectly
- `review_artifact_missing`: event payload or diagnostic metadata is missing, so QA cannot classify confidently
```

Add a convenience script to `package.json`:

```json
{
  "scripts": {
    "test:shadow-round-2": "npx tsx --test lib/cases/qa-golden-set.test.ts lib/cases/flow-pivot-router.test.ts"
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx --yes tsx --test lib/cases/qa-golden-set.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json lib/cases/qa-golden-set.ts lib/cases/qa-golden-set.test.ts docs/superpowers/qa/2026-04-25-shadow-round-2-taxonomy.md
git commit -m "test: add round 2 qa golden set"
```

## Task 2: Add Flow Pivot Router And Regression Coverage

**Files:**
- Create: `lib/cases/flow-pivot-router.ts`
- Create: `lib/cases/flow-pivot-router.test.ts`
- Modify: [lib/knowledge/search.ts](/root/paa-ai-brain/lib/knowledge/search.ts:1)
- Modify: [lib/ai/response-generator.ts](/root/paa-ai-brain/lib/ai/response-generator.ts:1)
- Modify: [lib/cases/case-manager.ts](/root/paa-ai-brain/lib/cases/case-manager.ts:1)

- [ ] **Step 1: Write the failing flow-pivot tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { decideFlowPivot } from "./flow-pivot-router";

test("repair flow pivots to pricing when the new turn asks for price", () => {
  const decision = decideFlowPivot({
    activeFlow: "repair_diagnosis",
    canonicalTopic: "pricing_cleaning",
    messageText: "ล้างแอร์ราคาเท่าไหร่",
  });

  assert.equal(decision.action, "pivot");
  assert.equal(decision.nextFlow, "pricing_cleaning");
});

test("pricing flow pivots to scheduling when the new turn asks for availability", () => {
  const decision = decideFlowPivot({
    activeFlow: "pricing_cleaning",
    canonicalTopic: "scheduling_request",
    messageText: "ช่างเข้าได้เมื่อไร",
  });

  assert.equal(decision.action, "pivot");
  assert.equal(decision.nextFlow, "scheduling_request");
});

test("short follow-up stays in the active pricing flow when it still matches", () => {
  const decision = decideFlowPivot({
    activeFlow: "pricing_cleaning",
    canonicalTopic: "pricing_cleaning",
    messageText: "2 เครื่องครับ",
  });

  assert.equal(decision.action, "continue");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx --yes tsx --test lib/cases/flow-pivot-router.test.ts
```

Expected: FAIL with `Cannot find module './flow-pivot-router'`

- [ ] **Step 3: Add the minimal pivot router**

Create `lib/cases/flow-pivot-router.ts`:

```ts
export type FlowPivotInput = {
  activeFlow: string;
  canonicalTopic: string;
  messageText: string;
};

export type FlowPivotDecision = {
  action: "continue" | "pivot" | "reset";
  nextFlow: string;
  reason: string;
};

const FLOW_TOPICS = new Set(["pricing_cleaning", "scheduling_request", "business_hours", "faq"]);

export function decideFlowPivot(input: FlowPivotInput): FlowPivotDecision {
  const activeFlow = String(input.activeFlow || "").trim();
  const canonicalTopic = String(input.canonicalTopic || "").trim();

  if (!canonicalTopic || canonicalTopic === activeFlow) {
    return { action: "continue", nextFlow: activeFlow, reason: "same-topic" };
  }

  if (FLOW_TOPICS.has(canonicalTopic)) {
    return { action: "pivot", nextFlow: canonicalTopic, reason: "strong-topic-signal" };
  }

  return { action: "continue", nextFlow: activeFlow, reason: "no-strong-pivot" };
}
```

Patch `lib/knowledge/search.ts` so canonical topic resolution preserves the Round 1 pricing and scheduling topics and can also return FAQ-like topics needed by the new tests:

```ts
if (isAskingAvailability(normalized) || isAskingBusinessHours(normalized)) {
  return "scheduling_request";
}

if (isPricingQuestion(normalized)) {
  return "pricing_cleaning";
}

if (isContactRequest(normalized) || isFaqQuestion(normalized)) {
  return "faq";
}
```

Patch `lib/cases/case-manager.ts` so pivot logic runs before stale flow continuation:

```ts
const canonicalTopic = resolveCanonicalTopic(summaryText);
const flowDecision = decideFlowPivot({
  activeFlow: String(thread.metadata?.active_flow || mergedFields.active_flow || ""),
  canonicalTopic,
  messageText: summaryText,
});

if (flowDecision.action === "pivot" || flowDecision.action === "reset") {
  await persistAssistantTurn({
    threadId,
    messageText: customerMessage,
    customerReply: overrideReplyForTopic(flowDecision.nextFlow, summaryText),
    activeFlow: flowDecision.nextFlow,
    ruleHit: flowDecision.reason,
  });
}
```

Patch `lib/ai/response-generator.ts` only if needed so fallback replies for `scheduling_request`, `pricing_cleaning`, and `faq` remain aligned after a pivot:

```ts
if (intent === "faq" && canonicalTopic === "business_hours") {
  return buildBusinessHoursReply();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx --yes tsx --test lib/cases/flow-pivot-router.test.ts
npx --yes tsx --test lib/cases/qa-golden-set.test.ts lib/cases/flow-pivot-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cases/flow-pivot-router.ts lib/cases/flow-pivot-router.test.ts lib/cases/case-manager.ts lib/knowledge/search.ts lib/ai/response-generator.ts
git commit -m "feat: harden stale flow pivots for round 2"
```

## Task 3: Extend Shadow Review Metadata For Round 2 QA

**Files:**
- Modify: [n8n/line_multi_oa_v3_3accounts.json](/root/paa-ai-brain/n8n/line_multi_oa_v3_3accounts.json:1)
- Modify: [package.json](/root/paa-ai-brain/package.json:1)

- [ ] **Step 1: Write a failing workflow metadata test**

Append this test to `lib/cases/qa-golden-set.test.ts` or create a new workflow-focused test file if preferred:

```ts
import fs from "node:fs";
import path from "node:path";

test("shadow review export includes round 2 metadata fields", () => {
  const workflowPath = path.join(process.cwd(), "n8n", "line_multi_oa_v3_3accounts.json");
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  const raw = JSON.stringify(workflow);

  assert.match(raw, /active_flow_after/);
  assert.match(raw, /rule_hit/);
  assert.match(raw, /intercept_source/);
  assert.match(raw, /canonical_topic/);
  assert.match(raw, /handoff_state/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx --yes tsx --test lib/cases/qa-golden-set.test.ts
```

Expected: FAIL because one or more of the new metadata fields are missing

- [ ] **Step 3: Add the new review metadata fields to the n8n shadow export**

Update the workflow function that builds the shadow review row so it includes:

```js
active_flow_after: String(metadata.active_flow_after || metadata.active_flow || ''),
rule_hit: String(metadata.rule_hit || decisionMeta.rule_hit || ''),
intercept_source: String(metadata.intercept_source || decisionMeta.intercept_source || ''),
canonical_topic: String(metadata.canonical_topic || decisionMeta.canonical_topic || ''),
handoff_state: String(metadata.handoff_state || ''),
```

Also add matching Airtable or destination-field mappings beside the existing review payload fields:

```json
{
  "active_flow_after": "={{ $json.active_flow_after || '' }}",
  "rule_hit": "={{ $json.rule_hit || '' }}",
  "intercept_source": "={{ $json.intercept_source || '' }}",
  "canonical_topic": "={{ $json.canonical_topic || '' }}",
  "handoff_state": "={{ $json.handoff_state || '' }}"
}
```

If `decision_meta_json` already exists, keep it. Round 2 fields should be additive and human-readable, not replacements.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx --yes tsx --test lib/cases/qa-golden-set.test.ts
npm run test:shadow-round-2
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add n8n/line_multi_oa_v3_3accounts.json package.json lib/cases/qa-golden-set.test.ts
git commit -m "feat: add round 2 shadow review metadata"
```

## Task 4: Verify The Round 2 Patch End-To-End

**Files:**
- Modify: [package.json](/root/paa-ai-brain/package.json:1)

- [ ] **Step 1: Add or confirm a single verification script**

Ensure `package.json` contains:

```json
{
  "scripts": {
    "test:shadow-round-2": "npx tsx --test lib/cases/qa-golden-set.test.ts lib/cases/flow-pivot-router.test.ts"
  }
}
```

- [ ] **Step 2: Run the targeted Round 2 test suite**

Run:

```bash
npm run test:shadow-round-2
```

Expected: PASS

- [ ] **Step 3: Run the broader safety checks**

Run:

```bash
npm run typecheck
npm run build
```

Expected: PASS

- [ ] **Step 4: Record manual QA checks**

Run these manual conversation checks against the deployed or local brain:

```text
prior flow: repair_diagnosis
customer: ล้างแอร์ราคาเท่าไหร่
expected: pricing-first reply, not stale repair follow-up

prior flow: pricing_cleaning
customer: ช่างเข้าได้เมื่อไร
expected: scheduling-first reply, not pricing follow-up

prior flow: collect_contact
customer: เปิดกี่โมง
expected: business-hours reply, not contact collection
```

Expected: each turn pivots to the stronger current topic and the exported shadow review row includes `active_flow_before`, `active_flow_after`, `rule_hit`, `intercept_source`, and `canonical_topic`

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: verify round 2 qa patch"
```

## Self-Review

- Spec coverage:
  - `wrong_flow` is covered by Task 2 and Task 4 manual checks.
  - golden-set requirement is covered by Task 1.
  - `needs_rule` re-labeling is covered by Task 1 taxonomy output.
  - instrumentation is covered by Task 3.
- Placeholder scan:
  - no `TODO`, `TBD`, or unnamed files remain.
- Type consistency:
  - shared labels and expected outcomes are defined in `qa-golden-set.ts` and reused in tests.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-25-shadow-qa-round-2.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
