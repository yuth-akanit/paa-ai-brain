import { classifyIntent } from "@/lib/ai/intent-classifier";
import { generateAiResponse } from "@/lib/ai/response-generator";
import { extractStructuredFields } from "@/lib/ai/structured-extractor";
import { listPricingFactsFromMock } from "@/lib/data/knowledge-provider";
import { searchMockKnowledge } from "@/lib/knowledge/search-local";
import { resolveIntentWithCaseContext, looksLikeThaiAddress, normalizeThaiAddress } from "@/lib/cases/conversation-signals";
import { getMissingBookingFields } from "@/lib/booking/webhook";
import { applyAvailabilityPolicy, handlePendingAlternativeProposal } from "@/lib/cases/case-manager";
import { normalizeScheduleFields } from "@/lib/cases/schedule-normalizer";
import type { AiDecision, ExtractedCaseFields, IntentName, ServiceType, ConversationMetadata, AvailabilityPolicyBlockReason } from "@/lib/types";

export type SimulateInput = {
  message: string;
  messageType?: "text" | "sticker" | "image";
  channel?: string;
  profile?: {
    user_id?: string;
    display_name?: string;
  };
  prior_case_state?: {
    extracted_fields?: ExtractedCaseFields;
    summary?: string;
    ai_intent?: IntentName;
    service_type?: ServiceType;
    missing_fields?: string[];
    metadata?: ConversationMetadata;
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
  metadata: ConversationMetadata;
  admin_summary: {
    reason: string;
    recommended_next_action: string;
    summary: string;
  };
  capturedFields: Record<string, unknown>;
  stateAdvanced: boolean;
  nextAction: string;
  policyBlockReason: string | null;
  proposedSlot: { date: string; time: string } | null;
  pendingProposal: boolean;
};

const FIELD_QUESTIONS: Record<string, string> = {
  customer_name: "ขอทราบชื่อลูกค้าด้วยครับ? 😊",
  phone: "ขอเบอร์โทรติดต่อด้วยครับ?",
  address: "ขอที่อยู่หรือพื้นที่บริการด้วยครับ?",
  area: "อยู่แถวไหนครับ?",
  preferred_date: "สะดวกวันไหนครับ?",
  preferred_time: "สะดวกเวลาไหนครับ?",
  machine_count: "มีกี่เครื่องครับ?",
  symptoms: "ช่วยอธิบายอาการเพิ่มเติมอีกนิดได้ไหมครับ?"
};

function buildAdminSummary(intent: IntentName, shouldHandoff: boolean, message: string) {
  const specialized = intent === "cold_room_request";
  const directHandoff = intent === "admin_handoff";
  
  const reason = specialized
    ? "complex_specialized_case"
    : directHandoff
      ? "customer_requested_human_agent"
      : shouldHandoff
        ? "low_confidence_or_policy_limit"
        : "not_required";
        
  const recommended = specialized
    ? "admin_contact_and_schedule_site_visit"
    : directHandoff
      ? "admin_contact_customer"
      : shouldHandoff
        ? "admin_review_case"
        : "continue_ai_collection";
        
  const summary = specialized
    ? "ลูกค้าสอบถามงาน cold room สำหรับโรงงาน ต้องให้แอดมินรับต่อ"
    : directHandoff
      ? "ลูกค้าร้องขอคุยกับเจ้าหน้าที่โดยตรง ควรให้แอดมินรับช่วงต่อทันที"
      : `สรุปข้อความล่าสุด: ${message}`;

  return { reason, recommended_next_action: recommended, summary };
}

export async function simulateConversation(input: SimulateInput): Promise<SimulateResult> {
  const trace: string[] = [];
  const messageType = input.messageType || "text";
  const prior = input.prior_case_state || {};
  const metadata = (prior.metadata || {}) as ConversationMetadata;
  const currentFields = prior.extracted_fields ?? {};

  trace.push(`1. Input received: type=${messageType}, text="${input.message}"`);

  // Sticker Logic
  if (messageType === "sticker") {
      const ACTIVE_INTENTS_FOR_STICKER = ["cleaning_request", "repair_request", "inspection_request", "relocation_request", "installation_request", "scheduling_request"];
      const existingIntent = prior.ai_intent || "general_inquiry";
      const missingFields = prior.missing_fields || [];
      
      if (existingIntent && ACTIVE_INTENTS_FOR_STICKER.includes(existingIntent) && missingFields.length > 0) {
        const nextField = missingFields[0];
        return {
          ok: true, mode: "dry-run", channel: input.channel ?? "line", profile: input.profile ?? null,
          detected_intent: existingIntent as IntentName, extracted_fields: currentFields, missing_fields: missingFields as any,
          should_handoff: false, customer_reply: FIELD_QUESTIONS[nextField] ?? "ขอรายละเอียดเพิ่มเติมด้วยครับ?",
          confidence: 1.0, knowledge_hits: [], price_facts: [], handoff_reason: null, metadata,
          trace: [...trace, "2. Sticker handled in flow"],
          admin_summary: buildAdminSummary(existingIntent as IntentName, false, "[sticker]"),
          capturedFields: {}, stateAdvanced: false,
          nextAction: "ask_missing",
          policyBlockReason: null,
          proposedSlot: null,
          pendingProposal: false
        };
      }
      return {
        ok: true, mode: "dry-run", channel: input.channel ?? "line", profile: input.profile ?? null,
        detected_intent: "closing", extracted_fields: currentFields, missing_fields: [], should_handoff: false,
        customer_reply: "", confidence: 1.0, knowledge_hits: [], price_facts: [], handoff_reason: null, metadata,
        trace: [...trace, "2. Sticker skipped"],
        admin_summary: buildAdminSummary("closing", false, "[sticker]"),
        capturedFields: {}, stateAdvanced: false,
        nextAction: "skip_reply",
        policyBlockReason: null,
        proposedSlot: null,
        pendingProposal: false
      };
  }

  // Image Logic
  if (messageType === "image" && !input.message) {
    const retryCount = (metadata.image_clarification_retry_count || 0) + 1;
    const isExhausted = retryCount >= 3;
    
    if (isExhausted) {
        const adminSummary = buildAdminSummary("general_inquiry", true, "[image]");
        return {
          ok: true, mode: "dry-run", channel: input.channel ?? "line", profile: input.profile ?? null,
          detected_intent: "general_inquiry", extracted_fields: currentFields, missing_fields: [], should_handoff: true,
          customer_reply: "ขออภัยครับ ดูเหมือนข้อมูลจากรูปยังไม่ชัดเจน เดี๋ยวส่งต่อให้เจ้าหน้าที่ช่วยเหลือแทนนะครับ 😊",
          confidence: 1.0, knowledge_hits: [], price_facts: [], handoff_reason: adminSummary.reason,
          metadata: { ...metadata, image_clarification_retry_count: retryCount, media_flow_state: "image_retry_exhausted" },
          trace: [...trace, "2. Image clarification exhausted"],
          admin_summary: adminSummary, capturedFields: {}, stateAdvanced: false,
          nextAction: "handoff",
          policyBlockReason: null,
          proposedSlot: null,
          pendingProposal: false
        };
    }

    return {
      ok: true, mode: "dry-run", channel: input.channel ?? "line", profile: input.profile ?? null,
      detected_intent: "general_inquiry", extracted_fields: currentFields, missing_fields: [], should_handoff: false,
      customer_reply: "ได้เลยครับ เห็นรูปที่ส่งมาแล้วครับ 😊\nรบกวนบอกด้วยครับว่าต้องการบริการอะไร?",
      confidence: 1.0, knowledge_hits: [], price_facts: [], handoff_reason: null,
      metadata: { ...metadata, image_clarification_retry_count: retryCount, media_flow_state: "awaiting_service_label_for_image" },
      trace: [...trace, "2. Image clarification requested"],
      admin_summary: buildAdminSummary("general_inquiry", false, "[image]"),
      capturedFields: {}, stateAdvanced: false,
      nextAction: "clarify",
      policyBlockReason: null,
      proposedSlot: null,
      pendingProposal: false
    };
  }

  // Text Processing
  const extracted = await extractStructuredFields(input.message, currentFields, null, { disableRemote: true });
  const normalizedExtracted = normalizeScheduleFields(extracted, input.message);
  
  // Milestone 1B: Force-capture Thai address if it's the next missing field
  const missingFieldsAtStart = prior.missing_fields || [];
  if (missingFieldsAtStart[0] === "address" && !normalizedExtracted.address && looksLikeThaiAddress(input.message)) {
      trace.push(`M1B. Deterministic Thai address detected. Force-capturing...`);
      normalizedExtracted.address = normalizeThaiAddress(input.message);
  }

  trace.push(`2. Extracted fields: ${Object.keys(normalizedExtracted).join(", ") || "none detected"}`);

  const classified = await classifyIntent(input.message, null, { disableRemote: true }, currentFields);
  trace.push(`3. Classified intent: ${classified.intent} (confidence: ${classified.confidence})`);

  // Milestone 1B: Availability State Machine Logic
  let availabilityState = metadata.availability_flow_state || "none";
  let policyBlockReason: AvailabilityPolicyBlockReason | null = metadata.policy_block_reason || null;
  let proposedSlot = metadata.last_proposed_slot || null;
  let pendingProposal = metadata.pending_proposal || false;
  
  // 1. Negotiation Handling (Match CaseManager logic)
  const negotiation = handlePendingAlternativeProposal(input.message, metadata, currentFields, extracted);
  let skipPolicyCheck = false;

  if (negotiation.resolution === "accept") {
      availabilityState = "slot_reconfirmation";
      extracted.preferred_date = negotiation.newFields.preferred_date;
      extracted.preferred_time = negotiation.newFields.preferred_time;
      pendingProposal = false;
      policyBlockReason = null;
      proposedSlot = null;
      skipPolicyCheck = true;
      trace.push(`M1B. Proposal accepted.`);
  } else if (negotiation.resolution === "reject") {
      availabilityState = "availability_conflict";
      pendingProposal = false;
      policyBlockReason = null;
      proposedSlot = null;
      trace.push(`M1B. Proposal rejected.`);
  }
  // 2. Policy Evaluation
  if (!skipPolicyCheck) {
      const mergedForPolicy = { ...currentFields, ...extracted };
      const policyResult = applyAvailabilityPolicy(mergedForPolicy);

      if (policyResult.reason) {
          policyBlockReason = policyResult.reason;
          proposedSlot = policyResult.proposedSlot;
          availabilityState = "proposed_alternative_slot";
          pendingProposal = true;
          trace.push(`M1B. Policy block: ${policyResult.reason}`);
      } else if (input.message.includes("ไม่ว่าง") || input.message.includes("ไม่สะดวก")) {
          availabilityState = "availability_conflict";
          policyBlockReason = null;
          pendingProposal = false;
          trace.push(`M1B. Availability conflict detected`);
      } else if (extracted.preferred_date || extracted.preferred_time) {
          availabilityState = "slot_reconfirmation";
          policyBlockReason = null;
          proposedSlot = null;
          pendingProposal = false;
          trace.push(`M1B. Valid slot detected`);
      }
  }

  if (availabilityState === "availability_conflict" && (input.message.includes("วันอื่น") || input.message.includes("เมื่อไหร่"))) {
      availabilityState = "awaiting_alternative_slot";
  }

  // Image Clarification Recovery
  if (metadata.media_flow_state === "awaiting_service_label_for_image") {
      const isHelpful = extracted.service_type || classified.intent === "cleaning_request" || classified.intent === "repair_request";
      if (!isHelpful) {
          const retryCount = (metadata.image_clarification_retry_count || 0) + 1;
          if (retryCount >= 3) {
              const adminSummary = buildAdminSummary("general_inquiry", true, input.message);
              return {
                  ok: true, mode: "dry-run", channel: input.channel ?? "line", profile: input.profile ?? null,
                  detected_intent: "general_inquiry", extracted_fields: currentFields, missing_fields: [], should_handoff: true,
                  customer_reply: "ขออภัยครับ เดี๋ยวส่งต่อให้เจ้าหน้าที่ช่วยเหลือแทนนะครับ 😊",
                  confidence: 1.0, knowledge_hits: [], price_facts: [], handoff_reason: adminSummary.reason,
                  metadata: { ...metadata, image_clarification_retry_count: retryCount, media_flow_state: "image_retry_exhausted" },
                  trace: [...trace, "2. Image clarification exhausted via text"],
                  admin_summary: adminSummary, capturedFields: {}, stateAdvanced: false,
                  nextAction: "handoff",
                  policyBlockReason: null,
                  proposedSlot: null,
                  pendingProposal: false
              };
          }
          return {
              ok: true, mode: "dry-run", channel: input.channel ?? "line", profile: input.profile ?? null,
              detected_intent: "general_inquiry", extracted_fields: currentFields, missing_fields: [], should_handoff: false,
              customer_reply: "รบกวนระบุบริการที่ต้องการจากรูปด้วยครับ (ล้าง/ซ่อม/ย้าย) 😊",
              confidence: 1.0, knowledge_hits: [], price_facts: [], handoff_reason: null,
              metadata: { ...metadata, image_clarification_retry_count: retryCount },
              trace: [...trace, "2. Image clarification re-ask"],
              admin_summary: buildAdminSummary("general_inquiry", false, input.message),
              capturedFields: {}, stateAdvanced: false,
              nextAction: "clarify",
              policyBlockReason: null,
              proposedSlot: null,
              pendingProposal: false
          };
      }
  }

  const intent = resolveIntentWithCaseContext({
    existingIntent: prior.ai_intent || null,
    existingServiceType: prior.service_type || (prior.extracted_fields?.service_type) || null,
    missingFields: prior.missing_fields || [],
    classifiedIntent: classified.intent,
    messageText: input.message,
    extractedFields: normalizedExtracted
  });

  const knowledge = searchMockKnowledge(input.message);
  const priceFacts = listPricingFactsFromMock();

  const aiDecision = await generateAiResponse({
    customerMessage: input.message,
    intent,
    intentConfidence: intent === classified.intent ? classified.confidence : 0.92,
    threadSummary: prior.summary ?? null,
    knownFields: normalizedExtracted,
    knowledge,
    priceFacts,
    disableRemote: true,
    availabilityFlowState: availabilityState,
    policyBlockReason,
    proposedSlot,
    pendingProposal
  });

  const mergedFields = { ...normalizedExtracted, ...aiDecision.extracted_fields };
  
  // --- M3A.1 Sync: Orchestration Overrides (Safety Net) ---
  const msgLower = input.message.toLowerCase().trim();
  const isGenuineGreeting = /สวัสดี|หวัดดี/.test(msgLower);
  const isGenuineFarewell = /ขอบคุณ|ลาก่อน|\bbye\b/.test(msgLower);
  
  const isExplicitPricingPivot = /ราคา|เท่าไหร่|เท่าไห่|กี่บาท|ค่าบริการ|เริ่มต้น/.test(msgLower);
  const isExplicitAvailabilityPivot = /วันไหน|ว่างวัน|คิวว่าง|ว่างไหม|มีคิว/.test(msgLower) && !mergedFields.preferred_date;

  // 1. Service Switch Logic: Force update state if current message is for a different service
  if (classified.intent === "installation_request" || msgLower.includes("ติดตั้ง")) {
    aiDecision.intent = "installation_request";
    mergedFields.service_type = "other";
  } else if (classified.intent === "repair_request" || /ไม่เย็น|เสีย|ซ่อม|หยด|พัง/.test(msgLower)) {
    aiDecision.intent = "repair_request";
    mergedFields.service_type = "repair";
  }

  // 2. Intent Overrides: Answer explicit questions instead of generic Checklist logic
  const PIVOT_INTENTS = ["faq_pricing", "scheduling_request", "repair_request", "installation_request"];
  const isPivotIntent = PIVOT_INTENTS.includes(aiDecision.intent);

  if (!isGenuineGreeting && !isGenuineFarewell && isPivotIntent) {
    if (isExplicitPricingPivot) {
      aiDecision.intent = "faq_pricing";
      aiDecision.should_handoff = false;
      aiDecision.missing_fields = [];
      
      const isInstall = msgLower.includes("ติดตั้ง") || classified.intent === "installation_request" || mergedFields.service_type === "other";
      const isRepair = msgLower.includes("ซ่อมแอร์") || classified.intent === "repair_request" || mergedFields.service_type === "repair";

      if (isInstall) {
        aiDecision.customer_reply = "ค่าติดตั้งแอร์ใหม่เริ่มต้น 2,500 บาทครับ (รวมอุปกรณ์พื้นฐาน 4 เมตร) รบกวนแจ้งขนาด BTU และประเภทเครื่องได้เลยครับ เดี๋ยวผมสรุปราคาประเมินให้ครับ";
        aiDecision.intent = "installation_request";
      } else if (isRepair) {
        aiDecision.customer_reply = "ค่าบริการตรวจเช็คและซ่อมเริ่มต้น 500 บาทครับ (ไม่รวมอะไหล่) แอร์มีอาการเบื้องต้นยังไงบ้างครับ? เช่น มีลมออกไหม หรือไฟกะพริบไหมครับ";
        aiDecision.intent = "repair_request";
      } else {
        const qty = mergedFields.machine_count;
        let pricingReply = "ล้างแอร์ติดผนังเริ่มต้น 500 บาท/เครื่องครับ ขึ้นอยู่กับประเภทและขนาด BTU ครับ";
        if (qty) pricingReply += ` ตอนนี้ทราบจำนวน ${qty} เครื่องแล้วครับ`;
        if (!mergedFields.machine_type) pricingReply += " ไม่ทราบว่าเป็นแอร์ติดผนังหรือ 4 ทิศทางครับ?";
        aiDecision.customer_reply = pricingReply;
      }
    } else if (isExplicitAvailabilityPivot) {
      aiDecision.intent = "scheduling_request";
      aiDecision.should_handoff = false;
      aiDecision.customer_reply = "วันอาทิตย์ทางเราหยุดทำการครับ เปิดบริการวันจันทร์-เสาร์ เวลา 09:00-18:00 น. ไม่ทราบว่าคุณลูกค้าสะดวกวันไหนช่วงไหนดีครับ? 😊";
      aiDecision.missing_fields = ["preferred_date"] as any;
    } else if (aiDecision.intent === "repair_request") {
      aiDecision.should_handoff = false;
      aiDecision.customer_reply = "แอร์ไม่เย็นหรือมีอาการยังไงบ้างครับ? เช่น มีลมออกไหม หรือเปิดไม่ติดเลยครับ เดี๋ยวผมประสานงานให้ช่างช่วยตรวจสอบให้ครับ";
      aiDecision.missing_fields = ["symptoms"] as any;
    } else if (aiDecision.intent === "installation_request") {
      aiDecision.should_handoff = false;
      aiDecision.customer_reply = "รับทราบเรื่องติดตั้งแอร์ใหม่ครับ รบกวนขอทราบขนาด BTU หรือประเภทเครื่อง และจำนวนเครื่องที่จะติดตั้งด้วยนะครับ เดี๋ยวผมช่วยเช็กราคาประเมินให้ครับ";
      aiDecision.missing_fields = ["machine_count"] as any;
    }
  }

  // 3. Stale State Recovery Logic
  if (classified.intent === "low_signal_ack" && (aiDecision.intent === "greeting" || aiDecision.intent === "general_inquiry" || aiDecision.intent === "low_signal_ack")) {
      const missing = getMissingBookingFields(currentFields);
      if (missing.length > 0) {
          aiDecision.intent = (prior.ai_intent || "cleaning_request") as IntentName;
          aiDecision.customer_reply = "รับทราบครับ " + (FIELD_QUESTIONS[missing[0]] ?? "ขอรายละเอียดเพิ่มเติมด้วยครับ?");
          aiDecision.missing_fields = missing as any;
          aiDecision.should_handoff = false;
      }
  }

  const adminSummary = buildAdminSummary(aiDecision.intent, aiDecision.should_handoff, input.message);
  
  const capturedFields: Record<string, unknown> = {};
  for (const k of Object.keys(normalizedExtracted)) {
      if (normalizedExtracted[k as keyof ExtractedCaseFields] && !currentFields[k as keyof ExtractedCaseFields]) {
          capturedFields[k] = normalizedExtracted[k as keyof ExtractedCaseFields];
      }
  }

  const resultNextAction = aiDecision.should_handoff ? "handoff" : 
                          (availabilityState === "proposed_alternative_slot" ? "propose_alternative_slot" :
                           availabilityState === "slot_reconfirmation" ? "reconfirm_slot" : 
                           (mergedFields.preferred_date ? "reply" : "ask_missing"));

  return {
    ok: true,
    mode: "dry-run",
    channel: input.channel ?? "line",
    profile: input.profile ?? null,
    detected_intent: aiDecision.intent,
    extracted_fields: mergedFields,
    missing_fields: aiDecision.missing_fields,
    should_handoff: aiDecision.should_handoff,
    customer_reply: aiDecision.customer_reply,
    confidence: aiDecision.confidence,
    knowledge_hits: knowledge,
    price_facts: priceFacts,
    handoff_reason: adminSummary.reason === "not_required" ? null : adminSummary.reason,
    metadata: {
        ...metadata,
        last_missing_field_asked: aiDecision.missing_fields[0] as string || null,
        last_interaction_at: new Date().toISOString(),
        availability_flow_state: availabilityState,
        last_proposed_slot: proposedSlot,
        policy_block_reason: policyBlockReason,
        pending_proposal: pendingProposal
    },
    trace,
    admin_summary: adminSummary,
    capturedFields,
    stateAdvanced: Object.keys(capturedFields).length > 0,
    nextAction: resultNextAction,
    policyBlockReason,
    proposedSlot,
    pendingProposal
  };
}
