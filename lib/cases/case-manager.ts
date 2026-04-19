import { classifyIntent } from "../ai/intent-classifier";
import { generateAiResponse } from "../ai/response-generator";
import { extractStructuredFields } from "../ai/structured-extractor";
import { getMissingBookingFields, sendBookingWebhook } from "../booking/webhook";
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
import { normalizeScheduleFields } from "./schedule-normalizer";
import type { CaseSummaryPayload, ExtractedCaseFields, IntentName, ServiceType } from "../types";
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

const ACTIVE_SERVICE_INTENTS = new Set<IntentName>([
  "cleaning_request",
  "repair_request",
  "inspection_request",
  "relocation_request",
  "installation_request",
  "scheduling_request",
  "faq_pricing"
]);

const STRUCTURED_FOLLOWUP_FIELDS: Array<keyof ExtractedCaseFields> = [
  "customer_name",
  "phone",
  "area",
  "address",
  "machine_type",
  "machine_count",
  "preferred_date",
  "preferred_time"
];

function normalizeDigits(text: string) {
  return text.replace(/\D/g, "");
}

function looksLikeStructuredFollowUp(messageText: string, extractedFields: ExtractedCaseFields) {
  const text = messageText.trim();
  const lower = text.toLowerCase();
  const digits = normalizeDigits(text);

  const asksContactInfo =
    lower.includes("ติดต่อ") ||
    lower.includes("เบอร์ร้าน") ||
    lower.includes("line id") ||
    lower.includes("สำนักงานใหญ่") ||
    lower.includes("สาขา") ||
    lower.includes("email");

  const startsNewIntent =
    lower.includes("ราคา") ||
    lower.includes("เท่าไหร่") ||
    lower.includes("ล้างแอร์") ||
    lower.includes("ซ่อม") ||
    lower.includes("ย้ายแอร์") ||
    lower.includes("ติดตั้ง") ||
    lower.includes("แอดมิน") ||
    lower.includes("ขอบคุณ") ||
    lower.includes("สวัสดี");

  if (asksContactInfo || startsNewIntent) {
    return false;
  }

  if (extractedFields.phone && digits.length >= 9 && digits.length <= 10) {
    return true;
  }

  return STRUCTURED_FOLLOWUP_FIELDS.some((field) => {
    const value = extractedFields[field];
    return typeof value === "string" ? value.trim().length > 0 : typeof value === "number";
  });
}

function looksLikePricingQualifier(messageText: string, extractedFields: ExtractedCaseFields) {
  const text = messageText.trim().toLowerCase();
  const digits = normalizeDigits(text);
  const hasBtuLikeNumber = digits.length >= 4 && digits.length <= 5 && !extractedFields.phone;

  return Boolean(
    extractedFields.machine_type ||
    hasBtuLikeNumber ||
    text.includes("btu") ||
    text.includes("ติดผนัง") ||
    text.includes("cassette") ||
    text.includes("4 ทิศทาง") ||
    text.includes("แขวน") ||
    text.includes("ตั้งพื้น") ||
    text.includes("ตู้ตั้ง")
  );
}

