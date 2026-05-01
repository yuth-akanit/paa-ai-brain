# Shadow QA Production-First Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `missing_handler`, `pricing_misfire`, and `scheduling_unhandled` by blocking unsupported ingress events from the AI text path and forcing pricing/scheduling questions into deterministic first-pass routing.

**Architecture:** Add a narrow ingress guard to the active n8n workflow, then add two deterministic turn-level intercepts in the brain: a pricing-first router and a scheduling-first router. Keep the patch bounded by adding small helper modules plus regression tests, without a large `case-manager` refactor.

**Tech Stack:** Next.js 15, TypeScript, Node `node:test`, `npx tsx --test`, n8n JSON workflow, existing AI brain modules under `lib/cases`, `lib/knowledge`, and `lib/ai`.

---

## File Structure

### Existing files to modify

- Modify: [n8n/line_multi_oa_v3_3accounts.json](/root/paa-ai-brain/n8n/line_multi_oa_v3_3accounts.json:1)
- Modify: [lib/cases/case-manager.ts](/root/paa-ai-brain/lib/cases/case-manager.ts:1)
- Modify: [lib/knowledge/search.ts](/root/paa-ai-brain/lib/knowledge/search.ts:1)
- Modify: [lib/ai/response-generator.ts](/root/paa-ai-brain/lib/ai/response-generator.ts:1)
- Modify: [package.json](/root/paa-ai-brain/package.json:1)

### New files to create

- Create: `lib/cases/pricing-router.ts`
- Create: `lib/cases/scheduling-router.ts`
- Create: `lib/cases/pricing-router.test.ts`
- Create: `lib/cases/scheduling-router.test.ts`
- Create: `n8n/line_multi_oa_v3_3accounts.test.ts`

### Responsibility split

- `pricing-router.ts`: pure helpers that decide whether the current customer turn is a pricing-first turn and what reply/missing-fields policy to apply.
- `scheduling-router.ts`: pure helpers that decide whether the current customer turn is a scheduling-first turn and what reply/missing-fields policy to apply.
- `case-manager.ts`: orchestrates the intercepts and decides where they preempt stale flow logic.
- `knowledge/search.ts`: expands canonical topic matching for pricing and scheduling phrases.
- `response-generator.ts`: aligns fallback behavior with the new deterministic routing.
- `line_multi_oa_v3_3accounts.json`: blocks unsupported events from the `/api/ai/respond` path.
- `line_multi_oa_v3_3accounts.test.ts`: verifies the workflow JSON contains the required ingress gate structure.

## Task 1: Add Workflow Regression Guard For Unsupported Ingress Events

**Files:**
- Create: `n8n/line_multi_oa_v3_3accounts.test.ts`
- Modify: [n8n/line_multi_oa_v3_3accounts.json](/root/paa-ai-brain/n8n/line_multi_oa_v3_3accounts.json:1)
- Modify: [package.json](/root/paa-ai-brain/package.json:1)

- [ ] **Step 1: Write the failing workflow regression test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function getWorkflow() {
  const workflowPath = path.join(process.cwd(), "n8n", "line_multi_oa_v3_3accounts.json");
  return JSON.parse(fs.readFileSync(workflowPath, "utf8"));
}

function getNode(workflow: any, name: string) {
  const node = (workflow.nodes || []).find((item: any) => item.name === name);
  assert.ok(node, `expected node "${name}" to exist`);
  return node;
}

