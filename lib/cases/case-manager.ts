import { classifyIntent } from "../ai/intent-classifier";
import { generateAiResponse } from "../ai/response-generator";
import { extractStructuredFields } from "../ai/structured-extractor";
import { isBookingReady, sendBookingWebhook } from "../booking/webhook";
import {
  createAuditLog,
  createConversationMessage,
  getServiceCaseById,
  getThreadMessages,
  hasAuditLogAction,
  listPricingFacts,
  updateCustomerProfile,
  updateCaseState,
  updateThreadState
} from "../db/queries";
import { searchKnowledge } from "../knowledge/search";
import { requestAdminHandoff } from "./handoff";
import type { CaseSummaryPayload, ExtractedCaseFields, ServiceType } from "../types";
import { isMeaningful, joinMeaningful } from "../utils";

function mergeFields(current: ExtractedCaseFields, next: ExtractedCaseFields): ExtractedCaseFields {
  return {
    ...current,
    ...next
  };
}

function buildSummary(args: {
  customerName: string | null;
  serviceType: ServiceType | null;
  area: string | null;
  address: string | null;
  symptoms: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  missingFields: string[];
}) {
  const extra = joinMeaningful([
    args.address || args.area,
    args.preferredDate,
    args.preferredTime,
    args.symptoms,
  ]);

  const parts = [
    args.customerName ? `ลูกค้า: ${args.customerName}` : "ลูกค้า: ยังไม่ทราบชื่อ",
    args.serviceType ? `ประเภทงาน: ${args.serviceType}` : "ประเภทงาน: ยังไม่ยืนยัน",
    extra ? `ข้อมูลเพิ่มเติม: ${extra}` : null,
    args.missingFields.length > 0 ? `ข้อมูลที่ยังขาด: ${args.missingFields.join(", ")}` : "ข้อมูลสำคัญครบในระดับพร้อมคัดกรอง"
  ];

  return parts.filter(Boolean).join(" | ");
}

function determineLeadStatus(missingFields: string[], shouldHandoff: boolean) {
  if (shouldHandoff) {
    return "handed_off" as const;
  }

  if (missingFields.length === 0) {
    return "qualified" as const;
  }

  return "collecting_info" as const;
}