function resolveIntentWithCaseContext(args: {
  existingCase: Awaited<ReturnType<typeof getServiceCaseById>>;
  classifiedIntent: IntentName;
  messageText: string;
  extractedFields: ExtractedCaseFields;
}) {
  const previousIntent = args.existingCase?.ai_intent as IntentName | undefined;
  const previousServiceType = args.existingCase?.service_type as ServiceType | null;
  const missingFields = Array.isArray(args.existingCase?.missing_fields) ? args.existingCase.missing_fields : [];
  const weakFollowUpIntent =
    args.classifiedIntent === "faq_pricing" ||
    args.classifiedIntent === "faq_service_area" ||
    args.classifiedIntent === "faq_contact" ||
    args.classifiedIntent === "general_inquiry" ||
    args.classifiedIntent === "greeting" ||
    args.classifiedIntent === "closing";

  const fillsMissingStructuredField = missingFields.some((field: string) => {
    if (!STRUCTURED_FOLLOWUP_FIELDS.includes(field as keyof ExtractedCaseFields)) {
      return false;
    }
    const value = args.extractedFields[field as keyof ExtractedCaseFields];
    return typeof value === "string" ? value.trim().length > 0 : typeof value === "number";
  });

  const pricingQualifier = looksLikePricingQualifier(args.messageText, args.extractedFields);
  const contextualServiceIntent =
    previousServiceType === "cleaning"
      ? "cleaning_request"
      : previousServiceType === "repair"
        ? "repair_request"
        : previousServiceType === "inspection"
          ? "inspection_request"
          : previousServiceType === "relocation"
            ? "relocation_request"
            : previousIntent;

  if (
    previousIntent === "faq_pricing" &&
    pricingQualifier &&
    !["admin_handoff", "closing", "greeting"].includes(args.classifiedIntent)
  ) {
    return "faq_pricing";
  }

  if (
    contextualServiceIntent &&
    ACTIVE_SERVICE_INTENTS.has(contextualServiceIntent) &&
    weakFollowUpIntent &&
    (fillsMissingStructuredField || pricingQualifier) &&
    (looksLikeStructuredFollowUp(args.messageText, args.extractedFields) || pricingQualifier)
  ) {
    return contextualServiceIntent;
  }

  return args.classifiedIntent;
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
  const [rawExtractedFields, classified, knowledge, priceFacts] = await Promise.all([
    extractStructuredFields(params.messageText, currentCaseFields, params.imageBase64),
    classifyIntent(params.messageText, params.imageBase64, undefined, currentCaseFields),
    searchKnowledge(params.messageText),
    listPricingFacts()
  ]);
  const extractedFields = normalizeScheduleFields(rawExtractedFields, params.messageText);

  const intent = resolveIntentWithCaseContext({
    existingCase,
    classifiedIntent: classified.intent,
    messageText: params.messageText,
    extractedFields
  });
  const confidence = intent === classified.intent ? classified.confidence : Math.max(classified.confidence, 0.92);

  const summaryText = recentMessages
    .slice(-8)
    .map((message) => `${message.role}: ${message.message_text}`)
    .join("\n");

  // Preserve booking context while a service flow is still active, even if a turn is
  // temporarily classified as pricing/service-area FAQ (e.g. customer sends address,
  // BTU, or asks price mid-booking). Otherwise the AI forgets name/phone/address.
  const preserveBookingContext =
    Boolean(existingCase?.ai_intent) &&
    ACTIVE_SERVICE_INTENTS.has(existingCase.ai_intent as IntentName);
  const isFaqIntent = (intent === "faq_pricing" || intent === "faq_service_area") && !preserveBookingContext;
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

  // Booking-context recovery: if AI is confused (general_inquiry + should_handoff)
  // but we're still in an active booking flow, ask next missing field instead of handing off
  const BOOKING_SERVICE_INTENTS = ["cleaning_request","repair_request","inspection_request","relocation_request","installation_request"];
  const previousAiIntent = existingCase?.ai_intent as string | null;
  const isInBookingFlow = previousAiIntent && BOOKING_SERVICE_INTENTS.includes(previousAiIntent);
  if (aiDecision.intent === "general_inquiry" && aiDecision.should_handoff && isInBookingFlow) {
    const bookingMissing = getMissingBookingFields(currentCaseFields);
    if (bookingMissing.length > 0) {
      const FIELD_Q: Record<string, string> = {
        customer_name: "ขอทราบชื่อลูกค้าด้วยได้ไหมครับ?",
        phone: "ขอเบอร์ติดต่อด้วยได้ไหมครับ?",
        address: "ขอที่อยู่หน้างานด้วยได้ไหมครับ?",
        area: "ขอทราบพื้นที่หน้างานด้วยได้ไหมครับ?",
        preferred_date: "สะดวกวันไหนครับ?",
        preferred_time: "สะดวกช่วงเวลาไหนครับ?",
        machine_count: "มีกี่เครื่องครับ?",
        symptoms: "มีอาการอะไรบ้างครับ? เช่น ไม่เย็น น้ำหยด หรือมีเสียงดัง"
      };
      console.log(`[CASE-MANAGER] booking_flow_recovery missing=${bookingMissing[0]} intent=${previousAiIntent}`);
      aiDecision.should_handoff = false;
      aiDecision.intent = previousAiIntent as IntentName;
      aiDecision.confidence = 0.85;
      aiDecision.customer_reply = FIELD_Q[bookingMissing[0]] ?? "ขอรายละเอียดเพิ่มเติมด้วยครับ?";
      aiDecision.missing_fields = bookingMissing as Array<keyof ExtractedCaseFields>;
    }
  }

  // Safety net: if bot has been vague ≥ 2 times recently, stop looping and escalate
  const recentVagueCount = recentMessages
    .filter(m => m.role === "assistant" && (m.metadata as Record<string, unknown>)?.intent === "general_inquiry")
    .length;
  if (recentVagueCount >= 2 && aiDecision.intent === "general_inquiry" && !aiDecision.should_handoff) {
    console.log(`[CASE-MANAGER] vague_escalation count=${recentVagueCount} -> forcing handoff`);
    aiDecision.should_handoff = true;
    aiDecision.customer_reply = "ขอโทษครับ ผมเข้าใจไม่แน่ชัด ขอส่งต่อให้เจ้าหน้าที่ช่วยดูแลต่อนะครับ 🙏";
  }

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
    display_name: params.customerName ?? undefined,
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
  const missingForBooking = getMissingBookingFields(mergedFields);
  const canSendBookingWebhook =
    bookingEligibleIntents.includes(aiDecision.intent) &&
    missingForBooking.length === 0 &&
    !bookingAlreadySent;
  console.log(`[CASE-MANAGER] booking_check intent=${aiDecision.intent} missing=${JSON.stringify(missingForBooking)} alreadySent=${bookingAlreadySent} can=${canSendBookingWebhook}`);

  if (canSendBookingWebhook) {
    try {
      await sendBookingWebhook({
        source: "paa-ai-brain",
        case_id: params.caseId,
        thread_id: params.threadId,
        customer_id: params.customerId,
        customer_name: mergedFields.customer_name!,
        phone: mergedFields.phone!,
        address: mergedFields.address || mergedFields.area || "",
        date: mergedFields.preferred_date!,
        time: mergedFields.preferred_time!,
        service_type: mergedFields.service_type as import("../types").ServiceType,
        machine_count: mergedFields.machine_count!,
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
