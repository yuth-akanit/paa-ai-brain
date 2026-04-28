import { runJsonCompletion } from "@/lib/ai/client";
import { buildResponsePrompt } from "@/lib/ai/prompts";
import { BOOKING_REQUIRED_FIELDS, getMissingBookingFields } from "@/lib/booking/webhook";
import { aiDecisionSchema } from "@/lib/schemas";
import type { AiDecision, ExtractedCaseFields, IntentName, KnowledgeSearchResult, AvailabilityPolicyBlockReason } from "@/lib/types";
import { finalClean } from "@/lib/utils";
import { buildBusinessHoursPromptNote, getBusinessStatus } from "@/lib/utils/business-hours";

export type GenerateAiResponseInput = {
  customerMessage: string;
  intent: IntentName;
  intentConfidence: number;
  threadSummary: string | null;
  knownFields: ExtractedCaseFields;
  knowledge: KnowledgeSearchResult[];
  priceFacts: Array<{ serviceCode: string; priceLabel: string; details: string }>;
  disableRemote?: boolean;
  imageBase64?: string | null;
  availabilityFlowState?: "none" | "availability_conflict" | "awaiting_alternative_slot" | "proposed_alternative_slot" | "slot_reconfirmation";
  policyBlockReason?: AvailabilityPolicyBlockReason | null;
  proposedSlot?: { date: string; time: string } | null;
  pendingProposal?: boolean;
};

const requiredFieldsByIntent: Partial<Record<IntentName, Array<keyof ExtractedCaseFields>>> = {
  cleaning_request: BOOKING_REQUIRED_FIELDS,
  repair_request: [...BOOKING_REQUIRED_FIELDS, "symptoms"],
  inspection_request: BOOKING_REQUIRED_FIELDS,
  relocation_request: BOOKING_REQUIRED_FIELDS,
  installation_request: BOOKING_REQUIRED_FIELDS,
  cold_room_request: ["address", "symptoms", "preferred_date", "preferred_time"],
  scheduling_request: ["customer_name", "phone", "preferred_date", "preferred_time"],
  low_signal_ack: BOOKING_REQUIRED_FIELDS
};

const NO_HANDOFF_INTENTS: IntentName[] = [
  "faq_pricing",
  "faq_service_area",
  "faq_contact",
  "greeting",
  "closing"
];

function getBusinessHoursReply() {
  return "วันอาทิตย์ทางเราหยุดทำการครับ เปิดบริการวันจันทร์-เสาร์ เวลา 09:00-18:00 น. ถ้าต้องการจองคิวล่วงหน้าสามารถแจ้งไว้ได้เลยครับ";
}

function parseMachineTypeFromText(text: string): ExtractedCaseFields["machine_type"] | null {
  const normalized = text.toLowerCase();
  if (normalized.includes("ติดผนัง") || normalized.includes("wall")) return "wall";
  if (normalized.includes("4 ทิศทาง") || normalized.includes("cassette")) return "cassette";
  if (normalized.includes("แขวน") || normalized.includes("ตั้งพื้น") || normalized.includes("ceiling")) return "ceiling_floor";
  if (normalized.includes("ตู้ตั้ง") || normalized.includes("package")) return "package";
  if (normalized.includes("ห้องเย็น") || normalized.includes("cold room")) return "cold_room";
  return null;
}

function isAskingPrice(text: string) {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("ราคา") ||
    normalized.includes("เท่าไหร่") ||
    normalized.includes("กี่บาท") ||
    normalized.includes("ค่าบริการ") ||
    normalized.includes("เริ่มต้น")
  );
}

function isAskingAvailability(text: string) {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("วันไหน") ||
    normalized.includes("ว่างวัน") ||
    normalized.includes("คิวว่าง") ||
    normalized.includes("ว่างไหม") ||
    normalized.includes("มีคิว")
  );
}