export async function processCustomerMessage(params: {
  threadId: string;
  caseId: string;
  customerId: string;
  customerName: string | null;
  channelUserId?: string | null;
  messageText: string;
  imageBase64?: string | null;
  providerMessageId?: string | null;
  requestId?: string;
}) {
  const rId = params.requestId || "no_rid";
  const existingCase = await getServiceCaseById(params.caseId);

  await createConversationMessage({
    threadId: params.threadId,
    caseId: params.caseId,
    role: "customer",
    providerMessageId: params.providerMessageId,
    messageText: params.imageBase64 ? `[Image Sent] ${params.messageText}` : params.messageText
  });

  await updateThreadState({
    threadId: params.threadId,
    status: "open",
    lastCustomerMessageAt: new Date().toISOString()
  });

  // Scope to current caseId so closed prior cases don't leak stale context
  const recentMessages = await getThreadMessages(params.threadId, 20, params.caseId);
  const currentCaseFields = (existingCase.extracted_fields as ExtractedCaseFields | null) ?? {};

  // Parallelize logic
  const [extractedFields, { intent, confidence }, knowledge, priceFacts] = await Promise.all([
    extractStructuredFields(params.messageText, currentCaseFields, params.imageBase64),
    classifyIntent(params.messageText, params.imageBase64),
    searchKnowledge(params.messageText),
    listPricingFacts()
  ]);

  const summaryText = recentMessages
    .slice(-8)
    .map((message) => `${message.role}: ${message.message_text}`)
    .join("\n");

  // For FAQ intents, use only fields from current message to avoid thread memory contamination
  const isFaqIntent = intent === "faq_pricing" || intent === "faq_service_area";
  const knownFieldsForAi = isFaqIntent
    ? { machine_type: extractedFields.machine_type, area: extractedFields.area }
    : extractedFields;

  const aiDecision = await generateAiResponse({
    customerMessage: params.messageText,
    intent,
    intentConfidence: confidence,
    threadSummary: summaryText || null,
    knownFields: knownFieldsForAi,
    knowledge,
    priceFacts,
    imageBase64: params.imageBase64
  });

  const mergedFields = mergeFields(extractedFields, aiDecision.extracted_fields);
  const summary = buildSummary({
    customerName: mergedFields.customer_name ?? params.customerName,
    serviceType: (mergedFields.service_type as ServiceType | undefined) ?? null,
    area: mergedFields.area ?? null,
    address: mergedFields.address ?? null,
    symptoms: mergedFields.symptoms ?? null,
    preferredDate: mergedFields.preferred_date ?? null,
    preferredTime: mergedFields.preferred_time ?? null,
    missingFields: aiDecision.missing_fields
  });
  const isScheduling = aiDecision.intent === "scheduling_request";
  // scheduling_request: ตอบลูกค้าได้ แต่ไม่เปลี่ยน lead_status เป็น handed_off
  const leadStatus = determineLeadStatus(aiDecision.missing_fields, aiDecision.should_handoff);
  const threadStatus = aiDecision.should_handoff ? "handed_off" : leadStatus === "qualified" ? "qualified" : "waiting_customer";

  await createConversationMessage({
    threadId: params.threadId,
    caseId: params.caseId,
    role: "assistant",
    messageText: aiDecision.customer_reply,
    metadata: {
      extracted_fields: mergedFields,
      intent: aiDecision.intent,
      confidence: aiDecision.confidence,
      missing_fields: aiDecision.missing_fields
    }
  });

  await updateCaseState({
    caseId: params.caseId,
    leadStatus,
    serviceType: mergedFields.service_type ?? null,
    extractedFields: mergedFields,
    missingFields: aiDecision.missing_fields,
    aiIntent: aiDecision.intent,
    aiConfidence: aiDecision.confidence,
    summary,
    handoffReason: aiDecision.should_handoff ? "AI confidence ต่ำหรือคำถามซับซ้อนเกินขอบเขตที่อนุญาต" : null
  });

  await updateCustomerProfile(params.customerId, {
    display_name: mergedFields.customer_name ?? params.customerName ?? undefined,
    phone: mergedFields.phone,
    default_area: mergedFields.area
  });

  await updateThreadState({
    threadId: params.threadId,
    status: threadStatus,
    lastAssistantMessageAt: new Date().toISOString(),
    summary
  });

  await createAuditLog({
    entityType: "service_case",
    entityId: params.caseId,
    action: "ai_decision_recorded",
    payload: aiDecision
  });

  const bookingEligibleIntents = ["cleaning_request", "repair_request", "inspection_request", "relocation_request", "scheduling_request"];
  const bookingAlreadySent = await hasAuditLogAction("service_case", params.caseId, "booking_webhook_sent");
  const canSendBookingWebhook =
    bookingEligibleIntents.includes(aiDecision.intent) &&
    isBookingReady(mergedFields) &&
    !bookingAlreadySent;

  if (canSendBookingWebhook) {
    try {
      await sendBookingWebhook({
        source: "paa-ai-brain",
        case_id: params.caseId,
        thread_id: params.threadId,
        customer_id: params.customerId,
        customer_name: mergedFields.customer_name,
        phone: mergedFields.phone,
        address: mergedFields.address,
        date: mergedFields.preferred_date,
        time: mergedFields.preferred_time,
        service_type: mergedFields.service_type,
        machine_count: mergedFields.machine_count,
        area: mergedFields.area ?? null,
        symptoms: mergedFields.symptoms ?? null,
        line_user_id: params.channelUserId ?? null
      });

      await createAuditLog({
        entityType: "service_case",
        entityId: params.caseId,
        action: "booking_webhook_sent",
        payload: {
          customer_name: mergedFields.customer_name,
          phone: mergedFields.phone,
          address: mergedFields.address,
          preferred_date: mergedFields.preferred_date,
          preferred_time: mergedFields.preferred_time,
          service_type: mergedFields.service_type,
          machine_count: mergedFields.machine_count
        }
      });
    } catch (error) {
      await createAuditLog({
        entityType: "service_case",
        entityId: params.caseId,
        action: "booking_webhook_failed",
        payload: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  let handoffId: string | null = null;

  if (aiDecision.should_handoff) {
    // Full handoff — AI หยุดตอบ, admin รับเคส
    const summaryPayload: CaseSummaryPayload = {
      caseId: params.caseId,
      customerName: mergedFields.customer_name ?? params.customerName,
      phone: mergedFields.phone ?? null,
      area: mergedFields.area ?? null,
      serviceType: mergedFields.service_type ?? null,
      symptoms: mergedFields.symptoms ?? null,
      preferredDate: mergedFields.preferred_date ?? null,
      urgency: mergedFields.urgency ?? null,
      leadStatus,
      summary,
      handoffReason: "AI confidence ต่ำหรือคำถามซับซ้อนเกินขอบเขตที่อนุญาต"
    };

    const handoff = await requestAdminHandoff({
      caseId: params.caseId,
      threadId: params.threadId,
      reason: summaryPayload.handoffReason ?? "ต้องการให้แอดมินดูต่อ",
      summaryPayload
    });
    handoffId = handoff.id;

  } else if (isScheduling) {
    // Soft notify — AI ยังตอบได้ แต่สร้าง handoff record เพื่อให้ admin เห็นในระบบว่าต้องเช็คคิว
    const schedulingSummary = `ลูกค้าถามเรื่องคิวนัดหมาย: "${params.messageText}" | AI ตอบว่าจะแจ้งทีมช่างแล้ว รบกวน admin เช็คคิวและติดต่อกลับ`;
    const schedulingSummaryPayload: CaseSummaryPayload = {
      caseId: params.caseId,
      customerName: mergedFields.customer_name ?? params.customerName,
      phone: mergedFields.phone ?? null,
      area: mergedFields.area ?? null,
      serviceType: mergedFields.service_type ?? null,
      symptoms: null,
      preferredDate: mergedFields.preferred_date ?? null,
      urgency: mergedFields.urgency ?? null,
      leadStatus,
      summary: schedulingSummary,
      handoffReason: "scheduling_followup_required"
    };

    const handoff = await requestAdminHandoff({
      caseId: params.caseId,
      threadId: params.threadId,
      reason: "scheduling_followup_required",
      summaryPayload: schedulingSummaryPayload
    });
    handoffId = handoff.id;
  }

  return {
    aiDecision,
    mergedFields,
    leadStatus,
    threadStatus,
    summary,
    handoffId
  };
}
