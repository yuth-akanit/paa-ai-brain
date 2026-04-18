import { classifyIntent } from "./intent-classifier";
import { generateAiResponse } from "./response-generator";
import { extractStructuredFields } from "./structured-extractor";
import { listPricingFacts, getThreadMessages, getServiceCaseById, getCaseByThreadId } from "../db/queries";
import { searchKnowledge } from "../knowledge/search";
import type { ExtractedCaseFields } from "../types";

export interface BrainParams {
  channel: string;
  channelUserId: string;
  customerMessage: string;
  threadId?: string | null;
  isolationMode?: "mock_fast_path" | "no_context" | "full";
}

/**
 * Helper to build a deterministic safe fallback response
 */
export function buildSafeHandoffDecision(input: {
  reason: string;
  summary?: string;
  customerReply?: string;
  errorCode?: string;
}) {
  return {
    ok: false,
    intent: "unknown",
    confidence: 0,
    should_handoff: true,
    missing_fields: [],
    extracted_fields: {},
    customer_reply:
      input.customerReply ??
      "ขออภัยครับ ระบบกำลังตรวจสอบข้อมูล เดี๋ยวเจ้าหน้าที่ประสานกลับให้ครับ",
    recommended_action: "handoff_admin" as const,
    admin_summary: {
      reason: input.reason,
      summary: input.summary ?? "runtime fallback triggered",
      recommended_next_action: "admin_review_customer_message",
    },
    decision_meta: {
      decision_version: "line-runtime-mvp-v1",
      policy_version: "runtime-policy-v1",
      used_fallback: true,
      error_code: input.errorCode || null
    },
  };
}

export async function processRuntimeBrain(params: BrainParams, opts: { requestId: string; debug?: boolean }) {
  const startedAt = Date.now();
  const { requestId } = opts;
  const mode = params.isolationMode || "full";
  

  if (mode === "mock_fast_path") {
    return {
      ok: true,
      intent: "general_inquiry",
      confidence: 1.0,
      should_handoff: false,
      missing_fields: [],
      extracted_fields: {},
      customer_reply: "นี่คือ Mock Response เพื่อทดสอบ Latency ครับ",
      recommended_action: "reply_customer",
      admin_summary: null,
      decision_meta: {
        decision_version: "mock-v1",
        policy_version: "mock-policy-v1",
        used_fallback: false,
        error_code: null
      }
    };
  }

  try {
    let contextMessages: any[] = [];
    let existingFields: ExtractedCaseFields = {};

    const skipContext = mode === "no_context";
    
    if (params.threadId && !skipContext) {
      try {
        contextMessages = await getThreadMessages(params.threadId, 5);
        const serviceCase = await getCaseByThreadId(params.threadId);
        existingFields = (serviceCase?.extracted_fields as ExtractedCaseFields) ?? {};
      } catch (e) {
        console.warn("[stateless-runtime] skipping context fetch", e);
      }
    } else {
    }

    
    // Parallel run Phase 1: Intent & Fields
    const [classifyResult, extractionResult] = await Promise.all([
      classifyIntent(params.customerMessage, null),
      extractStructuredFields(params.customerMessage, existingFields, null)
    ]);
    const { intent, confidence } = classifyResult;

    let knowledge: any[] = [];
    let priceFacts: any[] = [];
    if (!skipContext) {
      const [k, p] = await Promise.all([
        searchKnowledge(params.customerMessage),
        listPricingFacts()
      ]);
      knowledge = k;
      priceFacts = p;
    }

    const threadSummary = contextMessages.slice(-5).map(m => `${m.role}: ${m.message_text}`).join("\n");
    const isFaqIntent = intent === "faq_pricing" || intent === "faq_service_area";
    const knownFieldsForAi = isFaqIntent
      ? { machine_type: extractionResult.machine_type, area: extractionResult.area }
      : extractionResult;

    const aiDecision = await generateAiResponse({
      customerMessage: params.customerMessage,
      intent,
      intentConfidence: confidence,
      threadSummary: threadSummary || null,
      knownFields: knownFieldsForAi,
      knowledge,
      priceFacts
    });

    const isSpecialized = ["cold_room_request", "relocation_request"].includes(aiDecision.intent);
    const isScheduling = aiDecision.intent === "scheduling_request";
    const isLowConfidence = aiDecision.confidence < 0.8;
    // scheduling_request: AI ตอบลูกค้าได้ แต่ต้องแจ้ง admin ให้ติดต่อกลับ (soft notify, ยังไม่ lock thread)
    const shouldHandoff = aiDecision.should_handoff || isSpecialized;
    const needsAdminNotify = shouldHandoff || isLowConfidence || isScheduling;
    const recommendedAction = shouldHandoff ? "handoff_admin" : "reply_customer";

    const adminSummaryReason = isSpecialized ? "specialized_case" : isScheduling ? "scheduling_followup_required" : isLowConfidence ? "low_confidence" : "ai_requested_handoff";
    const adminSummaryAction = isScheduling ? "admin_check_schedule_and_callback" : "admin_review_and_contact";

    const result = {
      ok: true,
      intent: aiDecision.intent,
      confidence: aiDecision.confidence,
      should_handoff: shouldHandoff,
      missing_fields: aiDecision.missing_fields,
      extracted_fields: { ...extractionResult, ...aiDecision.extracted_fields },
      customer_reply: aiDecision.customer_reply,
      recommended_action: recommendedAction,
      admin_summary: needsAdminNotify ? {
        reason: adminSummaryReason,
        summary: isScheduling
          ? `ลูกค้าถามเรื่องคิวนัดหมาย: "${params.customerMessage}" — AI ตอบว่าจะแจ้งทีมช่างแล้ว รบกวน admin เช็คคิวและติดต่อกลับด้วยครับ`
          : (aiDecision.customer_reply || "AI triggered handoff during conversation"),
        recommended_next_action: adminSummaryAction
      } : null,
      decision_meta: {
        decision_version: "line-runtime-v2-persistent",
        policy_version: "runtime-policy-v2",
        used_fallback: false,
        error_code: null
      }
    };

    return result;

  } catch (error) {
    console.error(`[BRAIN] [${requestId}] fail total_ms=${Date.now() - startedAt}ms`, error);
    return buildSafeHandoffDecision({
      reason: "internal_brain_error",
      summary: error instanceof Error ? error.message : "Caught unexpected error in brain process",
      errorCode: "BRAIN_CRASH"
    });
  }
}