export function questionMap(field: string) {
  const questions: Record<string, string> = {
    customer_name: "ขอทราบชื่อลูกค้าด้วยได้ไหมครับ?",
    phone: "ขอเบอร์ติดต่อด้วยได้ไหมครับ?",
    address: "ขอที่อยู่หน้างานด้วยได้ไหมครับ?",
    area: "ขอทราบพื้นที่หรือเขตหน้างานด้วยได้ไหมครับ?",
    machine_count: "มีกี่เครื่องครับ?",
    preferred_date: "สะดวกวันไหนครับ?",
    preferred_time: "สะดวกช่วงเวลาไหนครับ? เช่น ช่วงเช้า ช่วงบ่าย หรือช่วงเย็น",
    service_type: "ต้องการให้ช่วยงานประเภทไหนครับ? เช่น ล้างแอร์ / ซ่อม / ตรวจเช็ก / ย้ายแอร์",
    symptoms: "มีอาการอะไรบ้างครับ? เช่น ไม่เย็น น้ำหยด หรือมีเสียงดัง",
    machine_type: "เป็นแอร์ประเภทไหนครับ? (ติดผนัง/แขวน/4ทิศทาง)"
  };

  const defaultQ = "ขอรายละเอียดเพิ่มเติมอีกนิดได้ไหมครับ? เช่น ประเภทแอร์ (ติดผนัง/แขวน) หรือขนาด BTU ครับ";
  return questions[field] ?? defaultQ;
}

function shouldDeferContactCollection(input: GenerateAiResponseInput): boolean {
  const msg = input.customerMessage.toLowerCase();
  const isStrongPivot = 
    isAskingPrice(msg) || 
    isAskingAvailability(msg) || 
    input.intent === "repair_request" || 
    input.intent === "installation_request" ||
    msg.includes("ไม่เย็น") || msg.includes("น้ำหยด") || msg.includes("เสีย");
    
  return isStrongPivot;
}

export function getMissingFields(input: GenerateAiResponseInput) {
  const requiredFields = requiredFieldsByIntent[input.intent] ?? [];
  const bookingMissingFields = getMissingBookingFields(input.knownFields);

  let missing = requiredFields.filter((field) => {
    if (BOOKING_REQUIRED_FIELDS.includes(field)) {
      return bookingMissingFields.includes(field);
    }
    return !input.knownFields[field as keyof ExtractedCaseFields];
  });

  // Repair Request UX: Symptoms must be the very first question
  if (input.intent === "repair_request" && missing.includes("symptoms")) {
    missing = ["symptoms", ...missing.filter(f => f !== "symptoms")];
  }

  // UX Improvement: Defer contact collection if the current message is a strong pivot query
  if (shouldDeferContactCollection(input)) {
    missing = missing.filter(f => f !== "customer_name" && f !== "phone");
  }

  return missing;
}

function cleanKnowledgeAnswer(content?: string | null) {
  if (!content) return null;
  return finalClean(content.replace(/^คำถาม:[^\n]+\n\nคำตอบ:\s*/i, "").trim());
}

