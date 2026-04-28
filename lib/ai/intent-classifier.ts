import { buildIntentPrompt } from "./prompts";
import { runJsonCompletion } from "./client";
import type { ExtractedCaseFields, IntentName } from "../types";
import { looksLikeThaiAddress } from "../cases/conversation-signals";

function isThaiAddressOnly(text: string): boolean {
  return looksLikeThaiAddress(text) && text.length < 200;
}

const heuristicMap: Array<{ intent: IntentName; keywords: string[] }> = [
  { intent: "closing", keywords: ["ขอบคุณ", "ขอบใจ", "thank you", "ขอบคุณมาก", "ลาก่อน"] },
  { intent: "low_signal_ack", keywords: ["ได้ครับ", "ได้ค่ะ", "โอเค", "ok", "โอเคครับ", "โอเคค่ะ", "รับทราบครับ", "รับทราบค่ะ", "yes", "sure"] },
  { intent: "admin_handoff", keywords: ["แอดมิน", "เจ้าหน้าที่", "คนจริง", "ติดต่อกลับ", "ขอคุยกับคน"] },
  { intent: "repair_request", keywords: ["ไม่เย็น", "เสีย", "ซ่อม", "น้ำหยด", "เสียงดัง", "ไม่ทำงาน"] },
  { intent: "inspection_request", keywords: ["ตรวจ", "เช็ค", "ประเมิน", "ดูหน้างาน"] },
  { intent: "cleaning_request", keywords: ["ล้าง", "ทำความสะอาด"] },
  { intent: "relocation_request", keywords: ["ย้ายแอร์", "ย้ายเครื่อง"] },
  { intent: "installation_request", keywords: ["ติดตั้งแอร์", "ติดตั้งเครื่อง", "ติดใหม่", "แอร์ใหม่"] },
  { intent: "product_availability_query", keywords: ["มีแอร์ขาย", "ขายแอร์", "ขายเครื่อง", "ซื้อแอร์", "สั่งซื้อ"] },
  { intent: "cold_room_request", keywords: ["ห้องเย็น", "cold room"] },
  { intent: "faq_pricing", keywords: ["ราคา", "กี่บาท", "ค่าล้าง", "ค่าบริการ", "เท่าไหร่", "เริ่มต้น"] },
  { intent: "faq_service_area", keywords: ["พื้นที่", "แถว", "รับงาน", "จังหวัด", "รับไหม"] },
  { intent: "greeting", keywords: ["สวัสดี", "หวัดดี", "hi", "hello", "เฮลโล"] },
  { intent: "scheduling_request", keywords: ["วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัส", "วันศุกร์", "วันเสาร์", "วันอาทิตย์", "วันไหน", "สะดวกวัน", "ว่างวัน", "คิวว่าง", "ว่างไหม", "มีคิว", "นัดหมาย", "จองคิว", "ขอนัด"] }
];

export function isInstallationIntent(text: string): boolean {
  const t = text.toLowerCase();
  const installationWords = ["ติดตั้งแอร์", "ติดตั้งเครื่อง", "ติดแอร์ใหม่", "ติดใหม่", "ซื้อแอร์", "แอร์ใหม่", "ต้องการติดตั้ง", "อยากติดตั้ง", "จะติดตั้ง", "ขอติดตั้ง"];
  if (installationWords.some(w => t.includes(w))) return true;
  // "ติดตั้ง" alone (without "ย้าย", "รื้อ") is likely installation
  if (t.includes("ติดตั้ง") && !t.includes("ย้าย") && !t.includes("รื้อ")) return true;
  return false;
}

export function isBookingIntent(text: string): boolean {
  const bookingWords = ["จะจอง", "อยากจอง", "ขอจอง", "จองคิว", "จองล้าง", "จองซ่อม", "จองตรวจ", "จองย้าย", "จองติดตั้ง", "ต้องการจอง", "ขอนัด", "อยากนัด"];
  return bookingWords.some(w => text.includes(w));
}

