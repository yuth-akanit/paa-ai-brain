import { runJsonCompletion } from "@/lib/ai/client";
import { buildResponsePrompt } from "@/lib/ai/prompts";
import { BOOKING_REQUIRED_FIELDS, getMissingBookingFields } from "@/lib/booking/webhook";
import { aiDecisionSchema } from "@/lib/schemas";
import type { AiDecision, ExtractedCaseFields, IntentName, KnowledgeSearchResult } from "@/lib/types";
import { finalClean } from "@/lib/utils";
import { buildBusinessHoursPromptNote, getBusinessStatus } from "@/lib/utils/business-hours";

type GenerateAiResponseInput = {
  customerMessage: string;
  intent: IntentName;
  intentConfidence: number;
  threadSummary: string | null;
  knownFields: ExtractedCaseFields;
  knowledge: KnowledgeSearchResult[];
  priceFacts: Array<{ serviceCode: string; priceLabel: string; details: string }>;
  disableRemote?: boolean;
  imageBase64?: string | null;
};

const requiredFieldsByIntent: Partial<Record<IntentName, Array<keyof ExtractedCaseFields>>> = {
  cleaning_request: BOOKING_REQUIRED_FIELDS,
  repair_request: [...BOOKING_REQUIRED_FIELDS, "symptoms"],
  inspection_request: BOOKING_REQUIRED_FIELDS,
  relocation_request: BOOKING_REQUIRED_FIELDS,
  installation_request: BOOKING_REQUIRED_FIELDS,
  cold_room_request: ["address", "symptoms", "preferred_date", "preferred_time"],
  scheduling_request: BOOKING_REQUIRED_FIELDS
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

function questionMap(field: string) {
  const questions: Record<string, string> = {
    customer_name: "ขอทราบชื่อลูกค้าด้วยได้ไหมครับ?",
    phone: "ขอเบอร์ติดต่อด้วยได้ไหมครับ?",
    address: "ขอที่อยู่หน้างานด้วยได้ไหมครับ?",
    area: "ขอทราบพื้นที่หรือเขตหน้างานด้วยได้ไหมครับ?",
    machine_count: "มีกี่เครื่องครับ?",
    preferred_date: "สะดวกวันไหนครับ?",
    preferred_time: "สะดวกช่วงเวลาไหนครับ? เช่น ช่วงเช้า ช่วงบ่าย หรือช่วงเย็น",
    service_type: "ต้องการให้ช่วยงานประเภทไหนครับ? เช่น ล้างแอร์ / ซ่อม / ตรวจเช็ก / ย้ายแอร์",
    symptoms: "มีอาการอะไรบ้างครับ? เช่น ไม่เย็น น้ำหยด หรือมีเสียงดัง"
  };

  return questions[field] ?? "ขอรายละเอียดเพิ่มเติมอีกนิดได้ไหมครับ?";
}

function getMissingFields(input: GenerateAiResponseInput) {
  const requiredFields = requiredFieldsByIntent[input.intent] ?? [];
  const bookingMissingFields = getMissingBookingFields(input.knownFields);

  return requiredFields.filter((field) => {
    if (BOOKING_REQUIRED_FIELDS.includes(field)) {
      return bookingMissingFields.includes(field);
    }

    return !input.knownFields[field];
  });
}

function cleanKnowledgeAnswer(content?: string | null) {
  if (!content) {
    return null;
  }

  return finalClean(content.replace(/^คำถาม:[^\n]+\n\nคำตอบ:\s*/i, "").trim());
}

function buildFallbackResponse(input: GenerateAiResponseInput): AiDecision {
  const missingFields = input.intent === "cold_room_request" ? [] : getMissingFields(input);
  const shouldHandoff =
    !NO_HANDOFF_INTENTS.includes(input.intent) &&
    (input.intentConfidence < 0.45 || input.intent === "admin_handoff" || input.intent === "cold_room_request");

  let customerReply = "ขอรายละเอียดเพิ่มเติมอีกนิดได้ไหมครับ?";

  if (input.intent === "closing") {
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
    customerReply = "ขอทราบประเภทแอร์หรือขนาด BTU ก่อนนะครับ เดี๋ยวผมช่วยเช็กราคาให้ตรงรุ่นครับ";
  } else if (input.intent === "cold_room_request") {
    customerReply = "งานห้องเย็นต้องให้ทีมช่างช่วยประเมินก่อนนะครับ เดี๋ยวผมส่งต่อให้ทีมงานติดต่อกลับครับ";
  } else if (input.intent === "admin_handoff") {
    customerReply = "ได้เลยครับ เดี๋ยวผมส่งต่อให้เจ้าหน้าที่ติดต่อกลับครับ";
  } else if (input.intent === "scheduling_request" && isAskingAvailability(input.customerMessage)) {
    customerReply = `${getBusinessHoursReply()} ไม่ทราบว่าสะดวกวันไหนหรือช่วงเวลาไหนครับ?`;
  } else if (missingFields.length > 0) {
    customerReply = questionMap(missingFields[0]);
  } else if (["cleaning_request", "repair_request", "inspection_request", "relocation_request", "installation_request"].includes(input.intent)) {
    customerReply = "รับทราบข้อมูลเบื้องต้นแล้วครับ เดี๋ยวผมช่วยดำเนินการต่อให้ครับ";
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

function buildDeterministicPricingReply(input: GenerateAiResponseInput) {
  const machineType = input.knownFields.machine_type || parseMachineTypeFromText(input.customerMessage);
  if (!machineType || !isAskingPrice(input.customerMessage)) {
    return null;
  }

  const relevantFacts = input.priceFacts.filter((fact) => {
    const label = fact.priceLabel || "";
    if (machineType === "wall") return label.includes("ติดผนัง");
    if (machineType === "cassette") return label.includes("4 ทิศทาง") || label.toLowerCase().includes("cassette");
    if (machineType === "ceiling_floor") return label.includes("แขวน") || label.includes("ตั้งพื้น");
    if (machineType === "package") return label.includes("ตู้ตั้ง");
    if (machineType === "cold_room") return label.includes("ห้องเย็น");
    return false;
  });

  if (relevantFacts.length === 0) {
    return null;
  }

  const TYPE_LABELS: Record<string, string> = {
    wall: "แอร์ติดผนัง", cassette: "แอร์ 4 ทิศทาง",
    ceiling_floor: "แอร์แขวน/ตั้งพื้น", package: "แอร์ตู้ตั้ง", cold_room: "ห้องเย็น"
  };
  const typeLabel = TYPE_LABELS[machineType] ?? "แอร์";
  const priceLines = relevantFacts.map((fact) => `• ${fact.priceLabel}`).join("\n");
  const addons = input.priceFacts
    .filter((fact) => fact.serviceCode?.startsWith("addon_") && fact.priceLabel)
    .map((fact) => `• ${fact.priceLabel}`)
    .join("\n");

  const addonSection = addons ? `\n\nบริการเสริม:\n${addons}` : "";
  const bridge = input.knownFields.machine_count
    ? `มี ${input.knownFields.machine_count} เครื่อง สะดวกให้ทีมช่างเข้าจัดการได้เลยครับ จองคิวได้เลยไหมครับ?`
    : "สะดวกแจ้งขนาด BTU และจำนวนเครื่องได้เลยครับ เดี๋ยวผมช่วยประเมินให้แคบลงได้ครับ";
  const reply = `${typeLabel} ราคาล้างเริ่มต้น:\n${priceLines}${addonSection}\n\n*(ราคาอาจปรับตามสภาพหน้างานและขนาดเครื่อง)*\n\n${bridge}`;

  return {
    customer_reply: finalClean(reply),
    intent: input.intent,
    confidence: input.intentConfidence,
    should_handoff: false,
    missing_fields: [],
    extracted_fields: input.knownFields
  } satisfies AiDecision;
}

function enforceBusinessPolicy(reply: string, input: GenerateAiResponseInput) {
  const normalized = input.customerMessage.toLowerCase();
  const mentionsSunday = normalized.includes("วันอาทิตย์") || normalized.includes("อาทิตย์");
  const mentionsNight = normalized.includes("กลางคืน") || normalized.includes("ดึก");
  const mentionsAfterHours =
    normalized.includes("หลัง 6 โมง") ||
    normalized.includes("หลัง18") ||
    normalized.includes("หลัง 18") ||
    normalized.includes("19:") ||
    normalized.includes("20:");
  const isRepair = input.intent === "repair_request";

  const notes: string[] = [];

  if (mentionsSunday) {
    notes.push(getBusinessHoursReply());
  }

  if (mentionsAfterHours && !isRepair) {
    notes.push("หลัง 18:00 รับเฉพาะงานซ่อมนะครับ");
  }

  if (mentionsNight) {
    notes.push("งานกลางคืนสามารถเข้าได้ครับ แต่ค่าแรงคิด x2");
  }

  if (notes.length === 0) {
    return reply;
  }

  return finalClean(`${notes.join(" ")}\n\n${reply}`);
}

export async function generateAiResponse(input: GenerateAiResponseInput): Promise<AiDecision> {
  const deterministicPricingReply = buildDeterministicPricingReply(input);
  if (deterministicPricingReply) {
    deterministicPricingReply.customer_reply = enforceBusinessPolicy(deterministicPricingReply.customer_reply, input);
    return deterministicPricingReply;
  }

  if (
    input.intent === "greeting" ||
    input.intent === "closing" ||
    input.intent === "faq_contact" ||
    input.intent === "faq_service_area"
  ) {
    const fallback = buildFallbackResponse(input);
    fallback.customer_reply = enforceBusinessPolicy(fallback.customer_reply, input);
    return fallback;
  }

  try {
    const businessStatus = getBusinessStatus();
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
          businessHoursNote: buildBusinessHoursPromptNote(businessStatus),
          nextFieldToAsk
        },
        input.intent
      ),
      { disableRemote: input.disableRemote, imageBase64: input.imageBase64 }
    );

    if (raw) {
      const json = JSON.parse(raw);
      if (!Array.isArray(json.missing_fields)) {
        json.missing_fields = [];
      }

      const validMissingFields = new Set([
        "customer_name",
        "phone",
        "area",
        "address",
        "service_type",
        "machine_count",
        "symptoms",
        "preferred_date",
        "preferred_time",
        "urgency",
        "policy_scope",
        "photo_request"
      ]);

      json.missing_fields = json.missing_fields.filter(
        (field: unknown) => typeof field === "string" && validMissingFields.has(field)
      );

      const parsed = aiDecisionSchema.parse(json);
      parsed.missing_fields = parsed.missing_fields.filter(
        (field) => !input.knownFields[field as keyof ExtractedCaseFields]
      );
      parsed.customer_reply = enforceBusinessPolicy(finalClean(parsed.customer_reply), input);

      if (parsed.should_handoff && !parsed.customer_reply) {
        parsed.customer_reply = "ขอบคุณครับ เดี๋ยวทีมงานติดต่อกลับเพื่อดูรายละเอียดต่อให้นะครับ";
      }

      return parsed;
    }
  } catch (error) {
    console.warn("[GENERATE_AI_RESPONSE] Completion failed, falling back", error);
  }

  const fallback = buildFallbackResponse(input);
  fallback.customer_reply = enforceBusinessPolicy(fallback.customer_reply, input);
  return fallback;
}