export function buildFallbackResponse(input: GenerateAiResponseInput): AiDecision {
  const missingFields = input.intent === "cold_room_request" ? [] : getMissingFields(input);
  const shouldHandoff =
    !NO_HANDOFF_INTENTS.includes(input.intent) &&
    (input.intentConfidence < 0.45 || input.intent === "admin_handoff" || input.intent === "cold_room_request");

  let customerReply = "ขอรายละเอียดเพิ่มเติมอีกนิดได้ไหมครับ?";

  if (input.policyBlockReason === "sunday_closed") {
    const slot = input.proposedSlot ? `เป็น${input.proposedSlot.date} ${input.proposedSlot.time}` : "วันอื่น";
    customerReply = `ขออภัยครับ วันอาทิตย์ทางเราหยุดทำการครับ รับ${slot} แทนได้ไหมครับ? 😊`;
  } else if (input.policyBlockReason === "too_soon_same_day") {
    const slot = input.proposedSlot ? `เป็น${input.proposedSlot.date} ${input.proposedSlot.time}` : "วันอื่น";
    customerReply = `ขออภัยครับ ไม่สามารถนัดหมายในวันเดียวกันได้ครับ รับ${slot} แทนได้ไหมครับ?`;
  } else if (input.intent === "closing") {
    customerReply = "";
  } else if (input.intent === "greeting") {
    customerReply = "สวัสดีครับ ยินดีให้บริการ PAA Air Service ครับ มีอะไรให้ผมช่วยไหมครับ? (ล้างแอร์ / ซ่อม / ย้ายแอร์ / สอบถามราคา)";
  } else if (input.intent === "faq_contact") {
    const contactDoc = input.knowledge.find((item) => item.tags?.some((tag) => ["contact", "line", "faq"].includes(tag.toLowerCase().trim())));
    customerReply = cleanKnowledgeAnswer(contactDoc?.content) || "ติดต่อเราได้ที่ 084-282-4465 หรือ LINE @paairservice ครับ";
  } else if (input.intent === "faq_service_area") {
    const areaDoc = input.knowledge.find((item) => item.category === "faq" && item.title.includes("พื้นที่"));
    customerReply = cleanKnowledgeAnswer(areaDoc?.content) || "แจ้งเขตหรือจังหวัดหน้างานได้เลยครับ เดี๋ยวผมช่วยเช็กพื้นที่ให้บริการให้ครับ";
  } else if (input.intent === "faq_pricing") {
    // Try to resolve machine type + BTU from current message or known fields
    const msgType = parseMachineTypeFromText(input.customerMessage);
    const machineType = input.knownFields.machine_type || msgType;
    const btuRaw = input.knownFields.btu ||
      input.customerMessage.match(/\b(9000|12000|13000|18000|24000|30000|36000)\b/)?.[1];

    if (machineType || btuRaw) {
      const TYPE_THAI: Record<string, string> = {
        wall: "แอร์ติดผนัง", cassette: "แอร์คาสเซ็ท 4 ทิศทาง",
        ceiling_floor: "แอร์แขวน/ตั้งพื้น", package: "แอร์แพ็กเกจ"
      };
      const typeLabel = machineType ? (TYPE_THAI[machineType] || machineType) : "แอร์";
      const btuStr = String(btuRaw || "").replace(/,/g, "");
      const fact = input.priceFacts.find(f => {
        const label = f.priceLabel.toLowerCase();
        const details = f.details.toLowerCase().replace(/,/g, "");
        let typeMatch = !machineType;
        if (machineType === "wall" && label.includes("ติดผนัง")) typeMatch = true;
        if (machineType === "cassette" && (label.includes("4 ทิศทาง") || label.includes("cassette"))) typeMatch = true;
        if (machineType === "ceiling_floor" && (label.includes("แขวน") || label.includes("ตั้งพื้น"))) typeMatch = true;
        if (!typeMatch) return false;
        if (!btuStr) return true;
        return details.includes(btuStr) || label.includes(btuStr);
      });
      if (fact) {
        const priceMatch = (fact.priceLabel + " " + fact.details).replace(/,/g, "").match(/(\d+)\s*(?:บาท|\.-)/);
        const priceText = priceMatch ? `${priceMatch[1]} บาท/เครื่อง` : fact.priceLabel;
        const btuLabel = btuRaw ? ` ${btuRaw} BTU` : "";
        customerReply = `รับทราบครับ ${typeLabel}${btuLabel} ราคาล้างเริ่มต้น ${priceText} ครับ\n\nต้องการจองคิวเลยไหมครับ? 😊`;
      } else {
        customerReply = `รับทราบครับ ${typeLabel}${btuRaw ? ` ${btuRaw} BTU` : ""} ทีมช่างจะเช็กราคาและแจ้งกลับให้ครับ ต้องการจองคิวได้เลยครับ 😊`;
      }
    } else {
      customerReply = "ขอทราบประเภทแอร์หรือขนาด BTU ก่อนนะครับ เดี๋ยวผมช่วยเช็กราคาให้ตรงรุ่นครับ";
    }
  } else if (input.intent === "admin_handoff" || input.intent === "cold_room_request") {
    customerReply = "ได้เลยครับ เดี๋ยวผมส่งต่อให้เจ้าหน้าที่ติดต่อกลับนะครับ";
  } else if (input.availabilityFlowState === "availability_conflict") {
    customerReply = "เข้าใจครับว่าวันดังกล่าวยังไม่สะดวก ไม่ทราบว่าคุณลูกค้าสะดวกเป็นวันไหนช่วงไหนแทนดีครับ? เดี๋ยวผมลองเช็กคิวอื่นให้ครับ 😊";
  } else if (input.availabilityFlowState === "proposed_alternative_slot") {
      const slot = input.proposedSlot ? `เป็น${input.proposedSlot.date} ${input.proposedSlot.time}` : "เวลาอื่น";
      customerReply = `ขออภัยครับ ช่วงเวลาที่คุณลูกค้าเลือกเต็มแล้วครับ รับ${slot} แทนได้ไหมครับ?`;
  } else if (input.availabilityFlowState === "slot_reconfirmation") {
    const date = input.knownFields.preferred_date || "";
    const time = input.knownFields.preferred_time || "";
    
    // Choose acknowledgment based on what was JUST captured
    let ack = "รับทราบครับ!";
    if (isAskingPrice(input.customerMessage)) {
      ack = "ล้างแอร์ติดผนังเริ่มต้น 500 บาทครับ";
    } else if (input.knownFields.address && input.customerMessage.length > 20) {
      ack = "รับทราบที่อยู่ครับ ขอบคุณครับ";
    } else if (input.knownFields.machine_count) {
      ack = "รับทราบครับ แอร์ " + input.knownFields.machine_count + " เครื่องนะครับ";
    }

    if (missingFields.length > 0) {
      customerReply = `${ack} ${questionMap(missingFields[0])}`;
    } else {
      customerReply = `${ack} ผมส่งข้อมูลนัดหมาย${date} ${time} ให้แอดมินเพื่อตรวจสอบคิวและคอนเฟิร์มกลับให้นะครับ 😊`;
    }
  } else if (input.intent === "repair_request" && !input.knownFields.symptoms) {
    customerReply = "แอร์เสียอาการเป็นยังไงบ้างครับ? เช่น ไม่เย็นเลย น้ำหยด หรือเปิดไม่ติดครับ เดี๋ยวทีมช่างช่วยประเมินให้ครับ";
  } else if (input.intent === "installation_request") {
    customerReply = "รับทราบเรื่องติดตั้งแอร์ใหม่ครับ รบกวนแจ้งขนาด BTU หรือประเภทเครื่อง (ติดผนัง/4ทิศทาง) และจำนวนเครื่องได้เลยครับ เดี๋ยวผมแจ้งราคาประเมินให้ครับ";
  } else if (input.intent === "scheduling_request" && isAskingAvailability(input.customerMessage)) {
    customerReply = getBusinessHoursReply();
  } else if (input.intent === "low_signal_ack") {
    if (missingFields.length > 0) {
      customerReply = `รับทราบครับ ${questionMap(missingFields[0])}`;
    } else {
      customerReply = "รับทราบครับ ข้อมูลครบถ้วนแล้วครับ เดี๋ยวผมดำเนินการต่อให้นะครับ 😊";
    }
  } else if (isAskingAvailability(input.customerMessage) && (input.knownFields.preferred_date || input.knownFields.preferred_time)) {
    const date = input.knownFields.preferred_date || "วันเดิม";
    const time = input.knownFields.preferred_time || "เวลาเดิม";
    customerReply = `นัดหมายของคุณลูกค้าคือ${date} ${time} ครับ 😊`;
  } else if (isAskingAvailability(input.customerMessage)) {
    customerReply = `${getBusinessHoursReply()} ไม่ทราบว่าสะดวกวันไหนหรือช่วงเวลาไหนครับ? เดี๋ยวผมลองเช็กคิวให้ครับ 😊`;
  } else if (isAskingPrice(input.customerMessage)) {
    customerReply = "ล้างแอร์ติดผนังเริ่มต้น 500 บาทครับ ขอทราบขนาด BTU เพิ่มเติมเพื่อสรุปราคาที่แน่นอนให้ครับ 😊";
  } else if (missingFields.length > 0) {
    customerReply = questionMap(missingFields[0]);
  }

  return {
    customer_reply: finalClean(customerReply),
    intent: input.intent,
    confidence: input.intentConfidence,
    should_handoff: shouldHandoff,
    missing_fields: missingFields,
    extracted_fields: input.knownFields
  };
}