export function isServiceAreaQuestion(text: string): boolean {
  // Exclude relocation requests — they mention locations as destinations, not service coverage
  const isRelocation = text.includes("ย้าย") && text.includes("แอร์");
  if (isRelocation) return false;

  const asksCoverage =
    text.includes("รับ") ||
    text.includes("ไป") ||
    text.includes("ถึง") ||
    text.includes("ได้ไหม") ||
    text.includes("ไหม") ||
    text.includes("หรือเปล่า");

  const mentionsArea =
    text.includes("แถว") ||
    text.includes("พื้นที่") ||
    text.includes("โซน") ||
    text.includes("เขต") ||
    text.includes("จังหวัด") ||
    text.includes("อำเภอ") ||
    text.includes("ตำบล") ||
    text.includes("ย่าน");

  const referencesService =
    text.includes("ล้างแอร์") ||
    text.includes("ซ่อมแอร์") ||
    text.includes("ย้ายแอร์") ||
    text.includes("ตรวจแอร์") ||
    text.includes("รับงาน") ||
    text.includes("ให้บริการ") ||
    text.includes("แอร์");

  return asksCoverage && mentionsArea && referencesService;
}

export function isStandardCleaningPricing(text: string): boolean {
  const t = text.toLowerCase();

  const asksPrice =
    t.includes("เท่าไหร่") ||
    t.includes("กี่บาท") ||
    t.includes("ราคา") ||
    t.includes("ค่าล้าง") ||
    t.includes("เริ่มต้น");

  const cleaning =
    t.includes("ล้างแอร์") ||
    t.includes("แอร์สกปรก") ||
    t.includes("ล้างเครื่อง");

  const nonStandard =
    t.includes("ซ่อม") ||
    t.includes("ติดตั้ง") ||
    t.includes("ย้าย") ||
    t.includes("รื้อ") ||
    t.includes("เติมน้ำยา") ||
    t.includes("ห้องเย็น") ||
    t.includes("โรงงาน");

  return asksPrice && cleaning && !nonStandard;
}

// Returns true when the message is purely a phone number (Thai mobile/fixed-line).
// Prevents the LLM from classifying "0812345678" as faq_contact when the customer
// is actually providing their number mid-booking.
function isPhoneNumberOnly(text: string): boolean {
  const stripped = text.trim().replace(/[-\s()]/g, "");
  return /^0[0-9]{8,9}$/.test(stripped);
}

// Infer the most likely ongoing intent from what fields have already been collected.
function inferOngoingIntent(knownFields: ExtractedCaseFields): IntentName | null {
  const svc = knownFields.service_type;
  if (svc === "repair") return "repair_request";
  if (svc === "cleaning") return "cleaning_request";
  if (svc === "inspection") return "inspection_request";
  if (svc === "relocation") return "relocation_request";
  if (svc === "cold_room") return "cold_room_request";
  if (knownFields.symptoms) return "repair_request";
  if (knownFields.preferred_date || knownFields.preferred_time) return "scheduling_request";
  if (knownFields.customer_name || knownFields.phone || knownFields.area || knownFields.address) return "cleaning_request";
  return null;
}

