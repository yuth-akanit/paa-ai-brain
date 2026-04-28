import { ExtractedCaseFields, IntentName, ServiceType } from "../types";

export function normalizeDigits(text: string) {
  return text.replace(/\D/g, "");
}

export function normalizeInlineText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function splitMeaningfulLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripDecorativePrefix(text: string) {
  return text.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

export function hasExplicitNameLabel(text: string): boolean {
  return splitMeaningfulLines(text).some((line) => {
    const clean = stripDecorativePrefix(line);
    return /^(?:ชื่อ|ชื่อลูกค้า|ผู้ติดต่อ)\s*[:：]?/i.test(clean) || /^ชื่[อื]/.test(clean);
  });
}

export function hasNamePhoneCombo(text: string): boolean {
  const normalized = normalizeInlineText(text.replace(/^[\s.,;:!?'"`-]+/, ""));
  return /^(?:คุณ\s*)?[ก-๙A-Za-z]{2,20}\s*(0\d[\d\-\s]{8,12})$/.test(normalized);
}

export function hasExplicitAddressLabel(text: string): boolean {
  return splitMeaningfulLines(text).some((line) => {
    const clean = stripDecorativePrefix(line);
    return /^(?:ที่อยู่|โลเคชัน|สถานที่|พิกัด|หน้างาน)\s*[:：]?/i.test(clean);
  });
}

export function looksLikeScheduleLabelText(text: string): boolean {
  return splitMeaningfulLines(text).some((line) => {
    const clean = stripDecorativePrefix(line);
    return /^(?:วันนัด|วันที่|เวลานัด|เวลา)\s*[:：]/i.test(clean) || /^วัน\s*[:：]/i.test(clean) || /[🗓⏰]/u.test(line);
  });
}

export function parseLabeledFields(text: string): Partial<ExtractedCaseFields> {
  const out: Partial<ExtractedCaseFields> = {};

  for (const rawLine of splitMeaningfulLines(text)) {
    const clean = stripDecorativePrefix(rawLine);
    if (!clean) continue;

    const nameMatch = clean.match(/^(?:ชื่อ|ชื่อลูกค้า|ผู้ติดต่อ)\s*[:：]?\s*(?:คุณ\s*)?(.+)$/i);
    if (nameMatch?.[1]) {
      out.customer_name = nameMatch[1].trim();
      continue;
    }

    const phoneMatch = clean.match(/^(?:เบอร์|เบอร์โทร|เบอร์โทรศัพท์|โทร|โทรศัพท์)\s*[:：]?\s*([0-9\-\s]{9,15})$/i);
    if (phoneMatch?.[1]) {
      out.phone = phoneMatch[1].replace(/\D/g, "");
      continue;
    }

    const addressMatch = clean.match(/^(?:ที่อยู่|โลเคชัน|สถานที่|พิกัด|หน้างาน)\s*[:：]?\s*(.+)$/i);
    if (addressMatch?.[1]) {
      out.address = normalizeInlineText(addressMatch[1]);
      continue;
    }

    const areaMatch = clean.match(/^(?:พื้นที่|โซน|แถว)\s*[:：]?\s*(.+)$/i);
    if (areaMatch?.[1]) {
      out.area = normalizeInlineText(areaMatch[1]);
      continue;
    }

    const dateMatch = clean.match(/^(?:วันนัด|วันที่)\s*[:：]\s*(.+)$/i) ?? clean.match(/^วัน\s*[:：]\s*(.+)$/i);
    if (dateMatch?.[1]) {
      out.preferred_date = normalizeInlineText(dateMatch[1]);
      continue;
    }

    const timeMatch = clean.match(/^(?:เวลา|เวลานัด)\s*[:：]\s*(.+)$/i);
    if (timeMatch?.[1]) {
      out.preferred_time = normalizeInlineText(timeMatch[1]);
      continue;
    }
  }

  return out;
}

const KNOWN_THAI_AREAS = [
  "บางพลี",
  "บางนา",
  "เทพารักษ์",
  "สำโรง",
  "แพรกษา",
  "บางบ่อ",
  "บางเสาธง",
  "กิ่งแก้ว",
  "บางโฉลง",
  "สมุทรปราการ"
];

export function detectKnownArea(text: string): string | null {
  const normalized = normalizeInlineText(text);
  if (!normalized) return null;
  return KNOWN_THAI_AREAS.find((area) => normalized.includes(area)) ?? null;
}

export function isFrontDoorParkingText(text: string): boolean {
  const compact = text.replace(/\s+/g, "").trim().toLowerCase();
  if (!compact) return false;
  return /(จอด)?(รถ)?หน้า(บ้าน|ร้าน|ตึก|อาคาร|คอนโด|โครงการ)|จอดตรงหน้า|จอดได้หน้า|หน้าบ้านได้|หน้าร้านได้|หน้าตึกได้/.test(compact);
}

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

const CASE_SERVICE_LABELS: Record<string, string> = {
  cleaning: "ล้างแอร์", repair: "ซ่อมแอร์",
  inspection: "ตรวจเช็คแอร์", relocation: "ย้ายแอร์",
  installation: "ติดตั้งแอร์", cold_room: "ห้องเย็น"
};

export function buildConversationStateSummary(
  recentMessages: Array<{ role: string; message_text: string }>,
  knownFields: ExtractedCaseFields
): string {
  const known: string[] = [];
  if (knownFields.customer_name) known.push(`ชื่อ="${knownFields.customer_name}"`);
  if (knownFields.phone) known.push(`เบอร์=${knownFields.phone}`);
  const loc = knownFields.address || knownFields.area;
  if (loc) known.push(`สถานที่="${loc.slice(0, 60)}"`);
  if (knownFields.machine_count) known.push(`${knownFields.machine_count} เครื่อง`);
  if (knownFields.machine_type) known.push(`ประเภท=${knownFields.machine_type}`);
  if (knownFields.preferred_date) known.push(`วัน=${knownFields.preferred_date}`);
  if (knownFields.preferred_time) known.push(`เวลา=${knownFields.preferred_time}`);

  const serviceLabel = knownFields.service_type
    ? (CASE_SERVICE_LABELS[knownFields.service_type] ?? knownFields.service_type)
    : null;

  // Only customer turns — omit assistant turns to prevent style contamination
  const recentCustomer = recentMessages
    .filter(m => m.role === "customer")
    .slice(-2)
    .map(m => `"${m.message_text.slice(0, 80)}"`)
    .join(" → ");

  const parts: string[] = [];
  if (serviceLabel) parts.push(`งาน: ${serviceLabel}`);
  if (known.length > 0) parts.push(`ทราบ: ${known.join(", ")}`);
  if (recentCustomer) parts.push(`ล่าสุด: ${recentCustomer}`);
  return parts.join(" | ") || "เริ่มต้น";
}

export function looksLikeStructuredFollowUp(messageText: string, extractedFields: ExtractedCaseFields) {
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

export function looksLikePricingQualifier(messageText: string, extractedFields: ExtractedCaseFields) {
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

export function determineLeadStatus(missingFields: string[], shouldHandoff: boolean) {
  if (shouldHandoff) return "handed_off" as const;
  if (missingFields.length === 0) return "qualified" as const;
  return "collecting_info" as const;
}

const ACTIVE_SERVICE_INTENTS = new Set<IntentName>([
  "cleaning_request", "repair_request", "inspection_request",
  "relocation_request", "installation_request", "scheduling_request", "faq_pricing"
]);

export function resolveIntentWithCaseContext(args: {
  existingIntent: IntentName | null;
  existingServiceType: ServiceType | null;
  missingFields: string[];
  classifiedIntent: IntentName;
  messageText: string;
  extractedFields: ExtractedCaseFields;
}) {
  const previousIntent = args.existingIntent;
  const previousServiceType = args.existingServiceType;
  
  const weakFollowUpIntent =
    args.classifiedIntent === "faq_pricing" ||
    args.classifiedIntent === "faq_service_area" ||
    args.classifiedIntent === "faq_contact" ||
    args.classifiedIntent === "general_inquiry" ||
    args.classifiedIntent === "greeting" ||
    args.classifiedIntent === "closing" ||
    args.classifiedIntent === "scheduling_request";

  const fillsMissingStructuredField = args.missingFields.some((field: string) => {
    if (!STRUCTURED_FOLLOWUP_FIELDS.includes(field as keyof ExtractedCaseFields)) return false;
    const value = args.extractedFields[field as keyof ExtractedCaseFields];
    return typeof value === "string" ? value.trim().length > 0 : typeof value === "number";
  });

  const pricingQualifier = looksLikePricingQualifier(args.messageText, args.extractedFields);
  
  const contextualServiceIntent =
    previousServiceType === "cleaning" ? "cleaning_request" :
    previousServiceType === "repair" ? "repair_request" :
    previousServiceType === "inspection" ? "inspection_request" :
    previousServiceType === "relocation" ? "relocation_request" :
    previousIntent;

  if (previousIntent === "faq_pricing" && pricingQualifier && !["admin_handoff", "closing", "greeting"].includes(args.classifiedIntent)) {
    return "faq_pricing";
  }

  if (
    contextualServiceIntent &&
    ACTIVE_SERVICE_INTENTS.has(contextualServiceIntent as IntentName) &&
    weakFollowUpIntent &&
    (fillsMissingStructuredField || pricingQualifier) &&
    (looksLikeStructuredFollowUp(args.messageText, args.extractedFields) || pricingQualifier)
  ) {
    return contextualServiceIntent as IntentName;
  }

  if (args.classifiedIntent === "low_signal_ack" && previousIntent && previousIntent !== "closing") {
    return previousIntent;
  }

  if (
    args.classifiedIntent === "scheduling_request" && 
    contextualServiceIntent && 
    ACTIVE_SERVICE_INTENTS.has(contextualServiceIntent as IntentName)
  ) {
    return contextualServiceIntent as IntentName;
  }

  return args.classifiedIntent;
}

export function isExpressingConflict(text: string): boolean {
    const normalized = text.toLowerCase();
    return normalized.includes("ไม่ว่าง") || normalized.includes("ไม่ได้") || normalized.includes("ไม่สะดวก");
}

export function isAskingAlternative(text: string): boolean {
    const normalized = text.toLowerCase();
    return normalized.includes("วันอื่น") || normalized.includes("เมื่อไหร่") || normalized.includes("ตอนไหนดี");
}

export function looksLikeThaiAddress(text: string): boolean {
  // Sanitize leading dots or noise often seen in LINE messages
  const t = text.replace(/^[.\s]+/, "").trim();
  if (t.length < 10) return false;

  const hasAddressKeywords =
    /(หมู่|ม\.|ซอย|ถนน|ถ\.|แขวง|เขต|ตำบล|ต\.|อำเภอ|อ\.|จังหวัด|จ\.|รหัสไปรษณีย์|กม\.|มบ\.|หมู่บ้าน)/.test(t);

  const hasPostalCode = /\b\d{5}\b/.test(t);
  const houseNoPattern = /\d+\s*\/\s*\d+|\d+-\d+|\b\d+\b/; 
  const hasHouseNo = houseNoPattern.test(t);

  // Address signals: Keywords + Postal Code OR Keywords + House No
  // Or just a very clear house number pattern with residential keywords
  const hasStrongAddressPattern = houseNoPattern.test(t) && /(มบ\.|หมู่บ้าน|ซอย|ถนน|กม\.)/.test(t);
  
  return (hasAddressKeywords && hasPostalCode) || (hasAddressKeywords && hasHouseNo && t.length > 20) || hasStrongAddressPattern;
}

export function looksLikeCompactThaiAddress(text: string): boolean {
  const t = normalizeInlineText(text.replace(/^[.\s]+/, ""));
  if (t.length < 8) return false;

  const hasHouseNo = /\d+\s*\/\s*\d+|\b\d+-\d+\b/.test(t);
  const hasKnownArea = Boolean(detectKnownArea(t));
  const hasProvince = /(กรุงเทพ|สมุทรปราการ|นนทบุรี|ปทุมธานี|ชลบุรี)/.test(t);

  return hasHouseNo && (hasKnownArea || hasProvince);
}

export function looksLikeFullAddress(text: string): boolean {
  const t = text.trim();
  const houseNoPattern = /\d+\s*\/\s*\d+|\b\d+-\d+\b|\b\d+\b/;
  const hasHouseNo = houseNoPattern.test(t);
  const hasSubdistrict = /(ตำบล|ต\.|แขวง)/.test(t);
  const hasDistrict = /(อำเภอ|อ\.|เขต)/.test(t);
  const hasProvince = /(จังหวัด|จ\.)/.test(t);
  const hasPostalCode = /\b\d{5}\b/.test(t);
  const hasMoo = /(หมู่ที่|หมู่|ม\.)/.test(t);

  const count = [hasHouseNo, hasSubdistrict, hasDistrict, hasProvince, hasPostalCode, hasMoo].filter(Boolean).length;
  return count >= 4; // House No + 3 other specific parts = very high signal
}

export function normalizeThaiAddress(text: string): string {
  return text.replace(/^[.\s]+/, "").trim();
}

export function isCommercialDuctQuery(text: string): boolean {
    const t = text.toLowerCase();
    // Use regex to be more robust with Thai tone marks and combinations
    const commercialRe = /(แอร์ท่อดักต์|ท่อดักต์|duct|ดักต์|แอร์ตู้ตั้ง|แอร์ท่อ|แอร์แขวน|แอร์เปลือย|แอร์สี่ทิศทาง|เซ็นทรัลแอร์|commercial ac|vrv|vrf)/i;
    return commercialRe.test(t);
}

export function isExplicitFaqPivot(text: string): boolean {
    const t = text.toLowerCase();
    const faqRe = /(เบอร์ติดต่อ|โทร|ติดต่อร้าน|ช่องทางการติดต่อ|line id|เบอร์โทร|ร้านอยู่ที่ไหน|ที่อยู่ร้าน|พิกัดร้าน|แมพ|แผนที่|เปิดกี่โมง|เปิดวันไหน|เปิดให้บริการ|เปิดบริการวัน|เวลาทำการ|วันทำการ|วันไหนว่าง|พื้นที่บริการ|เขตไหนบ้าง|paa air service.*ร้านอะไร|ร้านอะไร|ทำเกี่ยวกับอะไร|ให้บริการอะไรบ้าง|มีบริการอะไรบ้าง|ราคา|เท่าไหร่|ค่าบริการ|สอบถามราคา|ราคาเท่า|คิดเท่าไหร่|ค่าซ่อม|ค่าถอด|ค่าอะไหล่|ค่าตรวจ|ค่าล้าง|ค่าติดตั้ง|ค่าย้าย|อุปกรณ์ส่วนเกิน)/i;
    return faqRe.test(t);
}

/**
 * M3C.1 Guard: Detect if cleaning keywords are actually repair context
 * (e.g. "just cleaned last month but still not cold")
 */
export function isRepairContextCleaningHistory(text: string, activeFlow?: string, currentIntent?: string): boolean {
    const isRepairContext = activeFlow === "repair" || currentIntent === "repair_request";
    if (!isRepairContext) return false;
    
    const t = text.toLowerCase();
    // Keywords indicating history rather than new intent
    const historyRe = /(เพิ่งล้าง|พึ่งล้าง|ล้างล่าสุด|หลังล้าง|ล้างไปเมื่อ|ล้างแล้วยัง|เพิ่งจะล้าง|พึ่งจะล้าง)/i;
    return historyRe.test(t);
}