export function buildDeterministicPricingReply(input: GenerateAiResponseInput) {
  const isCleaningIntent = input.intent === "cleaning_request" || input.intent === "faq_pricing";
  const buckets = input.knownFields.pricing_buckets;

  if (buckets && buckets.length > 0 && isCleaningIntent) {
    let summaryParts: string[] = [];
    let totalPrice = 0;
    let hasUnknowns = false;

    const TYPE_THAI: Record<string, string> = {
      wall: "ติดผนัง",
      cassette: "4 ทิศทาง (Cassette)",
      ceiling_floor: "แขวน/ตั้งพื้น",
      package: "ตู้ตั้ง",
      unknown: "ยังไม่ทราบประเภท"
    };

    for (const bucket of buckets) {
      const typeLabel = TYPE_THAI[bucket.machine_type] || bucket.machine_type;
      if (bucket.machine_type === "unknown") {
        summaryParts.push(`${bucket.quantity} เครื่อง (${typeLabel})`);
        hasUnknowns = true;
        continue;
      }

      const fact = input.priceFacts.find(f => {
        const label = f.priceLabel.toLowerCase();
        const details = f.details.toLowerCase().replace(/,/g, "");
        const btuStr = String(bucket.btu || "").replace(/,/g, "");
        let typeMatch = false;
        if (bucket.machine_type === "wall" && label.includes("ติดผนัง")) typeMatch = true;
        if (bucket.machine_type === "cassette" && (label.includes("4 ทิศทาง") || label.includes("cassette"))) typeMatch = true;
        if (bucket.machine_type === "ceiling_floor" && (label.includes("แขวน") || label.includes("ตั้งพื้น"))) typeMatch = true;
        if (!typeMatch) return false;
        if (!bucket.btu) return true;
        return details.includes(btuStr) || label.includes(btuStr);
      });

      if (fact) {
        const priceMatch = (fact.priceLabel + " " + fact.details).replace(/,/g, "").match(/(\d+)\s*(?:บาท|\.-)/);
        if (priceMatch) {
          const unitPrice = parseInt(priceMatch[1]);
          totalPrice += unitPrice * bucket.quantity;
          const btuSuffix = bucket.btu ? ` ${bucket.btu} BTU` : "";
          summaryParts.push(`${typeLabel}${btuSuffix} ${bucket.quantity} เครื่อง (${unitPrice}.- บาท/เครื่อง)`);
        } else {
          summaryParts.push(`${typeLabel} ${bucket.quantity} เครื่อง (ประเมินตามหน้างาน)`);
          hasUnknowns = true;
        }
      } else {
        summaryParts.push(`${typeLabel} ${bucket.quantity} เครื่อง (รอยืนยันราคา)`);
        hasUnknowns = true;
      }
    }

    if (summaryParts.length > 0) {
      let reply = `รับทราบครับ ราคาล้างแอร์เริ่มต้นของคุณลูกค้า สรุปรายการดังนี้ครับ:\n- ${summaryParts.join("\n- ")}`;
      if (totalPrice > 0 && !hasUnknowns) {
        reply += `\n\nยอดรวมประมาณการ: ${totalPrice}.- บาท ครับ\nสะดวกจองคิวรับบริการได้เลยไหมครับ? 😊`;
      } else {
        reply += `\n\nรบกวนขอข้อมูลประเภทแอร์หรือ BTU ของเครื่องที่เหลือเพื่อสรุปราคาที่แน่นอนให้ครับ`;
      }
      return {
        customer_reply: finalClean(reply),
        intent: input.intent,
        confidence: 0.98,
        should_handoff: false,
        missing_fields: [],
        extracted_fields: input.knownFields
      };
    }
  }
  return null;
}

