import test from "node:test";
import assert from "node:assert/strict";

import { buildPublicAiRespondPayload, EXPLICIT_SILENT_REASONS } from "./respond-contract";
import type { ExtractedCaseFields, FinalTurnDecision } from "@/lib/types";

type TestDecision = FinalTurnDecision & {
  mergedFields: ExtractedCaseFields;
  summary: string;
  nextMetadata?: unknown;
};

function makeDecision(overrides: Partial<TestDecision> = {}): TestDecision {
  return {
    intent: "general_inquiry",
    shouldHandoff: false,
    nextAction: "reply",
    nextMissingField: null,
    capturedFields: {},
    retryCount: 0,
    policyMessage: null,
    customerReply: "",
    mergedFields: {},
    summary: "test summary",
    stateAdvanced: true,
    nextMetadata: {},
    policyBlockReason: null,
    ...overrides
  } satisfies TestDecision;
}

test("facebook live pricing inquiry never returns skip_reply without explicit admin takeover", () => {
  const payload = buildPublicAiRespondPayload({
    channel: "facebook",
    customerMessage: "ขอรายละเอียด ราคา+ติดตั้งแอร์ Haier 10,000 และ 18,000 btu ค่ะ",
    messageType: "text",
    runtimeMode: "live",
    decision: makeDecision({
      intent: "general_inquiry",
      shouldHandoff: false,
      nextAction: "reply",
      customerReply: "",
      mergedFields: {}
    })
  });

  assert.equal(payload.ok, true);
  assert.notEqual(payload.recommended_action, "skip_reply");
  assert.ok(payload.customer_reply.length > 0);
  assert.match(payload.customer_reply, /BTU|จำนวนเครื่อง|ติดตั้ง|ประเภทแอร์/);
});

test("partial machine fields produce a follow-up question instead of empty reply", () => {
  const payload = buildPublicAiRespondPayload({
    channel: "line",
    customerMessage: "ติดผนังค่ะ",
    messageType: "text",
    runtimeMode: "live",
    decision: makeDecision({
      intent: "faq_pricing",
      shouldHandoff: false,
      nextAction: "reply",
      customerReply: "",
      mergedFields: {
        machine_type: "wall"
      }
    })
  });

  assert.equal(payload.recommended_action, "reply_customer");
  assert.ok(payload.customer_reply.length > 0);
  assert.match(payload.customer_reply, /จำนวนเครื่อง/);
});

test("skip_reply is preserved only for explicit silent reasons", () => {
  const payload = buildPublicAiRespondPayload({
    channel: "line",
    customerMessage: "ข้อความเดิม",
    messageType: "text",
    runtimeMode: "live",
    decision: makeDecision({
      nextAction: "skip_reply",
      policyMessage: "duplicate",
      customerReply: ""
    })
  });

  assert.equal(payload.recommended_action, "skip_reply");
  assert.equal(payload.customer_reply, "");
  assert.ok(EXPLICIT_SILENT_REASONS.includes(payload.decision_meta.reason as (typeof EXPLICIT_SILENT_REASONS)[number]));
});

test("facebook live ask_missing with empty reply generates follow-up question", () => {
  const payload = buildPublicAiRespondPayload({
    channel: "facebook",
    customerMessage: "ขอรายละเอียด ราคา+ติดตั้งแอร์ Haier 10,000 และ 18,000 btu ค่ะ",
    messageType: "text",
    runtimeMode: "live",
    decision: makeDecision({
      intent: "general_inquiry",
      nextAction: "skip_reply",
      nextMissingField: "machine_type",
      customerReply: "",
      nextMetadata: {
        last_reply_mode: "ask_missing"
      }
    })
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.recommended_action, "reply_customer");
  assert.ok(payload.customer_reply.length > 0);
  assert.match(payload.customer_reply, /ประเภทแอร์|ติดตั้ง|BTU/);
  assert.equal(payload.decision_meta.reason, "fallback_reply_generated");
});

test("non-explicit skip_reply is converted into a customer reply", () => {
  const payload = buildPublicAiRespondPayload({
    channel: "line",
    customerMessage: "👍",
    messageType: "sticker",
    runtimeMode: "live",
    decision: makeDecision({
      nextAction: "skip_reply",
      customerReply: ""
    })
  });

  assert.equal(payload.recommended_action, "reply_customer");
  assert.ok(payload.customer_reply.length > 0);
  assert.equal(payload.decision_meta.reason, "fallback_reply_generated");
});