export async function classifyIntent(
  message: string,
  imageBase64?: string | null,
  options?: { disableRemote?: boolean },
  knownFields?: ExtractedCaseFields
): Promise<{ intent: IntentName; confidence: number }> {
  const lowerMessage = message.toLowerCase();

  // If the message is just a phone number or address, treat it as data provision.
  const isAddr = isThaiAddressOnly(message);
  if (!imageBase64 && (isPhoneNumberOnly(lowerMessage) || isAddr)) {
    const ongoing = knownFields ? inferOngoingIntent(knownFields) : null;
    console.log(`[INTENT] Address/Phone detected (isAddr=${isAddr}). Ongoing: ${ongoing}`);
    return { intent: ongoing ?? "general_inquiry", confidence: 0.85 };
  }

  // Purely short affirmative messages (strip common Thai polite endings)
  const affirmText = lowerMessage.replace(/(ครับ|ค่ะ||นะ|ครับผม|คะ)$/g, "").trim();
  if (["ได้", "โอเค", "ok", "yes", "ตกลง", "รับทราบ"].includes(affirmText)) {
    return { intent: "low_signal_ack", confidence: 0.94 };
  }

  // RELOCATION intent PRIORITY — must be checked early to avoid pricing collisions
  const hasRelocationKeyword = /(ย้ายแอร์|ย้ายเครื่อง|ถอดย้าย|ย้ายจาก|ย้ายลง|ย้ายขึ้น)/.test(lowerMessage);
  const hasPriceWord = /(ราคา|เท่าไหร่|กี่บาท|คิดยังไง)/.test(lowerMessage);
  if (hasRelocationKeyword) {
    if (hasPriceWord) return { intent: "relocation_pricing_query", confidence: 0.96 };
    return { intent: "relocation_request", confidence: 0.96 };
  }

  // AVAILABILITY intent PRIORITY — distinct from general scheduling
  const hasAvailabilityWord = /(มีคิวว่างไหม|ว่างไหม|มีคิวไหม|คิวว่าง|นัดได้ไหม)/.test(lowerMessage);
  if (hasAvailabilityWord) {
    return { intent: "availability_query", confidence: 0.95 };
  }

  // SALES PRODUCT AVAILABILITY PRIORITY
  const isProductAvailability = /มีแอร์ขายไหม|ที่ร้านมีแอร์ขายไหม|ขายแอร์ไหม|แอร์ขายไหม|มีขายไหม/.test(lowerMessage);
  if (isProductAvailability && !lowerMessage.includes("รับสมัคร") && !lowerMessage.includes("ล้าง")) {
     return { intent: "product_availability_query", confidence: 0.98 };
  }

  // SALES intent PRIORITY — recognize buying/selling/parts/ordering
  const hasSalesKeyword = /(ขาย|ซื้อ|มีแอร์|อะไหล่|สั่ง)/.test(lowerMessage);
  if (hasSalesKeyword && !lowerMessage.includes("รับสมัคร") && !lowerMessage.includes("ล้าง")) {
     return { intent: "sales_inquiry", confidence: 0.95 };
  }

  // REPAIR intent PRIORITY — must win over pricing/cleaning if repair symptoms are mentioned
  const hasRepairKeyword = /(ซ่อม|เสีย|ไม่เย็น|หยด|รั่ว|เสียงดัง|สั่น|มอเตอร์ดัง|ดังผิดปกติ|พัง)/.test(lowerMessage);
  const isCleaningMenu = lowerMessage.includes("ราคาล้าง") || lowerMessage.includes("ล้างแอร์ราคา");
  if (hasRepairKeyword && !isCleaningMenu) {
     return { intent: "repair_request", confidence: 0.96 };
  }

  // M3A.1: Availability pivot detection — prioritize over generic booking intents
  const isAvailabilityQuery = /วันไหน|ว่างวัน|คิวว่าง|ว่างไหม|มีคิว/.test(lowerMessage);
  if (!imageBase64 && isAvailabilityQuery && !knownFields?.preferred_date) {
    return { intent: "scheduling_request", confidence: 0.94 };
  }

  // Installation intent — must be checked before pricing so "ติดตั้งแอร์ราคาเท่าไหร่"
  // is routed correctly instead of landing as a low-confidence faq_pricing
  if (!imageBase64 && isInstallationIntent(lowerMessage)) {
    return { intent: "installation_request", confidence: 0.94 };
  }

  // COMMERCIAL/DUCT PRICING intent — "แอร์ดัก คิดเท่าไหร่"
  const isDuctAir = /แอร์ดัก|แอร์ต่อท่อ|duct|แอร์แขวน|แอร์ฝังฝ้า|แอร์ 4 ทิศทาง|พาณิชย์|โรงงาน|ห้าง|งานกลางคืน|สำนักงาน/.test(lowerMessage);
  if (isDuctAir && hasPriceWord) {
    return { intent: "commercial_pricing_query", confidence: 0.96 };
  }

  // Booking intent MUST be checked before pricing — "จะจองล้างแอร์" contains cleaning
  // keywords but is NOT a pricing question
  if (!imageBase64 && isBookingIntent(lowerMessage)) {
    if (lowerMessage.includes("ซ่อม") || lowerMessage.includes("หยด") || lowerMessage.includes("ไม่เย็น")) return { intent: "repair_request", confidence: 0.93 };
    if (lowerMessage.includes("ตรวจ")) return { intent: "inspection_request", confidence: 0.93 };
    if (lowerMessage.includes("ย้าย")) return { intent: "relocation_request", confidence: 0.93 };
    if (lowerMessage.includes("ติดตั้ง")) return { intent: "installation_request", confidence: 0.93 };
    return { intent: "cleaning_request", confidence: 0.93 };
  }

  // High-confidence heuristic for pricing
  if (!imageBase64 && isStandardCleaningPricing(lowerMessage)) {
    return {
      intent: "faq_pricing",
      confidence: 0.95
    };
  }

  // High-confidence heuristic for service-area questions such as
  // "รับล้างแอร์แถวมาบตาพุดไหม" which should NOT fall into cleaning_request.
  if (!imageBase64 && isServiceAreaQuestion(lowerMessage)) {
    return {
      intent: "faq_service_area",
      confidence: 0.94
    };
  }

  const hasComplexCommercialKeywords = ["chiller", "ahu", "pm contract", "maintenance contract"].some((keyword) => lowerMessage.includes(keyword));
  if (hasComplexCommercialKeywords) {
    return {
      intent: "general_inquiry",
      confidence: 0.38
    };
  }

  try {
    const raw = await runJsonCompletion(buildIntentPrompt(message), { ...options, imageBase64 });

    if (raw) {
      const parsed = JSON.parse(raw) as { intent?: IntentName; confidence?: number };

      if (parsed.intent) {
        // Guard: If LLM says faq_pricing but it contains non-standard keywords, we lower it or redirect.
        // Handled here by prioritizing the isStandardCleaningPricing check above or post-filtering
        let intentResult = parsed.intent;
        let confidenceResult = Math.max(0, Math.min(1, parsed.confidence ?? 0.7));

        // Refine: if it's pricing but has non-standard keywords, redirect to the correct intent
        const isNonStandardPrice = intentResult === "faq_pricing" && ["ซ่อม", "ติดตั้ง", "ย้าย", "รื้อ", "เติมน้ำยา", "ห้องเย็น", "โรงงาน"].some(k => lowerMessage.includes(k));

        if (isNonStandardPrice) {
          if (lowerMessage.includes("ติดตั้ง")) {
            intentResult = "installation_request";
            confidenceResult = 0.90;
          } else if (lowerMessage.includes("ย้าย")) {
            intentResult = "relocation_request";
            confidenceResult = 0.88;
          } else if (lowerMessage.includes("ซ่อม")) {
            intentResult = "repair_request";
            confidenceResult = 0.88;
          } else {
            confidenceResult = 0.4;
          }
        }

        if (intentResult === "cleaning_request" && isServiceAreaQuestion(lowerMessage)) {
          intentResult = "faq_service_area";
          confidenceResult = Math.max(confidenceResult, 0.9);
        }

        return {
          intent: intentResult,
          confidence: confidenceResult
        };
      }
    }
  } catch {
    // Fall through to heuristics.
  }

  const match = heuristicMap.find((item) => item.keywords.some((keyword) => lowerMessage.includes(keyword)));

  if (!match) {
    return {
      intent: "general_inquiry",
      confidence: 0.38
    };
  }

  // Final check for non-standard pricing in heuristic match — redirect to correct intent
  if (match.intent === "faq_pricing") {
    if (lowerMessage.includes("ติดตั้ง")) return { intent: "installation_request", confidence: 0.88 };
    if (lowerMessage.includes("ย้าย")) return { intent: "relocation_request", confidence: 0.88 };
    if (lowerMessage.includes("ซ่อม")) return { intent: "repair_request", confidence: 0.88 };
    const otherNonStandard = ["รื้อ", "เติมน้ำยา", "ห้องเย็น", "โรงงาน"].some(k => lowerMessage.includes(k));
    if (otherNonStandard) {
      if (imageBase64) {
        return { intent: "general_inquiry", confidence: 0.5 };
      }
      return { intent: "general_inquiry", confidence: 0.3 };
    }
  }

  return {
    intent: match.intent,
    confidence: 0.90
  };
}