export function enforceBusinessPolicy(reply: string, input: GenerateAiResponseInput) {
  const normalized = input.customerMessage.toLowerCase();
  const mentionsSunday = normalized.includes("วันอาทิตย์") || normalized.includes("อาทิตย์");
  const mentionsNight = normalized.includes("กลางคืน") || normalized.includes("ดึก");
  if (mentionsSunday) return finalClean(`${getBusinessHoursReply()}\n\n${reply}`);
  return reply;
}

export async function generateAiResponse(input: GenerateAiResponseInput): Promise<AiDecision> {
  const deterministicPricingReply = buildDeterministicPricingReply(input);
  if (deterministicPricingReply) {
    deterministicPricingReply.customer_reply = enforceBusinessPolicy(deterministicPricingReply.customer_reply, input);
    return deterministicPricingReply;
  }

  if (NO_HANDOFF_INTENTS.includes(input.intent) || input.intent === "low_signal_ack" || input.policyBlockReason) {
    const fallback = buildFallbackResponse(input);
    fallback.customer_reply = enforceBusinessPolicy(fallback.customer_reply, input);
    return fallback;
  }

  try {
    const businessStatus = getBusinessStatus();
    const isAvailabilityQuery = input.intent === "scheduling_request" || /ว่างวัน|คิวว่าง|นัดวัน|กี่โมง|เปิดกี่โมง|หยุดวันไหน/.test(input.customerMessage);
    
    const missingFieldsList = getMissingFields(input);
    const nextFieldToAsk = (missingFieldsList[0] as string | undefined) ?? null;
    const raw = await runJsonCompletion(
      buildResponsePrompt(
        {
          customerMessage: input.customerMessage,
          threadSummary: input.threadSummary,
          knownFields: input.knownFields,
          knowledge: input.knowledge,
          priceFacts: input.priceFacts,
          businessHoursNote: isAvailabilityQuery ? buildBusinessHoursPromptNote(businessStatus) : "",
          nextFieldToAsk
        },
        input.intent
      ),
      { disableRemote: input.disableRemote, imageBase64: input.imageBase64 }
    );

    if (raw) {
      const json = JSON.parse(raw);
      const parsed = aiDecisionSchema.parse(json);
      parsed.missing_fields = (parsed.missing_fields || []).filter(
        (field: any) => !input.knownFields[field as keyof ExtractedCaseFields]
      );
      
      // Safety: If AI returns empty reply for a non-closing intent, use fallback
      if (!parsed.customer_reply && input.intent !== "closing") {
        console.warn(`[GENERATE_AI_RESPONSE] AI returned empty reply for intent: ${input.intent}. Using fallback.`);
        const fallback = buildFallbackResponse(input);
        parsed.customer_reply = fallback.customer_reply;
      }

      parsed.customer_reply = enforceBusinessPolicy(finalClean(parsed.customer_reply), input);
      return parsed;
    }
  } catch (error) {
    console.warn("[GENERATE_AI_RESPONSE] Completion failed, falling back", error);
  }

  const fallback = buildFallbackResponse(input);
  fallback.customer_reply = enforceBusinessPolicy(fallback.customer_reply, input);
  return fallback;
}
