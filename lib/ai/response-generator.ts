import { runJsonCompletion } from "@/lib/ai/client";
import { buildResponsePrompt } from "@/lib/ai/prompts";
import { BOOKING_REQUIRED_FIELDS, getMissingBookingFields } from "@/lib/booking/webhook";
import { aiDecisionSchema } from "@/lib/schemas";
import type { AiDecision, ExtractedCaseFields, IntentName, KnowledgeSearchResult } from "@/lib/types";
import { finalClean } from "@/lib/utils";

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

// Intents that should never trigger handoff — the bot can answer directly
const NO_HANDOFF_INTENTS: IntentName[] = ["faq_pricing", "faq_service_area", "faq_contact", "greeting", "closing"];

function buildFallbackResponse(input: GenerateAiResponseInput): AiDecision {
  const requiredFields = requiredFieldsByIntent[input.intent] ?? [];
  const bookingMissingFields = getMissingBookingFields(input.knownFields);
  const rawMissingFields = requiredFields.filter((field) => {
    if (BOOKING_REQUIRED_FIELDS.includes(field)) {
      return bookingMissingFields.includes(field);
    }

    return !input.knownFields[field];
  });
  const shouldHandoff =
    !NO_HANDOFF_INTENTS.includes(input.intent) &&
    (input.intentConfidence < 0.45 || input.intent === "admin_handoff" || input.intent === "cold_room_request");
  const missingFields = input.intent === "cold_room_request" ? [] : rawMissingFields;
  const firstQuestion = missingFields[0];

  const questionMap: Record<string, string> = {
    area: "ขอทราบพื้นที่หรือเขตหน้างานก่อนนะครับ เพื่อเช็กการให้บริการให้ตรงพื้นที่",
    machine_count: "มีแอร์ทั้งหมดกี่เครื่องที่ต้องการให้เข้าบริการครับ",
    customer_name: "ขอทราบชื่อลูกค้าสำหรับลงคิวจองด้วยครับ",
    preferred_date: "สะดวกให้ช่างเข้าดูงานช่วงวันไหนหรือช่วงเวลาใดครับ",
    preferred_time: "สะดวกช่วงเวลาไหนครับ เช่น ช่วงเช้า บ่าย หรือเวลาประมาณกี่โมง",
    phone: "รบกวนขอเบอร์ติดต่อกลับสำหรับยืนยันคิวด้วยครับ",
    address: "รบกวนขอที่อยู่หรือพิกัดหน้างานสำหรับลงคิวด้วยครับ",
    service_type: "ต้องการให้ช่วยงานประเภทไหนครับ เช่น ล้างแอร์ ซ่อมแอร์ ตรวจเช็ก หรือย้ายแอร์",
    symptoms: "ช่วยอธิบายอาการเพิ่มเติมอีกนิดได้ไหมครับ เช่น ไม่เย็น น้ำหยด หรือมีเสียงดัง"
  };

  let customerReply = "สวัสดีครับ มีอะไรให้ผมช่วยดูแลไหมครับ";

  if (input.intent === "closing") {
    customerReply = "";
  } else if (input.intent === "greeting") {
    customerReply = "สวัสดีครับ ผม AI ผู้ช่วยจาก PAA ยินดีให้บริการครับ สนใจล้างแอร์ ซ่อมแอร์ หรือติดตั้งห้องเย็น สอบถามราคาหรือรายละเอียดได้เลยนะครับ";
  } else if (input.intent === "faq_contact") {
    const contactDoc = input.knowledge.find((k) =>
      k.tags?.some((t) => ["contact", "ช่องทางติดต่อ", "ติดต่อ", "faq", "line"].includes(t.toLowerCase().trim()))
    );
    customerReply = contactDoc?.content
      ? contactDoc.content.replace(/^คำถาม:[^\n]+\n\nคำตอบ:\s*/i, "").trim()
      : "ท่านสามารถโทรจองคิวได้ที่เบอร์ 084-282-4465 หรือติดต่อผ่านลิงก์ LINE นี้ได้เลยครับ https://line.me/R/ti/p/@paairservice";
  } else if (input.intent === "faq_pricing") {
    customerReply = "ราคาล้างแอร์จะเริ่มต้นไม่เท่ากันตามประเภทแอร์ครับ ไม่ทราบว่าเป็นแอร์ประเภทไหนครับ? (เช่น ติดผนัง, 4 ทิศทาง หรือแขวน)";
  } else if (input.intent === "cold_room_request") {
    customerReply = "งานห้องเย็นเป็นงานเฉพาะทางที่ต้องให้ช่างเทคนิคประเมินละเอียดก่อนนะครับ เดี๋ยวผมส่งต่อข้อมูลให้เจ้าหน้าที่ติดต่อกลับเพื่อขอรายละเอียดเพิ่มเติมและนัดหมายให้นะครับ";
  } else if (input.intent === "scheduling_request") {
    // Detect if customer is asking WHEN PAA is available (vs giving their own preferred date)
    const msg = input.customerMessage.toLowerCase();
    const isAskingAvailability =
      (msg.includes("วันไหน") || msg.includes("ว่างวัน") || msg.includes("ว่างไหม") || msg.includes("คิวว่าง") || msg.includes("มีคิว")) &&
      !msg.includes("สะดวก") === false; // "สะดวกวันไหน" → asking about PAA
    const isAskingWhenPaaFree =
      msg.includes("วันไหน") || msg.includes("ว่างวัน") || msg.includes("ว่างไหม") ||
      msg.includes("มีคิวไหม") || msg.includes("คิวว่าง");

    if (isAskingWhenPaaFree) {
      customerReply = "ให้บริการทุกวันเลยครับ ไม่มีวันหยุดประจำ ไม่ทราบว่าคุณลูกค้าสะดวกช่วงวันไหนหรือวันที่เท่าไหร่ครับ?";
    } else {
      customerReply = firstQuestion
        ? questionMap[firstQuestion] ?? "รบกวนขอข้อมูลสำหรับลงคิวจองเพิ่มเติมอีกนิดนะครับ"
        : "รับข้อมูลจองครบแล้วครับ เดี๋ยวผมส่งต่อเข้าระบบเช็กคิวและให้ทีมงานติดต่อกลับยืนยันอีกครั้งนะครับ";
    }
  } else if (shouldHandoff) {
    customerReply = "ขออภัยครับ ข้อมูลส่วนนี้ผมยังไม่แน่ใจ เดี๋ยวให้เจ้าหน้าที่ตัวจริงช่วยตรวจสอบและติดต่อกลับโดยด่วนเพื่อความถูกต้องนะครับ";
  } else if (input.intent === "faq_service_area") {
    const knowledge = input.knowledge[0]?.content ?? "ทางเรารับงานตามพื้นที่ที่ระบุไว้ในระบบครับ";
    customerReply = `${knowledge} หากแจ้งเขตหรือจังหวัดได้ ผมจะช่วยเช็กให้อีกครั้งครับ`;
  } else if (input.intent === "installation_request") {
    customerReply = firstQuestion
      ? questionMap[firstQuestion] ?? "รบกวนขอข้อมูลสำหรับลงคิวติดตั้งเพิ่มเติมอีกนิดนะครับ"
      : "รับข้อมูลติดตั้งครบแล้วครับ เดี๋ยวผมส่งต่อให้ทีมงานติดต่อกลับยืนยันอีกครั้งนะครับ";
  } else if (firstQuestion) {
    customerReply = questionMap[firstQuestion] ?? "ขอข้อมูลเพิ่มเติมอีกเล็กน้อยเพื่อส่งต่อทีมงานได้ครบถ้วนนะครับ";
  } else if (["cleaning_request", "repair_request", "inspection_request", "relocation_request"].includes(input.intent)) {
    customerReply = "รับข้อมูลเบื้องต้นครบแล้วครับ เดี๋ยวผมส่งต่อเข้าระบบเพื่อให้ทีมงานเช็กคิวและติดต่อกลับยืนยันอีกครั้งนะครับ";
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

// Parse machine type from raw message text — avoids stale knownFields contamination
function parseMachineTypeFromText(text: string): ExtractedCaseFields["machine_type"] | null {
  const t = text.toLowerCase();
  if (t.includes("ติดผนัง") || t.includes("wall")) return "wall";
  if (t.includes("4 ทิศทาง") || t.includes("cassette") || t.includes("คาสเซ็ท")) return "cassette";
  if (t.includes("แขวน") || t.includes("ตั้งพื้น")) return "ceiling_floor";
  if (t.includes("ตู้ตั้ง") || t.includes("package")) return "package";
  return null;
}

// Detect if the message is explicitly asking about price/cost
function isAskingPrice(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("ราคา") || t.includes("เท่าไหร่") || t.includes("กี่บาท") ||
    t.includes("ค่าติดตั้ง") || t.includes("เริ่มต้น") || t.includes("ค่าบริการ") || t.includes("เท่าไร");
}

export async function generateAiResponse(input: GenerateAiResponseInput): Promise<AiDecision> {
  const machineType = input.knownFields.machine_type;

  const filteredPriceFacts = machineType
    ? input.priceFacts.filter(p => {
        if (!p.priceLabel) return false;
        if (machineType === "cassette") return p.priceLabel.includes("4 ทิศทาง") || p.priceLabel.includes("Cassette");
        if (machineType === "ceiling_floor") return p.priceLabel.includes("แขวน") || p.priceLabel.includes("ตั้งพื้น");
        if (machineType === "package") return p.priceLabel.includes("ตู้ตั้ง");
        if (machineType === "wall") return p.priceLabel.includes("ติดผนัง");
        return true;
      })
    : input.priceFacts;
  const resolvedPriceFacts = filteredPriceFacts.length > 0 ? filteredPriceFacts : input.priceFacts;

  // Greeting: deterministic response — no LLM call, no risk of price leakage
  if (input.intent === "greeting") {
    return {
      customer_reply: "สวัสดีครับ ยินดีให้บริการ PAA Air Service ครับ มีอะไรให้ผมช่วยไหมครับ? (ล้างแอร์ / ซ่อม / ย้ายแอร์ / สอบถามราคา)",
      intent: "greeting",
      confidence: 1.0,
      should_handoff: false,
      missing_fields: [],
      extracted_fields: input.knownFields
    };
  }

  // Closing: empty reply — no LLM call needed
  if (input.intent === "closing") {
    return {
      customer_reply: "",
      intent: "closing",
      confidence: 1.0,
      should_handoff: false,
      missing_fields: [],
      extracted_fields: input.knownFields
    };
  }

  // FAQ Contact: deterministic response
  if (input.intent === "faq_contact") {
    const contactDoc = input.knowledge.find((k) =>
      k.tags?.some((t) => ["contact", "ช่องทางติดต่อ", "ติดต่อ", "faq", "line"].includes(t.toLowerCase().trim()))
    );
    const contactText = contactDoc?.content
      ? contactDoc.content.replace(/^คำถาม:[^\n]+\n\nคำตอบ:\s*/i, "").trim()
      : `สำนักงานใหญ่ของร้าน PAA Air Service / P&A AIR SERVICE
หจก.พีเอเอ แอร์ เซอร์วิส
ที่ตั้งสำนักงานใหญ่: 14/255 หมู่ 8 ตำบลบางโฉลง อำเภอบางพลี จ.สมุทรปราการ 10540
โทรติดต่อ: 084-282-4465 หรือ 02-102-0513 
Line ID: @paairservice (คลิกได้เลย: https://line.me/R/ti/p/@paairservice )
Email: admin@paaair.com`;
    return {
      customer_reply: contactText,
      intent: "faq_contact",
      confidence: input.intentConfidence,
      should_handoff: false,
      missing_fields: [],
      extracted_fields: input.knownFields
    };
  }

  // FAQ Service Area: deterministic response
  if (input.intent === "faq_service_area") {
    const areaDoc = input.knowledge.find((k) => k.category === "faq" && k.title.includes("พื้นที่"));
    const fallbackText = "PAA Air Service ให้บริการหลักครอบคลุมจังหวัดสมุทรปราการทั้งหมด และกรุงเทพมหานครฝั่งตะวันออก (เช่น บางนา, ลาดกระบัง, ประเวศ, สวนหลวง)";
    const knowledgeText = areaDoc?.content ? areaDoc.content.replace(/^คำถาม:[^\n]+\n\nคำตอบ:\s*/i, "").trim() : fallbackText;
    const officeLocationText = "\n\n(สำหรับหน้าร้าน/สำนักงานใหญ่ ตั้งอยู่ที่: 14/255 หมู่ 8 ต.บางโฉลง อ.บางพลี จ.สมุทรปราการ 10540)";
    
    return {
      customer_reply: `${knowledgeText} หากสะดวกแจ้งเขตหรือจังหวัดหน้างานได้ ผมจะช่วยประเมินให้ว่าสามารถจัดคิวช่างได้หรือไม่ครับ ${officeLocationText}`,
      intent: "faq_service_area",
      confidence: input.intentConfidence,
      should_handoff: false,
      missing_fields: [],
      extracted_fields: input.knownFields
    };
  }

  // Deterministic installation pricing: only fires when customer is ASKING price in current message.
  // Uses machine type parsed from current message only — never stale knownFields — to avoid
  // showing wrong type prices from a previous conversation turn.
  if (input.intent === "installation_request" && isAskingPrice(input.customerMessage)) {
    const installFacts = input.priceFacts.filter(p => p.serviceCode === "installation" && p.priceLabel);
    if (installFacts.length > 0) {
      const msgMachineType = parseMachineTypeFromText(input.customerMessage);
      const filteredInstall = msgMachineType
        ? installFacts.filter(p => {
            if (msgMachineType === "wall") return p.priceLabel.includes("ติดผนัง");
            if (msgMachineType === "cassette") return p.priceLabel.includes("4 ทิศทาง") || p.priceLabel.includes("Cassette");
            if (msgMachineType === "ceiling_floor") return p.priceLabel.includes("แขวน") || p.priceLabel.includes("ตั้งพื้น");
            if (msgMachineType === "package") return p.priceLabel.includes("ตู้ตั้ง");
            return true;
          })
        : installFacts;
      const usedFacts = filteredInstall.length > 0 ? filteredInstall : installFacts;
      const priceLines = usedFacts.map(p => `- ${p.priceLabel}`).join("\n");
      const disclaimer = "\n\n*ราคาเป็นราคาเริ่มต้น อาจมีการปรับตามสภาพหน้างาน ระยะท่อ และอุปกรณ์เพิ่มเติม";
      // Adaptive follow-up: if type already known → ask for count; if not → ask for type first
      const followUp = msgMachineType
        ? "\n\nสนใจติดตั้งกี่เครื่องครับ? แจ้งได้เลย เดี๋ยวผมช่วยลงคิวให้ครับ"
        : "\n\nสนใจแอร์ประเภทไหนครับ? (ติดผนัง / 4 ทิศทาง / แขวน / ตู้ตั้ง) เดี๋ยวผมแจ้งราคาเฉพาะประเภทนั้นให้เลยครับ";
      return {
        customer_reply: finalClean(`ค่าติดตั้งแอร์ PAA มีดังนี้ครับ:\n${priceLines}${disclaimer}${followUp}`),
        intent: input.intent,
        confidence: input.intentConfidence,
        should_handoff: false,
        missing_fields: [],
        extracted_fields: input.knownFields
      };
    }
  }
  // If installation_request but NOT asking price (booking follow-up turns) → fall through to LLM

  // Deterministic pricing: when AC type is known, bypass LLM entirely
  if (input.intent === "faq_pricing" && machineType && filteredPriceFacts.length > 0) {
    let priceLines: string;
    if (filteredPriceFacts.length === 1) {
      priceLines = filteredPriceFacts[0].priceLabel;
    } else {
      priceLines = filteredPriceFacts.map(p => p.priceLabel).join("\n");
    }

    // Append addon services (น้ำยาฆ่าเชื้อ, Inverter surcharge, etc.)
    const addonFacts = input.priceFacts.filter(
      p => p.serviceCode?.startsWith("addon_") && p.priceLabel
    );
    const addonSection = addonFacts.length > 0
      ? "\n\n📌 บริการเสริม:\n" + addonFacts.map(p => `- ${p.priceLabel}`).join("\n")
      : "";

    const disclaimer = "\n\n*ราคาเป็นราคาเริ่มต้น อาจมีการปรับตามสภาพหน้างาน ขนาดเครื่อง และรุ่น";
    const suffix = "หากสะดวก แจ้งขนาด BTU หรือจำนวนเครื่องได้ เดี๋ยวผมช่วยประเมินให้ละเอียดขึ้นครับ";
    const deterministicReply = finalClean(priceLines + addonSection + disclaimer + "\n\n" + suffix);
    return {
      customer_reply: deterministicReply,
      intent: input.intent,
      confidence: input.intentConfidence,
      should_handoff: false,
      missing_fields: [],
      extracted_fields: input.knownFields
    };
  }

  try {
    const raw = await runJsonCompletion(
      buildResponsePrompt(
        {
          customerMessage: input.customerMessage,
          threadSummary: input.threadSummary,
          knownFields: input.knownFields,
          knowledge: input.knowledge,
          priceFacts: resolvedPriceFacts
        },
        input.intent
      ),
      { disableRemote: input.disableRemote, imageBase64: input.imageBase64 }
    );

    if (raw) {
      const json = JSON.parse(raw);
      // Sanitize missing_fields — Claude sometimes returns field names not in schema
      // (e.g. "ac_type", "machine_type") which causes Zod to reject the entire response
      const VALID_MISSING_FIELDS = new Set([
        "customer_name", "phone", "area", "address", "service_type", "machine_count",
        "machine_type", "symptoms", "preferred_date", "preferred_time", "urgency",
        "policy_scope", "photo_request"
      ]);
      if (!Array.isArray(json.missing_fields)) json.missing_fields = [];
      json.missing_fields = json.missing_fields.filter(
        (f: unknown) => typeof f === "string" && VALID_MISSING_FIELDS.has(f)
      );
      const parsed = aiDecisionSchema.parse(json);

      // Strip missing_fields that are already present in knownFields — prevents re-asking
      parsed.missing_fields = parsed.missing_fields.filter(
        f => !input.knownFields[f as keyof ExtractedCaseFields]
      );

      parsed.customer_reply = finalClean(parsed.customer_reply);

      // Guard: handoff with empty reply leaves customer in silence — inject holding message
      if (parsed.should_handoff && !parsed.customer_reply) {
        parsed.customer_reply = "ขอบคุณครับ ทีมงานจะติดต่อกลับเพื่อนัดหมายช่างเข้าตรวจสอบโดยเร็วที่สุดครับ";
      }

      return parsed;
    }
  } catch (error) {
    console.warn("[GENERATE_AI_RESPONSE] Completion failed, falling back", error);
  }

  const fallback = buildFallbackResponse(input);
  return fallback;
}
