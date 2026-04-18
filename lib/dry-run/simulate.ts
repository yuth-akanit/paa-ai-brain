import { classifyIntent } from "@/lib/ai/intent-classifier";
import { generateAiResponse } from "@/lib/ai/response-generator";
import { extractStructuredFields } from "@/lib/ai/structured-extractor";
import { listPricingFactsFromMock } from "@/lib/data/knowledge-provider";
import { searchMockKnowledge } from "@/lib/knowledge/search-local";
import type { AiDecision, ExtractedCaseFields, IntentName } from "@/lib/types";

export type SimulateInput = {
  message: string;
  channel?: string;
  profile?: {
    user_id?: string;
    display_name?: string;
  };
  prior_case_state?: {
    extracted_fields?: ExtractedCaseFields;
    summary?: string;
  };
};

export type SimulateResult = {
  ok: true;
  mode: "dry-run";
  channel: string;
  profile: SimulateInput["profile"] | null;
  detected_intent: IntentName;
  extracted_fields: ExtractedCaseFields;
  missing_fields: AiDecision["missing_fields"];
  should_handoff: boolean;
  customer_reply: string;
  confidence: number;
  knowledge_hits: ReturnType<typeof searchMockKnowledge>;
  price_facts: ReturnType<typeof listPricingFactsFromMock>;
  handoff_reason: string | null;
  trace: string[];
  admin_summary: {
    reason: string;
    recommended_next_action: string;
    summary: string;
  };
};

function buildAdminSummary(args: {
  intent: string;
  shouldHandoff: boolean;
  extractedFields: ExtractedCaseFields;
  message: string;
}) {
  const specialized = args.intent === "cold_room_request";
  const directHandoff = args.intent === "admin_handoff";
  const reason = specialized
    ? "complex_specialized_case"
    : directHandoff
      ? "customer_requested_human_agent"
      : args.shouldHandoff
        ? "low_confidence_or_policy_limit"
        : "not_required";
  const recommended = specialized
    ? "admin_contact_and_schedule_site_visit"
    : directHandoff
      ? "admin_contact_customer"
      : args.shouldHandoff
        ? "admin_review_case"
        : "continue_ai_collection";
  const summary = specialized
    ? "ลูกค้าสอบถามงาน cold room สำหรับโรงงาน ต้องให้แอดมินรับต่อ"
    : directHandoff
      ? "ลูกค้าร้องขอคุยกับเจ้าหน้าที่โดยตรง ควรให้แอดมินรับช่วงต่อทันที"
    : `สรุปข้อความล่าสุด: ${args.message}`;

  return {
    reason,
    recommended_next_action: recommended,
    summary
  };
}

export async function simulateConversation(input: SimulateInput): Promise<SimulateResult> {
  const trace: string[] = [];
  trace.push(`1. Input received: "${input.message}"`);

  const currentFields = input.prior_case_state?.extracted_fields ?? {};
  const extracted = await extractStructuredFields(input.message, currentFields, null, { disableRemote: true });
  trace.push(`2. Extracted fields: ${Object.keys(extracted).join(", ") || "none detected"}`);

  const { intent, confidence } = await classifyIntent(input.message, null, { disableRemote: true });
  trace.push(`3. Classified intent: ${intent} (confidence: ${confidence})`);

  const knowledge = searchMockKnowledge(input.message);
  trace.push(`4. Search knowledge: found ${knowledge.length} items`);

  const priceFacts = listPricingFactsFromMock();
  const aiDecision = await generateAiResponse({
    customerMessage: input.message,
    intent,
    intentConfidence: confidence,
    threadSummary: input.prior_case_state?.summary ?? null,
    knownFields: extracted,
    knowledge,
    priceFacts,
    disableRemote: true
  });
  trace.push(`5. AI Decision: should_handoff=${aiDecision.should_handoff}, reply_length=${aiDecision.customer_reply.length}`);

  const mergedFields = {
    ...extracted,
    ...aiDecision.extracted_fields
  };

  const adminSummary = buildAdminSummary({
    intent,
    shouldHandoff: aiDecision.should_handoff,
    extractedFields: mergedFields,
    message: input.message
  });
  trace.push(`6. Final logic applied: policy_status=${adminSummary.reason}`);

  return {
    ok: true,
    mode: "dry-run",
    channel: input.channel ?? "line",
    profile: input.profile ?? null,
    detected_intent: intent,
    extracted_fields: mergedFields,
    missing_fields: aiDecision.missing_fields,
    should_handoff: aiDecision.should_handoff,
    customer_reply: aiDecision.customer_reply,
    confidence: aiDecision.confidence,
    knowledge_hits: knowledge,
    price_facts: priceFacts,
    handoff_reason: adminSummary.reason === "not_required" ? null : adminSummary.reason,
    trace,
    admin_summary: adminSummary
  };
}