test("workflow has an ingress gate before Call Brain /api/ai/respond", () => {
  const workflow = getWorkflow();
  const gate = getNode(workflow, "Should Send To Brain?");
  const callBrain = getNode(workflow, "Call Brain /api/ai/respond");

  const gateJson = JSON.stringify(gate.parameters);
  assert.match(gateJson, /event_type/);
  assert.match(gateJson, /message_type/);
  assert.match(gateJson, /follow/);
  assert.match(gateJson, /unfollow/);
  assert.match(gateJson, /text/);

  const gateConnections = workflow.connections?.["Should Send To Brain?"]?.main?.[0] ?? [];
  assert.ok(
    gateConnections.some((edge: any) => edge.node === "Call Brain /api/ai/respond"),
    "expected the true branch of the ingress gate to flow into Call Brain /api/ai/respond"
  );

  assert.equal(callBrain.type, "n8n-nodes-base.httpRequest");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx --yes tsx --test n8n/line_multi_oa_v3_3accounts.test.ts
```

Expected: FAIL with `expected node "Should Send To Brain?" to exist`

- [ ] **Step 3: Add a dedicated ingress gate node and enriched event normalization**

Update the `Explode Events` node script so every item carries `message_type`:

```js
const req = $json;
const body = req.body ?? req;
const events = Array.isArray(body?.events) ? body.events : [];

return events.map((event) => {
  const event_type = String(event?.type || "").toLowerCase();
  const message_type = String(event?.message?.type || "").toLowerCase();
  const line_user_id = event?.source?.userId || null;
  const reply_token = event?.replyToken || "";
  const text = message_type === "text" ? String(event?.message?.text || "").trim() : "";
  const postback_data = event_type === "postback" ? String(event?.postback?.data || "").trim() : "";
  const cmd = String(postback_data || text || "").trim();

  return {
    json: {
      account_key: req.account_key,
      channel_platform_id: req.channel_platform_id,
      event_type,
      message_type,
      line_user_id,
      reply_token,
      text,
      postback_data,
      cmd,
      ts: event?.timestamp || null,
      raw_event: {
        type: event?.type,
        mode: event?.mode,
        source: event?.source,
        timestamp: event?.timestamp,
        message: event?.message,
        postback: event?.postback,
      }
    }
  };
});
```

Add a new IF node named `Should Send To Brain?` with a single true branch that requires:

```json
{
  "conditions": {
    "combinator": "and",
    "conditions": [
      {
        "leftValue": "={{ ['message'].includes(String($json.event_type || '').toLowerCase()) }}",
        "operator": { "type": "boolean", "operation": "true" }
      },
      {
        "leftValue": "={{ String($json.message_type || '').toLowerCase() === 'text' }}",
        "operator": { "type": "boolean", "operation": "true" }
      },
      {
        "leftValue": "={{ String($json.text || '').trim().length > 0 }}",
        "operator": { "type": "boolean", "operation": "true" }
      },
      {
        "leftValue": "={{ !/^(MENU|ADMIN):/i.test(String($json.cmd || '').trim()) }}",
        "operator": { "type": "boolean", "operation": "true" }
      },
      {
        "leftValue": "={{ !['follow', 'unfollow', 'postback'].includes(String($json.event_type || '').toLowerCase()) }}",
        "operator": { "type": "boolean", "operation": "true" }
      }
    ]
  }
}
```

Wire the workflow so:

- `Normalize cmd1` true command branch still goes to command handling
- non-command branch flows into `Should Send To Brain?`
- only the true branch of `Should Send To Brain?` reaches `Call Brain /api/ai/respond`
- the false branch goes straight to the webhook response / no-op path

Add a convenience test script:

```json
{
  "scripts": {
    "test:n8n-workflow": "npx tsx --test n8n/line_multi_oa_v3_3accounts.test.ts"
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx --yes tsx --test n8n/line_multi_oa_v3_3accounts.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json n8n/line_multi_oa_v3_3accounts.json n8n/line_multi_oa_v3_3accounts.test.ts
git commit -m "test: guard unsupported ingress events before brain"
```

## Task 2: Add A Pricing-First Router And Regression Coverage

**Files:**
- Create: `lib/cases/pricing-router.ts`
- Create: `lib/cases/pricing-router.test.ts`
- Modify: [lib/knowledge/search.ts](/root/paa-ai-brain/lib/knowledge/search.ts:1)
- Modify: [lib/cases/case-manager.ts](/root/paa-ai-brain/lib/cases/case-manager.ts:1)

- [ ] **Step 1: Write the failing pricing router tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildPricingTurnOverride, detectPricingTurn } from "./pricing-router";

test("detectPricingTurn catches refrigerant and warranty style questions", () => {
  assert.equal(detectPricingTurn("เติมน้ำยาแอร์ราคาเท่าไหร่"), true);
  assert.equal(detectPricingTurn("รับประกันน้ำหยดกี่วัน"), true);
  assert.equal(detectPricingTurn("มีส่วนลดล้างแอร์ไหม"), true);
});

test("buildPricingTurnOverride never asks contact fields for a pricing-only turn", () => {
  const decision = buildPricingTurnOverride({
    messageText: "เติมน้ำยาแอร์ราคาเท่าไหร่",
    canonicalTopic: "inspection_policy",
    mergedFields: {},
  });

  assert.ok(decision);
  assert.equal(decision?.intent, "faq_pricing");
  assert.equal(decision?.nextMissingField, "machine_type");
  assert.match(decision?.customerReply || "", /ราคา|ค่าบริการ|ประเมิน/);
  assert.doesNotMatch(decision?.customerReply || "", /ชื่อ|เบอร์/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx --yes tsx --test lib/cases/pricing-router.test.ts
```

Expected: FAIL with `Cannot find module './pricing-router'`

- [ ] **Step 3: Write the minimal pricing router**

Create `lib/cases/pricing-router.ts`:

```ts
import type { ExtractedCaseFields, IntentName } from "../types";

type PricingOverride = {
  intent: IntentName;
  customerReply: string;
  nextMissingField: "machine_type" | "btu" | "machine_count" | null;
};

const PRICING_RE = /(ราคา|เท่าไหร่|กี่บาท|ค่าบริการ|เริ่มต้น|ส่วนลด|รับประกัน|เติมน้ำยา|ล้างคอยล์|ประเมินหน้างาน|ค่าตรวจเช็ก|ค่าตรวจเช็ค)/i;

export function detectPricingTurn(messageText: string) {
  return PRICING_RE.test(messageText.trim());
}

export function buildPricingTurnOverride(args: {
  messageText: string;
  canonicalTopic: string | null;
  mergedFields: ExtractedCaseFields;
}): PricingOverride | null {
  if (!detectPricingTurn(args.messageText)) return null;

  if (/เติมน้ำยา/i.test(args.messageText)) {
    return {
      intent: "faq_pricing",
      customerReply: "ค่าบริการเติมน้ำยาต้องดูจากชนิดแอร์ ขนาด BTU และอาการก่อนครับ รบกวนแจ้งประเภทแอร์หรือ BTU ได้ไหมครับ เดี๋ยวผมช่วยประเมินราคาเบื้องต้นให้ครับ",
      nextMissingField: args.mergedFields.machine_type ? "btu" : "machine_type"
    };
  }

  if (/รับประกัน|ประกัน/i.test(args.messageText)) {
    return {
      intent: "faq_pricing",
      customerReply: "งานล้างแอร์มีรับประกันน้ำหยดหลังล้าง 30 วันครับ ถ้าต้องการประเมินค่าบริการเพิ่มเติม รบกวนแจ้งประเภทแอร์ได้เลยครับ",
      nextMissingField: args.mergedFields.machine_type ? null : "machine_type"
    };
  }

  if (args.canonicalTopic === "cleaning_pricing") {
    return {
      intent: "faq_pricing",
      customerReply: "ล้างแอร์ติดผนังเริ่มต้นตามเรตราคามาตรฐานครับ ถ้าสะดวกแจ้งประเภทแอร์หรือจำนวนเครื่องเพิ่มได้เลยครับ เดี๋ยวผมช่วยสรุปราคาให้ตรงขึ้นครับ",
      nextMissingField: args.mergedFields.machine_type ? "machine_count" : "machine_type"
    };
  }

  return {
    intent: "faq_pricing",
    customerReply: "ยินดีครับ ถ้าเป็นเรื่องราคา รบกวนแจ้งประเภทแอร์หรือขนาด BTU เพิ่มอีกนิดนะครับ เดี๋ยวผมช่วยประเมินให้ตรงบริการมากขึ้นครับ",
    nextMissingField: args.mergedFields.machine_type ? "btu" : "machine_type"
  };
}
```

Expand canonical pricing matching in `lib/knowledge/search.ts`:

```ts
  if (/(ราคาล้าง|ล้างแอร์.*เท่าไหร่|ค่าล้างแอร์|ล้างแอร์ราคา|ส่วนลดล้างแอร์|โปรล้างแอร์)/i.test(text)) {
    return "cleaning_pricing";
  }

  if (/(ติดตั้งแอร์.*เท่าไหร่|ค่าติดตั้งแอร์|ติดตั้งแอร์ราคา|อุปกรณ์ติดตั้งเท่าไหร่)/i.test(text)) {
    return "installation_pricing";
  }

  if (/(ค่าตรวจเช็ก|ค่าตรวจเช็ค|ประเมินหน้างาน|เติมน้ำยา|ค่าน้ำยา|รับประกัน|ส่วนลด)/i.test(text)) {
    return "inspection_policy";
  }
```

Integrate into `case-manager.ts` immediately after canonical topic resolution and before stale flow / AI fallback can ask unrelated questions:

```ts
import { buildPricingTurnOverride } from "./pricing-router";
```

```ts
  const canonicalTopic = resolveCanonicalTopic(params.messageText);
  const pricingOverride = buildPricingTurnOverride({
    messageText: params.messageText,
    canonicalTopic,
    mergedFields
  });

  if (pricingOverride) {
    return {
      intent: pricingOverride.intent,
      shouldHandoff: false,
      nextAction: "ask_missing",
      nextMissingField: pricingOverride.nextMissingField,
      capturedFields: {},
      retryCount: 0,
      policyMessage: null,
      customerReply: pricingOverride.customerReply,
      mergedFields,
      summary: "Pricing-first intercept",
      stateAdvanced: true,
      nextMetadata: {
        ...meta,
        active_flow: "general",
        last_prompt_type: pricingOverride.nextMissingField === "machine_type" ? "none" : "none",
        awaiting_field: pricingOverride.nextMissingField
      }
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx --yes tsx --test lib/cases/pricing-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cases/pricing-router.ts lib/cases/pricing-router.test.ts lib/knowledge/search.ts lib/cases/case-manager.ts
git commit -m "feat: route pricing turns before contact collection"
```

## Task 3: Add A Scheduling-First Router And Regression Coverage

**Files:**
- Create: `lib/cases/scheduling-router.ts`
- Create: `lib/cases/scheduling-router.test.ts`
- Modify: [lib/knowledge/search.ts](/root/paa-ai-brain/lib/knowledge/search.ts:1)
- Modify: [lib/ai/response-generator.ts](/root/paa-ai-brain/lib/ai/response-generator.ts:1)
- Modify: [lib/cases/case-manager.ts](/root/paa-ai-brain/lib/cases/case-manager.ts:1)

- [ ] **Step 1: Write the failing scheduling router tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildSchedulingTurnOverride, detectSchedulingTurn } from "./scheduling-router";

test("detectSchedulingTurn catches queue and business-hours phrasing", () => {
  assert.equal(detectSchedulingTurn("ช่างเข้าได้เมื่อไร"), true);
  assert.equal(detectSchedulingTurn("มีคิวไหมครับ"), true);
  assert.equal(detectSchedulingTurn("เปิดกี่โมง"), true);
});

test("buildSchedulingTurnOverride prefers scheduling reply over stale repair flow", () => {
  const decision = buildSchedulingTurnOverride({
    messageText: "มีคิวไหมครับ",
    activeFlow: "repair",
    preferredDate: null,
    preferredTime: null
  });

  assert.ok(decision);
  assert.equal(decision?.intent, "scheduling_request");
  assert.match(decision?.customerReply || "", /คิว|วัน|เวลา|เปิดบริการ/);
  assert.equal(decision?.nextMissingField, "preferred_date");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx --yes tsx --test lib/cases/scheduling-router.test.ts
```

Expected: FAIL with `Cannot find module './scheduling-router'`

- [ ] **Step 3: Write the minimal scheduling router**

Create `lib/cases/scheduling-router.ts`:

```ts
import type { ConversationMetadata, IntentName } from "../types";

type SchedulingOverride = {
  intent: IntentName;
  customerReply: string;
  nextMissingField: "preferred_date" | "preferred_time" | null;
  nextMetadataPatch: Partial<ConversationMetadata>;
};

const SCHEDULING_RE = /(มีคิว|คิวว่าง|ว่างวันไหน|วันไหนว่าง|ช่างเข้าได้เมื่อไร|เปิดกี่โมง|เวลาทำการ|สะดวกวันไหน)/i;
const BUSINESS_HOURS_RE = /(เปิดกี่โมง|เวลาทำการ)/i;

export function detectSchedulingTurn(messageText: string) {
  return SCHEDULING_RE.test(messageText.trim());
}

export function buildSchedulingTurnOverride(args: {
  messageText: string;
  activeFlow: string | null | undefined;
  preferredDate: string | null | undefined;
  preferredTime: string | null | undefined;
}): SchedulingOverride | null {
  if (!detectSchedulingTurn(args.messageText)) return null;

  if (BUSINESS_HOURS_RE.test(args.messageText)) {
    return {
      intent: "scheduling_request",
      customerReply: "ทางเราเปิดบริการวันจันทร์-เสาร์ 09:00 - 18:00 น. ครับ ไม่ทราบว่าสะดวกวันไหนหรือช่วงเวลาไหนครับ? 😊",
      nextMissingField: "preferred_date",
      nextMetadataPatch: {
        active_flow: "general",
        awaiting_field: "preferred_date",
        last_prompt_type: "booking_date"
      }
    };
  }

  if (!args.preferredDate) {
    return {
      intent: "scheduling_request",
      customerReply: "ช่วงนี้ยังมีคิวครับ ไม่ทราบว่าสะดวกวันไหนครับ? 😊",
      nextMissingField: "preferred_date",
      nextMetadataPatch: {
        active_flow: "general",
        awaiting_field: "preferred_date",
        last_prompt_type: "booking_date"
      }
    };
  }

  if (!args.preferredTime) {
    return {
      intent: "scheduling_request",
      customerReply: `รับทราบครับ ถ้าสะดวก${args.preferredDate} แล้ว ขอทราบช่วงเวลาที่สะดวกด้วยครับ เช่น ช่วงเช้าหรือบ่าย 😊`,
      nextMissingField: "preferred_time",
      nextMetadataPatch: {
        active_flow: "general",
        awaiting_field: "preferred_time",
        last_prompt_type: "booking_time"
      }
    };
  }

  return {
    intent: "scheduling_request",
    customerReply: `รับทราบครับ ตอนนี้ทราบวันและเวลาเบื้องต้นแล้ว เดี๋ยวผมส่งต่อให้แอดมินเช็กคิวและคอนเฟิร์มกลับอีกครั้งนะครับ`,
    nextMissingField: null,
    nextMetadataPatch: {
      active_flow: "general",
      awaiting_field: null,
      last_prompt_type: "booking_summary_confirm"
    }
  };
}
```

Broaden scheduling canonical matching in `lib/knowledge/search.ts`:

```ts
  if (/(ว่างวันไหน|มีคิววันไหน|วันไหนว่าง|เปิดกี่โมง|เวลาทำการ|มีคิวไหม|ช่างเข้าได้เมื่อไร|สะดวกวันไหน)/i.test(text)) {
    return "operating_hours";
  }
```

Integrate into `case-manager.ts` before stale flow continuation wins:

```ts
import { buildSchedulingTurnOverride } from "./scheduling-router";
```

```ts
  const schedulingOverride = buildSchedulingTurnOverride({
    messageText: params.messageText,
    activeFlow,
    preferredDate: mergedFields.preferred_date ?? null,
    preferredTime: mergedFields.preferred_time_exact ?? mergedFields.preferred_time ?? null
  });

  if (schedulingOverride) {
    return {
      intent: schedulingOverride.intent,
      shouldHandoff: false,
      nextAction: schedulingOverride.nextMissingField ? "ask_missing" : "reply",
      nextMissingField: schedulingOverride.nextMissingField,
      capturedFields: {},
      retryCount: 0,
      policyMessage: null,
      customerReply: schedulingOverride.customerReply,
      mergedFields,
      summary: "Scheduling-first intercept",
      stateAdvanced: true,
      nextMetadata: {
        ...meta,
        ...schedulingOverride.nextMetadataPatch,
        last_interaction_at: new Date().toISOString()
      }
    };
  }
```

Align fallback behavior in `response-generator.ts` so scheduling questions do not drift into unrelated prompts:

```ts
  } else if (input.intent === "scheduling_request" && isAskingAvailability(input.customerMessage)) {
    if (!input.knownFields.preferred_date) {
      customerReply = `${getBusinessHoursReply()} ไม่ทราบว่าสะดวกวันไหนครับ? 😊`;
    } else if (!input.knownFields.preferred_time) {
      customerReply = `รับทราบครับ สะดวก${input.knownFields.preferred_date} แล้ว ขอทราบช่วงเวลาที่สะดวกด้วยครับ 😊`;
    } else {
      customerReply = `รับทราบครับ เดี๋ยวผมส่งข้อมูลวันและเวลานี้ให้แอดมินเช็กคิวและยืนยันกลับให้นะครับ 😊`;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx --yes tsx --test lib/cases/scheduling-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cases/scheduling-router.ts lib/cases/scheduling-router.test.ts lib/knowledge/search.ts lib/ai/response-generator.ts lib/cases/case-manager.ts
git commit -m "feat: route scheduling turns before stale flow prompts"
```

## Task 4: Run End-To-End Verification And Tighten Scripts

**Files:**
- Modify: [package.json](/root/paa-ai-brain/package.json:1)
- Test: `n8n/line_multi_oa_v3_3accounts.test.ts`
- Test: `lib/cases/pricing-router.test.ts`
- Test: `lib/cases/scheduling-router.test.ts`

- [ ] **Step 1: Add a grouped verification script**

Update `package.json`:

```json
{
  "scripts": {
    "test:shadow-patch": "npx tsx --test n8n/line_multi_oa_v3_3accounts.test.ts lib/cases/pricing-router.test.ts lib/cases/scheduling-router.test.ts"
  }
}
```

- [ ] **Step 2: Run the focused regression suite**

Run:

```bash
npm run test:shadow-patch
```

Expected:

```text
3 tests, 3 passed, 0 failed
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected:

```text
tsc --noEmit
```

with exit code `0`

- [ ] **Step 4: Run production build verification**

Run:

```bash
npm run build
```

Expected:

```text
Compiled successfully
```

and exit code `0`

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: add regression verification for shadow QA patch"
```

## Self-Review

### Spec coverage

- Ingress guard: covered by Task 1
- Pricing-first routing: covered by Task 2
- Scheduling-first routing: covered by Task 3
- Verification/regression layer: covered by Task 4

### Placeholder scan

- No `TODO`, `TBD`, or deferred placeholders remain in tasks
- Every task includes exact file paths, commands, and minimal code snippets

### Type consistency

- Router helpers return small override objects and integrate through existing `FinalTurnDecision`-style fields
- New helper imports are named consistently:
  - `buildPricingTurnOverride`
  - `buildSchedulingTurnOverride`
  - `detectPricingTurn`
  - `detectSchedulingTurn`

