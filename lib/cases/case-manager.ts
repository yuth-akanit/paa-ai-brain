import { classifyIntent } from "../ai/intent-classifier";
import { generateAiResponse } from "../ai/response-generator";
import { extractStructuredFields } from "../ai/structured-extractor";
import { runJsonCompletion } from "../ai/client";
import { buildVisionPrompt } from "../ai/prompts";
import { getMissingBookingFields, sendBookingWebhook, BOOKING_REQUIRED_FIELDS } from "../booking/webhook";
import {
  createConversationMessage,
  getServiceCaseById,
  getThreadMessages,
  hasAuditLogAction,
  listPricingFacts,
  messageExistsByProviderId,
  updateCaseState,
  updateThreadState
} from "../db/queries";
import { searchKnowledge, loadCanonicalKnowledgeForTurn, resolveCanonicalTopic, getCanonicalKnowledgeByTopic } from "../knowledge/search";
import { hasExactPreferredTime, hasExplicitAbsoluteThaiDate, hasNormalizedPreferredDate, normalizeScheduleFields } from "./schedule-normalizer";
import {
  determineLeadStatus,
  detectKnownArea,
  hasExplicitAddressLabel,
  hasExplicitNameLabel,
  hasNamePhoneCombo,
  isFrontDoorParkingText,
  looksLikeCompactThaiAddress,
  looksLikeScheduleLabelText,
  looksLikeThaiAddress,
  looksLikeFullAddress,
  normalizeInlineText,
  normalizeThaiAddress,
  parseLabeledFields,
  isCommercialDuctQuery,
  isExplicitFaqPivot,
  isRepairContextCleaningHistory,
  resolveIntentWithCaseContext,
  buildConversationStateSummary,
  splitMeaningfulLines
} from "./conversation-signals";
import { aiDecisionSchema } from "../schemas";
import type { 
  ExtractedCaseFields, 
  IntentName, 
  ServiceType,
  FinalTurnDecision,
  ConversationMetadata,
  AvailabilityPolicyBlockReason
} from "../types";
import { finalClean } from "../utils";

// --- BUSINESS CONFIG (Single Source of Truth) ---
const BUSINESS_PROFILE = {
  phone: "084-282-4465",
  lineId: "@paairservice",
  address: "จังหวัดสมุทรปราการ (รองรับพื้นที่กรุงเทพฯ และปริมณฑล)",
  openHours: "วันจันทร์ - เสาร์ 09:00 - 18:00 น. (หยุดวันอาทิตย์)",
  serviceArea: "ครอบคลุมพื้นที่กรุงเทพฯ, สมุทรปราการ และนนทบุรีครับ"
};

function getFaqResponse(topic: string): string | null {
  switch (topic) {
    case "contact_info":
      return `ติดต่อเราได้ที่เบอร์ ${BUSINESS_PROFILE.phone} หรือ LINE ID: ${BUSINESS_PROFILE.lineId} ได้เลยครับ ยินดีให้บริการครับ 😊`;
    case "location":
      return `ร้านตั้งอยู่ที่ ${BUSINESS_PROFILE.address} ครับ หากสะดวกแจ้งพื้นที่ติดตั้งหรือหน้างานไว้ได้เลยครับ เดี๋ยวผมช่วยเช็กคิวให้ครับ 😊`;
    case "operating_hours":
      return `เวลาทำการคือ ${BUSINESS_PROFILE.openHours} ครับ ไม่ทราบว่าสะดวกวันไหนหรือช่วงเวลาไหนดีครับ? 😊`;
    case "service_area":
      return `พื้นที่ให้บริการ ${BUSINESS_PROFILE.serviceArea} ไม่ทราบว่าหน้างานอยู่แถวไหนครับ? 😊`;
    case "business_overview":
      return "PAA Air Service เป็นร้านบริการแอร์ครบวงจรครับ รับล้าง ซ่อม ติดตั้ง ย้ายแอร์ ตรวจเช็กหน้างาน รวมถึงจำหน่ายแอร์และอะไหล่เบื้องต้นครับ 😊";
    default:
      return null;
  }
}

// --- HELPERS ---

function resetAllInteractionState(fields: ExtractedCaseFields, meta: ConversationMetadata) {
  // Hard clear all fields for lead shift
  delete fields.customer_name;
  delete fields.phone;
  delete fields.area;
  delete fields.address;
  
  delete fields.preferred_date;
  delete fields.preferred_date_iso;
  delete fields.preferred_time;
  delete fields.preferred_time_exact;
  delete fields.machine_count;
  delete fields.machine_type;
  delete fields.btu;
  delete fields.pricing_buckets;
  delete fields.symptoms;
  delete fields.last_cleaning_recency;
  delete fields.building_type;
  delete fields.parking_context;
  delete fields.walking_distance;
  delete fields.usage_context;
  delete fields.room_size;
  delete fields.product_type;
  delete fields.urgency;

  // Clear interaction memory
  meta.active_flow = "general";
  meta.pending_confirmation = null;
  meta.availability_flow_state = "none";
  meta.last_proposed_slot = null;
  meta.pending_proposal = false;
  meta.proposal_source = null;
  meta.last_resolved_service = null;
  meta.last_prompt_type = "none";
  meta.awaiting_field = null;
  meta.last_reply_mode = null;
}

function isInvalidAddress(value?: string): boolean {
  if (!value) return true;
  return /(ร้านมีแอร์ขาย|มีแอร์ขายไหม|ราคาล้างแอร์|แอร์ไม่เย็น|แนะนำด้วย|คิดเท่าไหร่|ว่างวันไหน)/i.test(value);
}

function isInvalidContact(value?: string): boolean {
  if (!value) return true;
  return value.length < 2 || /(ครับ|ค่ะ|จอง|ล้าง|ซ่อม|ติดตั้ง|ย้าย)/i.test(value);
}

function isPlaceholderValue(val?: string): boolean {
  if (!val) return true;
  return /(วันไหน|ยังไม่ระบุ|แล้วแต่|ไม่แน่ใจ|เดี๋ยวแจ้ง|ค่อยแจ้ง|ช่วงไหน|เวลาไหน)/.test(val);
}

function getNextRepairNoiseQuestion(fields: ExtractedCaseFields): string {
  const sym = fields.symptoms?.toLowerCase() || "";
  if (!sym.includes("เย็น") && !sym.includes("ร้อน")) {
    return "แอร์ยังเย็นปกติไหมครับ และเสียงดังมาจากตัวเครื่องด้านในหรือคอมตัวนอกครับ?";
  }
  if (!sym.includes("ใน") && !sym.includes("นอก") && !sym.includes("คอยล์")) {
    return "เสียงดังมาจากตัวเครื่องด้านในหรือคอมด้านนอกครับ?";
  }
  if (!sym.includes("ตลอด") && !sym.includes("ตอน")) {
    return "เสียงดังตลอดเวลาหรือดังเฉพาะตอนเริ่มทำงานครับ?";
  }
  return "มีอาการสั่นแรงผิดปกติ หรือมีกลิ่นไหม้ร่วมด้วยไหมครับ? ถ้าสะดวก เดี๋ยวผมรับนัดช่างเข้าไปตรวจเช็กหน้างานให้ครับ";
}

function canAskLocationForRepair(fields: ExtractedCaseFields): boolean {
  const sym = fields.symptoms?.toLowerCase() || "";
  return (sym.includes("เย็น") || sym.includes("ร้อน")) && 
         (sym.includes("ใน") || sym.includes("นอก") || sym.includes("คอยล์"));
}

const PRODUCT_SALES_REPLY = "มีครับ ทาง PAA Air Service ให้บริการครบวงจร ทั้งจำหน่ายแอร์ ล้าง ซ่อม ติดตั้ง ประเมินหน้างาน วางแผน ออกแบบ และอะไหล่ครับ เบื้องต้นต้องการเฉพาะตัวเครื่อง หรือพร้อมติดตั้งเลยครับ";

function mergeFields(current: ExtractedCaseFields, next: ExtractedCaseFields): ExtractedCaseFields {
  const result: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(next)) {
    if (value !== null && value !== undefined && value !== "" && value !== 0) {
      result[key] = value;
    }
  }
  return result as ExtractedCaseFields;
}

function sanitizeHallucinations(extracted: ExtractedCaseFields, message: string): ExtractedCaseFields {
    const msg = message.toLowerCase();
    const result = { ...extracted };
    const hasExplicitName = hasExplicitNameLabel(message);
    const hasNameCombo = hasNamePhoneCombo(message);
    const hasScheduleLabels = looksLikeScheduleLabelText(message);
    const hasAddressLabel = hasExplicitAddressLabel(message);
    
    // 1. Building Type
    if (result.building_type && isFrontDoorParkingText(message)) {
        delete result.building_type;
    } else if (result.building_type && !msg.includes("คอนโด") && !msg.includes("ตึก") && !msg.includes("บ้าน") && !msg.includes("หอพัก") && !msg.includes("อพาร์ท")) {
        delete result.building_type;
    }
    if (result.customer_name && !hasExplicitName && !hasNameCombo) {
        delete result.customer_name;
    }
    // 2. Area/Address
    if (result.area && !msg.includes(result.area.toLowerCase()) && !msg.includes("แถว") && !msg.includes("เขต")) {
        delete result.area;
    }
    if (result.address && hasScheduleLabels && !hasAddressLabel) {
        delete result.address;
    }
    // Parking-context text (หน้าบ้าน, หน้าร้าน) is not an address
    if (result.address && isFrontDoorParkingText(message)) {
        delete result.address;
    }
    // 3. Scheduling — date
    if (result.preferred_date && !/(วัน|เสาร์|อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|วันนี้|พรุ่งนี้|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?|\d{1,2}\s*(?:ม\.ค\.|มกราคม|ก\.พ\.|กุมภาพันธ์|มี\.ค\.|มีนาคม|เม\.ย\.|เมษายน|พ\.ค\.|พฤษภาคม|มิ\.ย\.|มิถุนายน|ก\.ค\.|กรกฎาคม|ส\.ค\.|สิงหาคม|ก\.ย\.|กันยายน|ต\.ค\.|ตุลาคม|พ\.ย\.|พฤศจิกายน|ธ\.ค\.|ธันวาคม))/i.test(msg)) {
        delete result.preferred_date;
        delete result.preferred_date_iso;
    }
    // 4. Scheduling — time: remove if no explicit time signal (prevents AI inferring "ช่วงเย็น" from date-only messages)
    if (result.preferred_time && !/(เช้า|บ่าย|เย็น|ช่วง|ตอน|\d{1,2}[:\.]\d{2}|\d{1,2}\s*โมง)/.test(msg)) {
        delete result.preferred_time;
        delete result.preferred_time_exact;
    }
    // 5. machine_count: reject if message is a distance answer (เมตร/เมต/กม) without เครื่อง/ตัว
    //    Prevents "50 เมต" bleeding into machine_count = 50
    if (result.machine_count !== undefined && result.machine_count !== null) {
        const hasUnitWord = /(เครื่อง|ตัว)/.test(msg);
        const hasDistanceWord = /(เมตร|เมต(?!ร)|กม|กิโล|\bm\b)/i.test(msg);
        if (hasDistanceWord && !hasUnitWord) {
            delete result.machine_count;
        }
        // Sanity cap: residential jobs rarely exceed 20 units; if AI hallucinates 50+, reject
        if ((result.machine_count as number) > 20) {
            delete result.machine_count;
        }
    }
    // 6. service_type: "installation" not in DB enum — remove to prevent crash
    if (result.service_type === "installation") {
        delete result.service_type;
    }

    return result;
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
  const parts = [
    args.customerName ? `ลูกค้า: ${args.customerName}` : "ลูกค้า: ยังไม่ทราบชื่อ",
    args.serviceType ? `ประเภทงาน: ${args.serviceType}` : "ประเภทงาน: ยังไม่ยืนยัน",
    args.missingFields.length > 0 ? `ข้อมูลที่ยังขาด: ${args.missingFields.join(", ")}` : "ข้อมูลสำคัญครบในระดับพร้อมคัดกรอง"
  ];
  return parts.filter(Boolean).join(" | ");
}

const BOOKING_CONFIRM_SERVICE_LABELS: Record<string, string> = {
  cleaning: "ล้างแอร์", 
  repair: "ซ่อมแอร์", 
  inspection: "ตรวจเช็คแอร์",
  relocation: "ย้ายแอร์", 
  installation: "ติดตั้งแอร์", 
  cold_room: "ห้องเย็น",
  duct: "แอร์ท่อดักต์"
};

function deriveAreaLabel(text: string | null | undefined): string | null {
  if (!text) return null;
  const knownArea = detectKnownArea(text);
  if (knownArea && knownArea !== "สมุทรปราการ") return knownArea;

  const normalized = normalizeInlineText(text);
  if (!normalized) return null;

  const districtMatch = normalized.match(/(?:อำเภอ|เขต)\s*([ก-๙A-Za-z]+)/);
  if (districtMatch?.[1]) return districtMatch[1];

  const shortAreaMatch = normalized.match(/^\d+\s*\/\s*\d+\s+([ก-๙A-Za-z]+)/);
  if (shortAreaMatch?.[1]) return shortAreaMatch[1];

  return null;
}

function captureCompactAddressFields(messageText: string, extractedFields: ExtractedCaseFields) {
  if (looksLikeScheduleLabelText(messageText) && !hasExplicitAddressLabel(messageText)) return;
  if (!(looksLikeThaiAddress(messageText) || looksLikeCompactThaiAddress(messageText))) return;

  const normalizedAddress = normalizeInlineText(normalizeThaiAddress(messageText));
  if (!normalizedAddress) return;

  extractedFields.address = normalizedAddress;
  const areaLabel = deriveAreaLabel(normalizedAddress);
  if (areaLabel) extractedFields.area = areaLabel;
}

function captureSchedulingFromLines(messageText: string, extractedFields: ExtractedCaseFields) {
  const labeledFields = parseLabeledFields(messageText);
  if (labeledFields.customer_name) extractedFields.customer_name = labeledFields.customer_name;
  if (labeledFields.phone) extractedFields.phone = labeledFields.phone;
  if (labeledFields.address) extractedFields.address = labeledFields.address;
  if (labeledFields.area) extractedFields.area = labeledFields.area;
  if (labeledFields.preferred_date) extractedFields.preferred_date = labeledFields.preferred_date;
  if (labeledFields.preferred_time) extractedFields.preferred_time = labeledFields.preferred_time;

  const lines = splitMeaningfulLines(messageText);
  for (const line of lines) {
    if (!extractedFields.phone) {
      const phoneMatch = line.match(/(0\d{8,9})/);
      if (phoneMatch) extractedFields.phone = phoneMatch[1];
    }

    if (!extractedFields.preferred_date) {
      const dateMatch =
        line.match(/((?:วันนี้|พรุ่งนี้|มะรืน|(?:วัน)?(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์))(?:ที่?นี้|หน้า)?(?:\s*(?:ช่วง)?(?:เช้า|บ่าย|เย็น))?)/) ??
        line.match(/(ช่วง(?:เช้า|บ่าย|เย็น))/);
      if (dateMatch) extractedFields.preferred_date = dateMatch[1].trim();
    }

    if (!extractedFields.preferred_time) {
      const timeMatch =
        line.match(/((?:เวลา|ตอน)\s*\d{1,2}(?::|\.)?\d{0,2}\s*น\.?|(?:\d{1,2}(?::|\.)\d{2}\s*น\.?)|(?:\d{1,2}\s*โมง(?:เช้า|เย็น)?(?:ครึ่ง)?))/) ??
        line.match(/(?<!ไม่)((?:ช่วง|ตอน)?(?:เช้า|บ่าย|เย็น))/);
      if (timeMatch) extractedFields.preferred_time = timeMatch[1].trim();
    }
  }
}

export function applyRepairDirectAnswerCapture(args: {
  activeFlow?: string | null;
  lastPromptType?: string | null;
  messageText: string;
  mergedFields: ExtractedCaseFields;
  extractedFields: ExtractedCaseFields;
}) {
  if (args.activeFlow !== "repair") {
    return { mergedFields: args.mergedFields, extractedFields: args.extractedFields };
  }

  const mergedFields = args.mergedFields;
  const extractedFields = args.extractedFields;
  const lastPT = args.lastPromptType as string;
  const raw = args.messageText.trim();
  const normalizedRaw = normalizeInlineText(raw);
  const msgLower = raw.toLowerCase();
  const frontDoorParking = isFrontDoorParkingText(raw);

  if (!mergedFields.building_type && lastPT === "repair_building_step") {
    const buildingKw = msgLower.match(/คอนโด|หมู่บ้าน|ตึกแถว|อาคาร|ทาวน์โฮม|บ้านเดี่ยว|หอพัก/);
    if (buildingKw) {
      mergedFields.building_type = buildingKw[0];
      extractedFields.building_type = buildingKw[0];
    }
  }

  if (frontDoorParking && (lastPT === "repair_parking_step" || lastPT === "repair_parking_distance_step")) {
    mergedFields.parking_context = normalizedRaw;
    extractedFields.parking_context = normalizedRaw;
    mergedFields.walking_distance = "หน้างาน";
    extractedFields.walking_distance = "หน้างาน";
  }

  if (!mergedFields.parking_context && lastPT === "repair_parking_step") {
    const hasNo = /ไม่มีที่จอด|จอดไม่ได้|ไม่มีครับ|ไม่มีค่ะ/.test(msgLower);
    const hasYes = /มีที่จอด|จอดริมถนน|จอดได้|มีครับ|มีค่ะ|มี/.test(msgLower);
    if (hasNo) {
      mergedFields.parking_context = "ไม่มีที่จอดรถ";
      extractedFields.parking_context = "ไม่มีที่จอดรถ";
      mergedFields.walking_distance = "ไม่มีที่จอด";
      extractedFields.walking_distance = "ไม่มีที่จอด";
    } else if (hasYes) {
      mergedFields.parking_context = "มีที่จอดรถ";
      extractedFields.parking_context = "มีที่จอดรถ";
    }
  }

  if (!mergedFields.walking_distance && lastPT === "repair_parking_distance_step") {
    const distMatch = msgLower.match(/(\d+)\s*(?:เมตร|เมต(?!ร)|m)/i);
    if (distMatch) {
      const normalized = distMatch[0].replace(/เมต(?!ร)/g, "เมตร");
      mergedFields.walking_distance = normalized;
      extractedFields.walking_distance = normalized;
    } else if (/\d+/.test(msgLower)) {
      const numOnly = msgLower.match(/\d+/)?.[0];
      if (numOnly) {
        mergedFields.walking_distance = `${numOnly} เมตร`;
        extractedFields.walking_distance = `${numOnly} เมตร`;
      }
    }
  }

  if (!mergedFields.area && (lastPT === "repair_area_step" || lastPT === "booking_area")) {
    const areaFiller = /^(ครับ|ค่ะ|คะ|แล้ว|โอเค|ได้|ใช่|เรียบร้อย|ไม่ทราบ|ไม่รู้)$/;
    if (raw.length >= 2 && !areaFiller.test(raw)) {
      mergedFields.area = raw;
      extractedFields.area = raw;
    }
  }

  if (!mergedFields.customer_name && (lastPT === "repair_customer_name_step" || lastPT === "booking_name")) {
    const nameCandidate = splitMeaningfulLines(raw).find((line) => {
      return line.length >= 2 &&
        line.length <= 30 &&
        !/[0-9]/.test(line) &&
        !/^(ครับ|ค่ะ|คะ|แล้ว|โอเค|ใช่|ไม่|ไม่ทราบ|ไม่มี|ไม่บอก)$/.test(line);
    });
    if (nameCandidate) {
      mergedFields.customer_name = nameCandidate;
      extractedFields.customer_name = nameCandidate;
    }
  }

  if (!mergedFields.machine_count && lastPT === "repair_machine_count_step") {
    const hasDistance = /(เมตร|เมต|กม|กิโล)/i.test(msgLower);
    const countMatch = msgLower.match(/\b(\d{1,2})\b/);
    if (!hasDistance && countMatch) {
      const n = Number(countMatch[1]);
      if (n >= 1 && n <= 20) {
        mergedFields.machine_count = n;
        extractedFields.machine_count = n;
      }
    }
  }

  if (!mergedFields.machine_type && lastPT === "repair_machine_type_step") {
    const isCassette = /คาสเซ็ท|cassette|4\s*ทิศ/i.test(msgLower);
    const isWall = /ติดผนัง|wall/i.test(msgLower);
    const isCeiling = /แขวน|ceiling|floor/i.test(msgLower);
    if (isCassette) {
      mergedFields.machine_type = "cassette";
      extractedFields.machine_type = "cassette";
    } else if (isWall) {
      mergedFields.machine_type = "wall";
      extractedFields.machine_type = "wall";
    } else if (isCeiling) {
      mergedFields.machine_type = "ceiling_floor";
      extractedFields.machine_type = "ceiling_floor";
    }
  }

  return { mergedFields, extractedFields };
}

function isSunday(dateText: string | undefined): boolean {
  if (!dateText) return false;
  const isoMatch = dateText.match(/^\d{4}-\d{2}-\d{2}$/);
  if (isoMatch) {
    const d = new Date(`${dateText}T00:00:00+07:00`);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Bangkok" }).format(d) === "Sun";
    }
  }
  return dateText.includes("อาทิตย์") || dateText.toLowerCase().includes("sun");
}

function findNearestAvailableNonSunday(requested: string | undefined): { date: string; time: string } {
  return {
    date: "วันเสาร์ (พรุ่งนี้)",
    time: "ช่วงบ่าย"
  };
}



export function applyAvailabilityPolicy(fields: ExtractedCaseFields): { 
  reason: AvailabilityPolicyBlockReason | null;
  proposedSlot: { date: string; time: string } | null;
} {
  const requestedDate = fields.preferred_date_iso ?? fields.preferred_date;
  if (isSunday(requestedDate)) {
    return {
      reason: "sunday_closed",
      proposedSlot: findNearestAvailableNonSunday(requestedDate)
    };
  }
  return { reason: null, proposedSlot: null };
}

export function handlePendingAlternativeProposal(
    text: string,
    meta: ConversationMetadata,
    current: ExtractedCaseFields,
    next: ExtractedCaseFields
): { resolution: "accept" | "reject" | "none"; newFields: Partial<ExtractedCaseFields> } {
  if (meta.availability_flow_state !== "proposed_alternative_slot" || !meta.last_proposed_slot) {
    return { resolution: "none", newFields: {} };
  }

  // A. Direct Accept
  const acceptSignals = ["ตกลง", "ได้ครับ", "เอาวันนี้", "จองเลย", "ok", "yes", "confirm"];
  if (acceptSignals.some(s => text.toLowerCase().includes(s))) {
    return { 
      resolution: "accept",
      newFields: {
        preferred_date: meta.last_proposed_slot.date,
        preferred_time: meta.last_proposed_slot.time
      }
    };
  }

  // B. Counter Offer
  if (next.preferred_date || next.preferred_time) {
      // User provided a different slot
      return { resolution: "none", newFields: {} };
  }

  // C. Reject
  const rejectSignals = ["ไม่สะดวก", "ไม่ได้", "ขอวันอื่น", "เอาอีกวัน", "no"];
  if (rejectSignals.some(s => text.toLowerCase().includes(s))) {
    return { resolution: "reject", newFields: {} };
  }

  return { resolution: "none", newFields: {} };
}

const SUMMARY_FILLER_WORDS = /^(ครับ|ค่ะ|คะ|แล้ว|โอเค|ok|yes|ใช่|ถูกต้อง|เออ|ได้|ได้ครับ|ได้ค่ะ|เรียบร้อย)$/i;

function meaningfulField(value: string | null | undefined, minLen = 3): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.length < minLen) return null;
  if (SUMMARY_FILLER_WORDS.test(v)) return null;
  return v;
}

// Returns area label only if it's a genuine neighborhood name, not a full address
function safeAreaLabel(fields: ExtractedCaseFields): string | null {
  const derivedArea = fields.area?.trim() ?? deriveAreaLabel(fields.address) ?? null;
  const area = derivedArea;
  if (!area) return null;
  // Reject if contains digits (house numbers, zip codes) — likely a full address
  if (/\d/.test(area)) return null;
  // Reject if suspiciously long (full address snuck in)
  if (area.length > 30) return null;
  return meaningfulField(area) ?? null;
}

const THAI_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function formatThaiDate(fields: ExtractedCaseFields): string | null {
  const iso = fields.preferred_date_iso;
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      const month = THAI_MONTHS[d.getMonth()];
      const year = d.getFullYear() + 543;
      if (hasExplicitAbsoluteThaiDate(fields.preferred_date ?? "")) {
        return `${d.getDate()} ${month} ${year}`;
      }
      const dayName = THAI_DAYS[d.getDay()];
      return `${dayName} ${d.getDate()} ${month} ${year}`;
    }
  }
  return meaningfulField(fields.preferred_date) ?? null;
}

export function buildBookingConfirmationReply(fields: ExtractedCaseFields): string {
  const serviceLabel = fields.service_type
    ? BOOKING_CONFIRM_SERVICE_LABELS[fields.service_type] ?? fields.service_type
    : null;
  const machineStr = fields.machine_count ? ` ${fields.machine_count} เครื่อง` : "";
  const address = meaningfulField(fields.address);
  const area = safeAreaLabel(fields);
  const dateDisplay = formatThaiDate(fields);
  const timeDisplay = meaningfulField(fields.preferred_time_exact) ?? meaningfulField(fields.preferred_time);

  const lines: (string | null)[] = [
    "✅ รับทราบครับ สรุปข้อมูลการจองให้นะครับ",
    "",
    `👤 ชื่อ: คุณ${fields.customer_name}`,
    `📞 เบอร์: ${fields.phone}`,
    address ? `📍 ที่อยู่: ${address}` : null,
    area ? `📌 พื้นที่: ${area}` : null,
    dateDisplay ? `🗓 วันนัด: ${dateDisplay}` : null,
    timeDisplay ? `⏰ เวลา: ${timeDisplay}` : null,
    serviceLabel ? `🔧 บริการ: ${serviceLabel}${machineStr}` : null,
    meaningfulField(fields.building_type) ? `🏠 ประเภทหน้างาน: ${meaningfulField(fields.building_type)}` : null,
    "",
    "เดี๋ยวแอดมินตรวจสอบคิวและยืนยันกลับอีกครั้งนะครับ 😊"
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

const FIELD_QUESTIONS: Record<string, string> = {
  customer_name: "ขอทราบชื่อลูกค้าด้วยครับ? 😊",
  phone: "ขอเบอร์โทรติดต่อด้วยครับ?",
  address: "ขอที่อยู่หรือรายละเอียดหน้างานเพิ่มอีกนิดนะครับ?",
  area: "อยู่แถวไหนครับ?",
  preferred_date: "สะดวกวันไหนครับ?",
  preferred_time: "สะดวกกี่โมงครับ? เช่น 13:00 หรือ 13.30 ครับ",
  machine_count: "มีแอร์กี่เครื่องครับ?",
  service_type: "ต้องการล้าง ซ่อม ติดตั้ง หรือย้ายแอร์ดีครับ?",
  btu: "รบกวนขอขนาด BTU หรือรูปป้ายสเปกเครื่องหน่อยครับ (เป็นรูปถ่ายก็ได้นะครับ)",
  symptoms: "ช่วยอธิบายอาการเพิ่มเติมอีกนิดได้ไหมครับ?",
  site_context: "รบกวนขอข้อมูลหน้างานเพิ่มเติมอีกนิดครับ เช่น งานบ้านหรือในห้าง, ต้องทำช่วงกลางคืนไหม, และเป็นหน้างานแบบไหนครับ? 😊",
  last_cleaning_recency: "ล้างแอร์ล่าสุดประมาณเมื่อไหร่ครับ?",
  building_type: "หน้างานเป็นตึกแถว คอนโด หรือหมู่บ้านครับ?",
  parking_context: "ที่หน้างานมีที่จอดรถไหมครับ?",
  walking_distance: "จากที่จอดรถเดินไกลไหมครับ?",
  machine_type: "แอร์ที่ต้องการให้ตรวจเช็กเป็นแอร์ประเภทไหนครับ? (เช่น ติดผนัง, แขวน, คาสเซ็ท)"
};

export async function processCustomerMessage(params: {
  threadId: string;
  caseId: string;
  customerId: string;
  customerName: string | null;
  channelUserId?: string | null;
  messageText: string;
  messageType?: string;
  imageBase64?: string | null;
  providerMessageId?: string | null;
  requestId?: string;
  metadata?: ConversationMetadata;
}): Promise<FinalTurnDecision & { mergedFields: ExtractedCaseFields; summary: string; nextMetadata: ConversationMetadata }> {
  try {
  const existingCase = await getServiceCaseById(params.caseId);
  const currentCaseFields = (existingCase.extracted_fields as ExtractedCaseFields | null) ?? {};
  const meta: ConversationMetadata = params.metadata || {};

  if (existingCase.status === "handed_off" || existingCase.lead_status === "handed_off") {
      return {
          intent: "admin_handoff", shouldHandoff: true, nextAction: "handoff", nextMissingField: null,
          capturedFields: {}, retryCount: 0, policyMessage: "admin_takeover", customerReply: "",
          mergedFields: currentCaseFields, summary: existingCase.summary || "", stateAdvanced: false,
          nextMetadata: { ...meta, last_interaction_at: new Date().toISOString() }
      };
  }

  // Dedup: both LINE webhook and n8n may deliver the same providerMessageId simultaneously
  if (params.providerMessageId && await messageExistsByProviderId(params.providerMessageId)) {
      console.log(`[CASE_MANAGER] Dedup: ${params.providerMessageId} already processed, skipping`);
      return {
          intent: "general_inquiry", shouldHandoff: false, nextAction: "skip_reply",
          nextMissingField: null, capturedFields: {}, retryCount: 0, policyMessage: "duplicate",
          customerReply: "", mergedFields: currentCaseFields, summary: existingCase.summary || "",
          stateAdvanced: false, nextMetadata: meta
      };
  }

  const displayMsg = params.messageType === "sticker" ? "[sticker]" : 
                     (params.messageType === "image" && !params.messageText) ? "[image]" : 
                     params.messageText;

  await createConversationMessage({
    threadId: params.threadId,
    caseId: params.caseId,
    role: "customer",
    providerMessageId: params.providerMessageId,
    messageText: params.imageBase64 ? `[Image Sent] ${displayMsg}` : displayMsg
  });

  await updateThreadState({
    threadId: params.threadId,
    status: "open",
    lastCustomerMessageAt: new Date().toISOString()
  });

  const recentMessages = await getThreadMessages(params.threadId, 20, params.caseId);

  if (params.messageType === "sticker") {
    const ACTIVE_INTENTS_FOR_STICKER = ["cleaning_request", "repair_request", "inspection_request", "relocation_request", "installation_request", "scheduling_request"];
    const existingIntent = existingCase.ai_intent as IntentName;
    const missingFields = Array.isArray(existingCase.missing_fields) ? existingCase.missing_fields as string[] : [];
    
    if (existingIntent && ACTIVE_INTENTS_FOR_STICKER.includes(existingIntent) && missingFields.length > 0) {
      const nextField = missingFields[0];
      return {
        intent: existingIntent,
        shouldHandoff: false,
        nextAction: "ask_missing",
        nextMissingField: nextField as any,
        capturedFields: {},
        retryCount: (meta.clarification_retry_count || 0),
        policyMessage: null,
        customerReply: FIELD_QUESTIONS[nextField] ?? "ขอรายละเอียดเพิ่มเติมด้วยครับ?",
        mergedFields: currentCaseFields,
        summary: existingCase.summary || "",
        stateAdvanced: false,
        nextMetadata: { ...meta, last_user_turn_resolution: "sticker" }
      };
    }
    return {
      intent: "closing",
      shouldHandoff: false,
      nextAction: "skip_reply",
      nextMissingField: null,
      capturedFields: {},
      retryCount: 0,
      policyMessage: null,
      customerReply: "",
      mergedFields: currentCaseFields,
      summary: existingCase.summary || "",
      stateAdvanced: false,
      nextMetadata: { ...meta, last_user_turn_resolution: "sticker" }
    };
  }

  if (params.messageType === "image" || (params.messageType === "text" && params.imageBase64)) {
    console.log("[CASE_MANAGER] M3: Analyzing image message...");
    const rawVisionResult = await runJsonCompletion(
      buildVisionPrompt(params.messageText || "Analyze this HVAC image."),
      { 
        imageBase64: params.imageBase64,
        routing: { highValueCase: existingCase.lead_status === "qualified" }
      }
    );

    if (rawVisionResult) {
      try {
        const vision = JSON.parse(rawVisionResult);
        const captured = vision.capturedFields || {};
        const reply = vision.replyDraftThai || "เห็นรูปที่ส่งมาแล้วครับ 😊 รบกวนแจ้งรายละเอียดเพิ่มเติมหรือเบอร์โทรติดต่อไว้ได้เลยครับ";

        const visionFields: ExtractedCaseFields = {
          machine_type: captured.machine_type,
          machine_count: captured.machine_count,
          symptoms: vision.visibleSignals?.join(", ")
        };

        const finalFields = mergeFields(currentCaseFields, visionFields);
        await updateCaseState({
          caseId: params.caseId,
          extractedFields: finalFields,
          aiIntent: vision.intent
        });

        const missing = getMissingBookingFields(finalFields);

        return {
          intent: vision.intent as IntentName,
          shouldHandoff: vision.needsFallback || false,
          nextAction: "reply",
          nextMissingField: missing[0] as any,
          capturedFields: finalFields as any,
          retryCount: 0,
          policyMessage: null,
          customerReply: finalClean(reply),
          mergedFields: finalFields,
          summary: vision.visibleSignals?.join(" | ") || "",
          stateAdvanced: true,
          nextMetadata: { 
            ...meta, 
            last_user_turn_resolution: "data_provision",
            media_flow_state: "none"
          }
        };
      } catch (err) {
        console.warn("[CASE_MANAGER] Vision parse failed, falling back to manual clarify", err);
      }
    }

    return {
      intent: "general_inquiry",
      shouldHandoff: false,
      nextAction: "clarify",
      nextMissingField: null,
      capturedFields: {},
      retryCount: 0,
      policyMessage: null,
      customerReply: "ได้เลยครับ เห็นรูปที่ส่งมาแล้วครับ 😊\nรบกวนบอกด้วยครับว่าต้องการบริการอะไร?\nล้าวแอร์ / ซ่อมแอร์ / ตรวจเช็ค / ย้ายแอร์",
      mergedFields: currentCaseFields,
      summary: "Manual clarification requested for image",
      stateAdvanced: false,
      nextMetadata: { 
          ...meta, 
          media_flow_state: "awaiting_service_label_for_image",
          last_user_turn_resolution: "unclear_image"
      }
    };
  }

  const msgLower = params.messageText.toLowerCase().trim();
  const isAffirmative = ["ใช่", "ถูกต้อง", "โอเค", "ครับ", "ค่ะ", "ok", "yes", "ตกลง"].some(sig => msgLower.includes(sig));
  const isGenuineGreeting = /สวัสดี|หวัดดี/.test(msgLower);
  const isGenuineFarewell = /ขอบคุณ|ลาก่อน|\bbye\b/.test(msgLower);
  const isExplicitPricingPivot = /ราคา|เท่าไหร่|ค่าบริการ|เริ่มต้น/.test(msgLower);
  const canonicalTopic = resolveCanonicalTopic(params.messageText);
  const hasCanonicalFaqTopic = Boolean(canonicalTopic);
  const explicitFaqPivot = isExplicitFaqPivot(msgLower);
  const isAskingFreeSlots = /(ว่างวันไหน|มีคิววันไหน|วันไหนว่าง|มีคิวไหม)/.test(msgLower);
  const isAskingMySlot = /(นัดวันไหน|วันไหนนะ|สรุปวันนัด)/.test(msgLower);
  const hasSalesKeyword = /(ขาย|ซื้อ|มีแอร์|อะไหล่|สั่ง)/.test(msgLower);
  
  // 1. FRESH START & PIVOT DETECTION (Pre-AI)
  const isRepairFlowActive = (meta.active_flow === "repair");
  const isSymptomReinforcement = isRepairFlowActive && /(ไม่เย็น|ไม่มีความเย็น|ลมออกแต่ไม่เย็น|เปิดแล้วไม่เย็น|เสียงดัง|น้ำหยด|เสีย|ซ่อม)/.test(msgLower);

  const isFreshBookingStart = !isRepairFlowActive && 
                             (/(จะจอง|จองล้าง|ขอจอง|จะนัด|นัดล้าง|จองคิว|ซ่อมแอร์|จะซ่อม|แอร์เสีย|ไม่เย็น|เปิดแล้วไม่เย็น)/.test(msgLower) || 
                              (msgLower.includes("ล้างแอร์") && (msgLower.includes("ครับ") || msgLower.includes("ค่ะ")) && msgLower.length < 20));
  
  if (isFreshBookingStart && !isSymptomReinforcement) {
      console.log(`[CASE_MANAGER] Fresh start detected pre-AI for "${msgLower}". Resetting state.`);
      resetAllInteractionState(currentCaseFields, meta);
  }

  // 2. AI CALLS with (potentially reset) fields
  const [classified, extractedFieldsRaw, knowledge, priceFacts] = await Promise.all([
    classifyIntent(params.messageText, params.imageBase64, undefined, currentCaseFields),
    extractStructuredFields(params.messageText, currentCaseFields, params.imageBase64),
    searchKnowledge(params.messageText),
    listPricingFacts()
  ]);

  let extractedFields = sanitizeHallucinations(extractedFieldsRaw, params.messageText);
  let mergedFields = mergeFields(currentCaseFields, extractedFields);

  captureCompactAddressFields(params.messageText, extractedFields);
  captureSchedulingFromLines(params.messageText, extractedFields);
  const isNamePrompt =
    (meta.last_prompt_type as string) === "repair_customer_name_step" ||
    meta.last_prompt_type === "booking_name" ||
    meta.awaiting_field === "customer_name";
  if (extractedFields.customer_name && !isNamePrompt && !hasExplicitNameLabel(params.messageText) && !hasNamePhoneCombo(params.messageText)) {
      delete extractedFields.customer_name;
  }
  if (extractedFields.address && looksLikeScheduleLabelText(params.messageText) && !hasExplicitAddressLabel(params.messageText)) {
      delete extractedFields.address;
  }

  const isCommercialDuct = isCommercialDuctQuery(msgLower) || classified.intent === "commercial_pricing_query";
  
  // NAME FORCE-COMMIT
  if (meta.awaiting_field === "customer_name" && !extractedFieldsRaw.customer_name && msgLower.length < 15 && msgLower.length > 1) {
      const isWeakIntent = !["faq_pricing", "sales_inquiry", "repair_request"].includes(classified.intent);
      if (isWeakIntent) {
          extractedFields.customer_name = params.messageText.replace(/^คุณ\s*/, "");
      }
  }
  
  // (Duplicate removal)

  let activeFlow = meta.active_flow || "general";
  const FLOW_PIVOT_INTENTS = ["sales_inquiry", "repair_request", "relocation_request", "installation_request", "product_availability_query", "relocation_pricing_query", "cleaning_request"];
  const isStrongPivot = FLOW_PIVOT_INTENTS.includes(classified.intent) && classified.confidence > 0.95;
  const isExplicitPivotText = /ไม่ใช่|ไม่ครับ|ไม่ค่ะ|ซ่อม|เสีย|ล้าง|ไม่เย็น/.test(msgLower) && classified.confidence > 0.8;
  const shouldBlockCanonicalFaqPivot = hasCanonicalFaqTopic && explicitFaqPivot;
  
  if ((isStrongPivot || isExplicitPivotText) && !shouldBlockCanonicalFaqPivot) {
      const targetFlow: Record<string, any> = {
          sales_inquiry: "sales",
          product_availability_query: "sales",
          repair_request: "repair",
          relocation_request: "relocation_booking",
          relocation_pricing_query: "relocation_booking",
          installation_request: "installation_booking",
          cleaning_request: "cleaning_booking"
      };
      
      let pivotIntent = classified.intent;
      if (isExplicitPivotText && !isStrongPivot) {
          if (msgLower.includes("ซ่อม") || msgLower.includes("ไม่เย็น") || msgLower.includes("เสีย")) pivotIntent = "repair_request";
          else if (msgLower.includes("ล้าง")) pivotIntent = "cleaning_request";
          else if (msgLower.includes("ติดตั้ง")) pivotIntent = "installation_request";
      }

      const newFlow = targetFlow[pivotIntent] || "general";
      const blockPivot = (activeFlow === "repair" && newFlow === "cleaning_booking" && isRepairContextCleaningHistory(msgLower, activeFlow, pivotIntent));
      
      if (newFlow !== activeFlow && !blockPivot) {
          console.log(`[CASE_MANAGER] Pivot detected from ${activeFlow} to ${newFlow}. Resetting stale state.`);
          resetAllInteractionState(currentCaseFields, meta);
          activeFlow = newFlow;
          meta.active_flow = activeFlow;
      }
  }

  let confirmationAccepted = false;
  if (meta.pending_confirmation && isAffirmative && !isStrongPivot) {
      if (meta.pending_confirmation.type === "booking_time_confirm") {
          extractedFields.preferred_time = meta.pending_confirmation.value;
          confirmationAccepted = true;
      } else if (meta.pending_confirmation.type === "booking_date_confirm") {
          extractedFields.preferred_date = meta.pending_confirmation.value;
          confirmationAccepted = true;
      }
      meta.pending_confirmation = null;
  }

  mergedFields = mergeFields(currentCaseFields, extractedFields);
  mergedFields = normalizeScheduleFields(mergedFields, params.messageText);
  extractedFields.preferred_date_iso = mergedFields.preferred_date_iso;
  extractedFields.preferred_time = mergedFields.preferred_time ?? extractedFields.preferred_time;
  extractedFields.preferred_time_exact = mergedFields.preferred_time_exact;

  // POST-EXTRACTION HALLUCINATION GUARD
  if (isFreshBookingStart && !isSymptomReinforcement) {
      // Clear specific scheduling/location fields that AI might have hallucinated on turn 1
      delete mergedFields.preferred_date;
      delete mergedFields.preferred_date_iso;
      delete mergedFields.preferred_time;
      delete mergedFields.preferred_time_exact;
      delete mergedFields.area;
      delete mergedFields.address;
  }

  // REPAIR SYMPTOMS ACCUMULATION
  // When bot just asked for symptoms and user replies, append to existing symptoms (don't replace)
  // This prevents a short initial symptom ("ไม่เย็น", 7 chars) from causing infinite re-ask
  if (activeFlow === "repair" && (meta.last_prompt_type === "repair_noise_step" || (meta.last_prompt_type as string) === "repair_symptoms_step")) {
      const symRaw = params.messageText.trim();
      const symFiller = /^(ครับ|ค่ะ|คะ|ใช่|ได้|โอเค|ไม่|ไม่มี)$/;
      if (symRaw.length >= 2 && !symFiller.test(symRaw)) {
          const existing = mergedFields.symptoms ?? "";
          const combined = existing && !existing.includes(symRaw) ? `${existing}, ${symRaw}` : (existing || symRaw);
          mergedFields.symptoms = combined;
          extractedFields.symptoms = combined;
      }
  }

  // REPAIR HISTORY EARLY CAPTURE
  // Must run before triage override — otherwise triage returns early before line 769 can capture the answer
  if (activeFlow === "repair" && !mergedFields.last_cleaning_recency) {
      const botJustAskedHistory = meta.last_prompt_type === "repair_history_step";
      const looksLikeHistoryAnswer = isRepairContextCleaningHistory(msgLower, activeFlow, classified.intent as string);
      const isNonPivot = !explicitFaqPivot && classified.intent !== "closing";
      if (looksLikeHistoryAnswer || (botJustAskedHistory && isNonPivot)) {
          extractedFields.last_cleaning_recency = params.messageText;
          mergedFields.last_cleaning_recency = params.messageText;
      }
  }

  // REPAIR DIRECT ANSWER EARLY CAPTURES
  // Must run before triage override (which returns early) — AI extraction alone is unreliable for short/noisy answers
  if (activeFlow === "repair") {
      ({ mergedFields, extractedFields } = applyRepairDirectAnswerCapture({
          activeFlow,
          lastPromptType: meta.last_prompt_type,
          messageText: params.messageText,
          mergedFields,
          extractedFields
      }));
  }

  // ATOMIC PERSISTENCE: Save state immediately after merging fields
  if (params.caseId) {
    // FORCE repair service_type if in repair flow
    if (activeFlow === "repair" && mergedFields.service_type !== "repair") {
        mergedFields.service_type = "repair";
    }

    await updateCaseState({
      caseId: params.caseId,
      extractedFields: mergedFields,
      serviceType: mergedFields.service_type ?? null,
      aiIntent: classified.intent as IntentName
    });
  }

  // 2.5 DETERMINISTIC REPAIR TRIAGE OVERRIDE (PRIORITY 1)
  // We do this BEFORE any FAQ or scheduling logic to ensure flow integrity
  let triageOverrideReply: string | null = null;
  let triageOverrideIntent: IntentName | null = null;
  let triageOverrideMissing: string[] | null = null;

  const REPAIR_REQUIRED_FIELDS = [
    "symptoms",
    "last_cleaning_recency",
    "building_type",
    "parking_context",
    "machine_type",
    "machine_count",
    "area",
    "phone",
    "customer_name",
    "preferred_date",
    "preferred_time"
  ];

  const isClosingIntent = classified.intent === "closing" || msgLower.includes("ขอบคุณ");
  if (isClosingIntent && activeFlow === "repair") {
      activeFlow = null as any;
      meta.active_flow = "general";
  }

  const isGreeting = classified.intent === "greeting" || /^(hi|hello|สวัสดี|หวัดดี|ดีครับ|ดีค่ะ)[\s\W]*$/i.test(msgLower.trim());
  const repairMissingField = REPAIR_REQUIRED_FIELDS.find((field) => {
      if (field === "symptoms") {
          // Treat as missing if absent OR if it's a single filler word (ครับ, ค่ะ, etc.)
          const s = mergedFields.symptoms?.trim();
          if (!s) return true;
          return /^(ครับ|ค่ะ|คะ|ใช่|ได้|โอเค|ไม่|มี|ไม่มี)$/.test(s);
      }
      if (field === "preferred_date") return !hasNormalizedPreferredDate(mergedFields);
      if (field === "preferred_time") return !hasExactPreferredTime(mergedFields);
      return !mergedFields[field as keyof ExtractedCaseFields];
  });
  const isRepairTriageIncomplete = activeFlow === "repair" && !isClosingIntent && !isGreeting && Boolean(repairMissingField);

  if (isRepairTriageIncomplete && !explicitFaqPivot && !hasCanonicalFaqTopic) {
      const missingField = repairMissingField;
      console.log(`[CASE_MANAGER] Applying HIGH-PRIORITY deterministic repair triage. Next missing: ${missingField}`);
      
      if (missingField === "symptoms") {
          triageOverrideReply = "ช่วยอธิบายอาการเพิ่มเติมอีกนิดได้ไหมครับ? เช่น ไม่เย็น มีเสียงดัง หรือมีน้ำหยดครับ 😊";
          triageOverrideMissing = ["symptoms"];
      } else if (missingField === "last_cleaning_recency") {
          triageOverrideReply = "รับทราบครับ ข้อมูลนี้ใช้ประกอบการตรวจเช็กอาการได้ครับ รบกวนสอบถามว่าล้างแอร์ล่าสุดประมาณเมื่อไหร่ครับ?";
          triageOverrideMissing = ["last_cleaning_recency"];
      } else if (missingField === "building_type") {
          triageOverrideReply = "หน้างานเป็นตึกแถว คอนโด หรือหมู่บ้านครับ? เพื่อให้ช่างเตรียมอุปกรณ์ได้ถูกต้องครับ";
          triageOverrideMissing = ["building_type"];
      } else if (missingField === "parking_context") {
          triageOverrideReply = "ที่หน้างานมีที่จอดรถไหมครับ?";
          triageOverrideMissing = ["parking_context"];
      } else if (missingField === "walking_distance") {
          triageOverrideReply = "จากที่จอดรถเดินไกลไหมครับ หรือประมาณกี่เมตรครับ?";
          triageOverrideMissing = ["walking_distance"];
      } else if (missingField === "machine_type") {
          triageOverrideReply = "รับทราบครับ แอร์ที่ต้องการให้ซ่อมเป็นแอร์ประเภทไหนครับ? (เช่น แอร์ติดผนัง, แอร์แขวน, แอร์คาสเซ็ท)";
          triageOverrideMissing = ["machine_type"];
      } else if (missingField === "machine_count") {
          triageOverrideReply = "ต้องการให้ช่างเข้าตรวจเช็กทั้งหมดกี่เครื่องครับ?";
          triageOverrideMissing = ["machine_count"];
      } else if (missingField === "area") {
          triageOverrideReply = "ขอทราบพิกัดหน้างานนิดนึงครับ อยู่แถวไหนครับ?";
          triageOverrideMissing = ["area"];
      } else if (missingField === "phone") {
          triageOverrideReply = "ขอเบอร์โทรศัพท์สำหรับติดต่อกลับให้ช่างด้วยครับ";
          triageOverrideMissing = ["phone"];
      } else if (missingField === "customer_name") {
          triageOverrideReply = "ขอทราบชื่อลูกค้าสำหรับลงคิวงานด้วยครับ 😊";
          triageOverrideMissing = ["customer_name"];
      } else if (missingField === "preferred_date") {
          const timeAck = mergedFields.preferred_time_exact ? `รับทราบเวลา ${mergedFields.preferred_time_exact} ครับ ` : "";
          triageOverrideReply = `${timeAck}สะดวกให้ช่างเข้าไปวันไหนดีครับ? (เปิดจันทร์-เสาร์ 09:00-18:00)`;
          triageOverrideMissing = ["preferred_date"];
      } else if (missingField === "preferred_time") {
          triageOverrideReply = "สะดวกกี่โมงครับ? รบกวนระบุเวลาได้เลย เช่น 13:00 ครับ";
          triageOverrideMissing = ["preferred_time"];
      }

      if (triageOverrideReply) {
          triageOverrideIntent = "repair_request";
          const TRIAGE_PROMPT_TYPE_MAP: Record<string, ConversationMetadata["last_prompt_type"]> = {
              symptoms: "repair_symptoms_step",
              last_cleaning_recency: "repair_history_step",
              building_type: "repair_building_step",
              parking_context: "repair_parking_step",
              walking_distance: "repair_parking_distance_step",
              machine_type: "repair_machine_type_step",
              machine_count: "repair_machine_count_step",
          };
          const lastPromptType = TRIAGE_PROMPT_TYPE_MAP[missingField ?? ""] ?? (`repair_${missingField}_step` as ConversationMetadata["last_prompt_type"]);

          const nextMetadata: ConversationMetadata = {
              ...meta,
              active_flow: "repair",
              last_prompt_type: lastPromptType as any,
              last_resolved_service: "repair"
          };

          return {
              intent: "repair_request",
              shouldHandoff: false,
              nextAction: "ask_missing",
              nextMissingField: triageOverrideMissing?.[0] as any,
              capturedFields: extractedFields,
              retryCount: meta.clarification_retry_count || 0,
              policyMessage: null,
              customerReply: triageOverrideReply as string,
              mergedFields,
              summary: `Repair triage override: ${triageOverrideMissing?.[0]}`,
              stateAdvanced: true,
              nextMetadata,
              policyBlockReason: null
          };
      }
  }

  let availabilityState = meta.availability_flow_state || "none";
  let policyBlockReason: AvailabilityPolicyBlockReason | null = meta.policy_block_reason || null;
  let proposedSlot = meta.last_proposed_slot || null;
  let proposalSource = meta.proposal_source || null;
  let pendingProposal = meta.pending_proposal || false;

  const negotiation = handlePendingAlternativeProposal(params.messageText, meta, currentCaseFields, extractedFields);
  let skipPolicyCheck = false;

  if (negotiation.resolution === "accept") {
      availabilityState = "slot_reconfirmation";
      extractedFields.preferred_date = negotiation.newFields.preferred_date;
      extractedFields.preferred_time = negotiation.newFields.preferred_time;
      pendingProposal = false; policyBlockReason = null; proposedSlot = null;
      skipPolicyCheck = true;
  } else if (negotiation.resolution === "reject") {
      availabilityState = "availability_conflict";
      pendingProposal = false; policyBlockReason = null; proposedSlot = null;
  }

  if (!skipPolicyCheck) {
      const mergedForPolicy = mergeFields(currentCaseFields, extractedFields);
      const policyResult = applyAvailabilityPolicy(mergedForPolicy);
      if (policyResult.reason) {
          policyBlockReason = policyResult.reason;
          proposedSlot = policyResult.proposedSlot;
          proposalSource = policyResult.reason === "sunday_closed" ? "sunday_closed" : "advance_booking_policy";
          availabilityState = "proposed_alternative_slot";
          pendingProposal = true;
      } else if (extractedFields.preferred_date || extractedFields.preferred_time) {
          availabilityState = "slot_reconfirmation";
          policyBlockReason = null; proposedSlot = null; pendingProposal = false;
      }
  }

  // 3. Special Intent Interceptions

  if (classified.intent === "product_availability_query") {
      meta.active_flow = "sales";
      return {
          intent: "product_availability_query", shouldHandoff: false, nextAction: "reply", nextMissingField: "machine_type",
          capturedFields: {}, retryCount: 0, policyMessage: null, 
          customerReply: "มีครับ ทางร้านมีบริการจำหน่ายแอร์ด้วยครับ เบื้องต้นต้องการเฉพาะตัวเครื่อง หรือพร้อมติดตั้งเลยครับ", 
          mergedFields: { ...mergedFields, service_type: "other" }, summary: "Inquired about AC sales availability", stateAdvanced: true,
          nextMetadata: { ...meta, active_flow: "sales", last_prompt_type: "sales_qualify" }
      };
  }

  if (classified.intent === "availability_query" || isAskingFreeSlots) {
      const baseMsg = "ทางเราเปิดบริการวันจันทร์-เสาร์ 09:00 - 18:00 น. ครับ (หยุดวันอาทิตย์) ";
      const statusMsg = "ช่วงนี้ยังมีคิวว่างครับ ไม่ทราบว่าคุณลูกค้าสะดวกวันไหนหรือช่วงเวลาไหนดีครับ?";
      return {
          intent: "availability_query", shouldHandoff: false, nextAction: "reply", nextMissingField: "preferred_date",
          capturedFields: {}, retryCount: 0, policyMessage: null, customerReply: baseMsg + statusMsg,
          mergedFields, summary: "Inquired about availability", stateAdvanced: false,
          nextMetadata: { ...meta, last_prompt_type: "booking_date" }
      };
  }

  // 4. Sales Continuity Interception
  const isSalesRoomType = /ห้องนอน|ห้องนั่งเล่น|ห้องรับแขก|ออฟฟิศ|สำนักงาน|ร้านค้า/.test(msgLower);
  if (activeFlow === "sales" && meta.last_prompt_type === "sales_qualify" && isSalesRoomType) {
      mergedFields.usage_context = msgLower;
      return {
          intent: "sales_inquiry", shouldHandoff: false, nextAction: "reply", nextMissingField: "room_size",
          capturedFields: { usage_context: msgLower }, retryCount: 0, policyMessage: null,
          customerReply: `รับทราบครับ ถ้าเป็น${msgLower} รบกวนขอขนาดห้องประมาณกี่ตารางเมตรครับ? เดี๋ยวผมช่วยประเมิน BTU และแนะนำรุ่นที่เหมาะให้ครับ 😊`,
          mergedFields, summary: `Captured room type: ${msgLower}, asking for size`, stateAdvanced: true,
          nextMetadata: { ...meta, last_prompt_type: "sales_qualify" }
      };
  }

  // 4.5 Repair Contamination Guard & Continuity
  const isRepairContamination = isRepairContextCleaningHistory(msgLower, activeFlow, classified.intent);
  if (isRepairContamination) {
      console.log(`[CASE_MANAGER] Repair cleaning history detected: "${msgLower}"`);
      mergedFields.last_cleaning_recency = msgLower;
      // Force keep in repair flow
      activeFlow = "repair";
      meta.active_flow = "repair";
  }

  // (redundant fallback for non-triage paths — real captures happen in REPAIR DIRECT ANSWER EARLY CAPTURES above)

  // 5. Commercial/Duct Continuity Interception
  const isDuctIntent = (classified.intent === "commercial_pricing_query" || activeFlow === "commercial_booking" || /แอร์ดัก|แอร์ต่อท่อ|duct|พาณิชย์|แอร์ 4 ทิศทาง/.test(msgLower)) && !isExplicitFaqPivot(msgLower);
  if (isDuctIntent && !isExplicitPivotText) {
      if (activeFlow !== "commercial_booking") {
          meta.active_flow = "commercial_booking";
          if (!extractedFields.service_type) delete mergedFields.service_type;
          if (!extractedFields.machine_count) delete mergedFields.machine_count;
          if (!extractedFields.btu) delete mergedFields.btu;
          activeFlow = "commercial_booking";
      }
      mergedFields.product_type = "commercial";
      
      const hasService = !!mergedFields.service_type;
      const hasCount = !!mergedFields.machine_count;
      const hasBtu = !!mergedFields.btu;
      const hasImage = !!params.imageBase64;
      
      if (!hasService || !hasCount) {
          return {
              intent: "commercial_pricing_query", shouldHandoff: false, nextAction: "reply", nextMissingField: !hasService ? "service_type" : "machine_count",
              capturedFields: {}, retryCount: 0, policyMessage: null,
              customerReply: "ได้ครับ ถ้าเป็นแอร์ดักท์ ราคาจะขึ้นอยู่กับประเภทงาน ขนาด BTU จำนวนเครื่อง และเงื่อนไขหน้างานครับ รบกวนแจ้งเพิ่มนิดนึงได้ไหมครับว่าเป็นงานล้าง ซ่อม ติดตั้ง หรือย้าย และมีกี่เครื่องครับ",
              mergedFields, summary: "Commercial inquiry: missing service/count", stateAdvanced: true,
              nextMetadata: { ...meta, active_flow: "commercial_booking", last_prompt_type: "none" }
          };
      }
      
      if (!hasBtu && !hasImage) {
          const sLabel = mergedFields.service_type === "cleaning" ? "ล้าง" : 
                         mergedFields.service_type === "repair" ? "ซ่อม" :
                         mergedFields.service_type === "installation" ? "ติดตั้ง" :
                         mergedFields.service_type === "relocation" ? "ย้าย" : "ตรวจเช็ก";
          return {
              intent: "commercial_pricing_query", shouldHandoff: false, nextAction: "reply", nextMissingField: "btu",
              capturedFields: {}, retryCount: 0, policyMessage: null,
              customerReply: `รับทราบครับ เป็นแอร์ดักท์ งาน${sLabel} ${mergedFields.machine_count} เครื่องนะครับ รบกวนขอ BTU หรือรูปป้ายสเปก/รูปหน้างานเพิ่มเติมได้ไหมครับ เดี๋ยวผมช่วยประเมินเบื้องต้นและส่งต่อแอดมินให้ช่วยประเมินราคาต่อครับ`,
              mergedFields, summary: "Commercial inquiry: missing BTU/Image", stateAdvanced: true,
              nextMetadata: { ...meta, active_flow: "commercial_booking", last_prompt_type: "none" }
          };
      }

      return {
          intent: "commercial_pricing_query", shouldHandoff: true, nextAction: "handoff", nextMissingField: null,
          capturedFields: {}, retryCount: 0, policyMessage: null,
          customerReply: "รับทราบครับ ตอนนี้ได้ข้อมูลเบื้องต้นพอประเมินแล้ว เดี๋ยวผมส่งต่อข้อมูลให้แอดมินตรวจสอบคิวและประเมินราคาเพื่อคอนเฟิร์มกลับให้ทางแชทนี้นะครับ",
          mergedFields, summary: "Commercial inquiry: details complete, handing off", stateAdvanced: true,
          nextMetadata: { ...meta, active_flow: "commercial_booking", last_prompt_type: "none" }
      };
  }

  let intent = resolveIntentWithCaseContext({
    existingIntent: existingCase.ai_intent as IntentName,
    existingServiceType: currentCaseFields.service_type as ServiceType,
    missingFields: Array.isArray(existingCase.missing_fields) ? existingCase.missing_fields as string[] : [],
    classifiedIntent: classified.intent,
    messageText: params.messageText,
    extractedFields: mergedFields
  });

  if (isRepairContamination) {
      console.log(`[CASE_MANAGER] Intent Override: Forcing repair_request due to cleaning history context.`);
      intent = "repair_request";
  }

  const summaryText = buildConversationStateSummary(recentMessages, mergedFields);
  const canonical = await loadCanonicalKnowledgeForTurn(params.messageText);
  const aiDecision = await generateAiResponse({
    customerMessage: params.messageText, intent, intentConfidence: classified.confidence, threadSummary: summaryText || null,
    knownFields: mergedFields, knowledge, priceFacts, imageBase64: params.imageBase64,
    availabilityFlowState: availabilityState, policyBlockReason, proposedSlot
  });

  const BOOKING_INTENTS: string[] = ["cleaning_request","repair_request","inspection_request","relocation_request","installation_request","scheduling_request"];
  const isPivotIntent = FLOW_PIVOT_INTENTS.includes(aiDecision.intent) || isExplicitPricingPivot || isAskingFreeSlots || !!canonical;

  const faqStaticReply = canonicalTopic ? getFaqResponse(canonicalTopic) : null;

  let canonicalHandled = false;

  if (faqStaticReply) {
      aiDecision.customer_reply = faqStaticReply;
      aiDecision.intent = canonicalTopic === "contact_info" ? "faq_contact" : "general_inquiry";
      aiDecision.should_handoff = false;
      canonicalHandled = true;
  } else if (!isGenuineGreeting && !isGenuineFarewell && isPivotIntent) {
    const effectiveTopic = canonical?.topic ?? canonicalTopic;
    if (effectiveTopic) {
      if (effectiveTopic === "installation_pricing") {
        aiDecision.customer_reply = `✅ ข้อมูลราคาติดตั้งแอร์เบื้องต้น
🔧 บริการ: ติดตั้งแอร์
📌 แอร์ติดผนัง
• 9,000-18,000 BTU เริ่มต้น 4,500 บาท
• 24,000 BTU เริ่มต้น 5,500 บาท
• 30,000-36,000 BTU เริ่มต้น 6,500 บาท
...หากต้องการให้ช่วยประเมินต่อ รบกวนแจ้งประเภทแอร์, BTU และจำนวนเครื่องได้เลยครับ`;
        aiDecision.intent = "installation_request";
        aiDecision.should_handoff = false;
        canonicalHandled = true;
      } else if (effectiveTopic === "installation_extra_pricing") {
        aiDecision.customer_reply = `✅ ราคาอุปกรณ์ส่วนเกินงานติดตั้งแอร์เป็นค่าใช้จ่ายเพิ่มเติมจากค่าติดตั้งพื้นฐานครับ

ตัวอย่างที่พบบ่อย เช่น ท่อแอร์/สายไฟเกินมาตรฐาน, รางครอบท่อ, ขาแขวน, งานเจาะ/เดินระบบเพิ่ม และอุปกรณ์หน้างานพิเศษ

⚠️ ราคาจริงต้องดูระยะเดินท่อ รุ่นเครื่อง และสภาพหน้างานก่อนครับ

หากต้องการประเมินให้ใกล้เคียง รบกวนส่ง BTU, จำนวนเครื่อง และรูปหน้างานได้เลยครับ 😊`;
        aiDecision.intent = "general_inquiry";
        aiDecision.should_handoff = false;
        canonicalHandled = true;
      } else if (effectiveTopic === "cleaning_pricing") {
        aiDecision.customer_reply = `✅ ข้อมูลราคาล้างแอร์เบื้องต้น (ปี 2026)
🔧 บริการ: ล้างแอร์

📌 แอร์ติดผนัง
• 9,000 BTU = 700 บาท/เครื่อง
• 12,000-13,000 BTU = 800 บาท/เครื่อง
• 18,000 BTU = 900 บาท/เครื่อง
• 24,000 BTU = 1,000 บาท/เครื่อง

📌 แอร์แขวน/ตั้งพื้น
• 12,000-36,000 BTU เริ่มต้น 1,000-2,800 บาท/เครื่อง

📌 แอร์ 4 ทิศทาง (Cassette)
• 20,000-36,000 BTU เริ่มต้น 1,800-3,500 บาท/เครื่อง

📌 แอร์ตู้ตั้ง
• 12,000-30,000 BTU เริ่มต้น 1,200 บาท/เครื่อง

➕ บริการเสริม: น้ำยาฆ่าเชื้อ +100 บาท | Inverter +100 บาท

ต้องการจองล้างเลยไหมครับ?`;
        aiDecision.intent = "cleaning_request";
        mergedFields.service_type = "cleaning";
        aiDecision.should_handoff = false;
        canonicalHandled = true;
      } else if (effectiveTopic === "parts_and_inspection_pricing") {
        aiDecision.customer_reply = `ค่าตรวจเช็กหรือประเมินหน้างาน เริ่มต้น 1,000 บาทครับ

หากตรวจแล้วดำเนินการซ่อมต่อ ค่าตรวจจะรวมในค่าบริการครับ

ส่วนค่าอะไหล่จะขึ้นกับรุ่น ยี่ห้อ และอาการของเครื่อง เช่น แผงวงจร มอเตอร์พัดลม หรือคอมเพรสเซอร์ ซึ่งต้องตรวจหน้างานก่อนยืนยันราคาครับ

หากสะดวก แจ้งยี่ห้อ รุ่น หรืออาการเพิ่มเติมได้เลยครับ เดี๋ยวผมช่วยประเมินเบื้องต้นให้ครับ 😊`;
        aiDecision.intent = "general_inquiry";
        aiDecision.should_handoff = false;
        canonicalHandled = true;
      } else if (effectiveTopic === "inspection_policy") {
        aiDecision.customer_reply = `ค่าตรวจเช็กหรือประเมินหน้างาน เริ่มต้น 1,000 บาทครับ\n\nหากตรวจแล้วดำเนินการซ่อมต่อ ค่าตรวจจะรวมในค่าบริการครับ กรณีตรวจแล้วไม่ซ่อมหรือยังไม่ดำเนินงานต่อ คิดค่าตรวจ 1,000 บาทครับ\n\nต้องการนัดช่างเข้าตรวจเช็กหน้างานไหมครับ? 😊`;
        aiDecision.intent = "inspection_request";
        mergedFields.service_type = "inspection";
        aiDecision.should_handoff = false;
        canonicalHandled = true;
      } else if (effectiveTopic === "repair_not_cold_guidance") {
        const symptoms = mergedFields.symptoms || "";
        const isNegative = /ไม่|no|ไม่มี/.test(msgLower) && msgLower.length < 10;
        const hasSpecificSymptom = symptoms.includes("ลม") || symptoms.includes("เย็น") || symptoms.includes("ร้อน") || isNegative;
        if (!hasSpecificSymptom || symptoms.length < 10) {
          aiDecision.customer_reply = `เบื้องต้นขอเช็กอาการเพิ่มนิดนะครับ ลมออกแต่ไม่เย็นใช่ไหมครับ แล้วคอยล์ร้อนมีลมร้อนหรือมีน้ำหยด/เสียงผิดปกติไหมครับ`;
          aiDecision.missing_fields = ["symptoms"] as any;
        } else if (!mergedFields.last_cleaning_recency) {
          aiDecision.customer_reply = `รับทราบครับ อาการนี้มีแนวโน้มต้องให้ช่างตรวจระบบน้ำยาหรือคอมเพรสเซอร์เพิ่มเติมครับ รบกวนสอบถามนิดนึงว่าล้างแอร์ครั้งล่าสุดประมาณเมื่อไหร่ครับ?`;
          aiDecision.missing_fields = ["last_cleaning_recency"] as any;
        } else {
          aiDecision.customer_reply = `รับทราบครับ อาการนี้มีแนวโน้มต้องให้ช่างตรวจระบบน้ำยาหรือคอมเพรสเซอร์ครับ เดี๋ยวประสานงานให้นัดช่างเข้าไปตรวจเช็กหน้างานเลยดีไหมครับ? ไม่ทราบว่าสะดวกวันไหนครับ?`;
        }
        aiDecision.intent = "repair_request";
        mergedFields.service_type = "repair";
        aiDecision.should_handoff = false;
        canonicalHandled = true;
      } else if (effectiveTopic === "repair_noise_guidance") {
        if (activeFlow !== "repair") {
          resetAllInteractionState(mergedFields, meta);
          activeFlow = "repair";
          meta.active_flow = activeFlow;
          mergedFields.service_type = "repair";
        }
        if (!mergedFields.symptoms || mergedFields.symptoms.length < 20) {
            aiDecision.customer_reply = getNextRepairNoiseQuestion(mergedFields);
            aiDecision.missing_fields = ["symptoms"] as any;
        } else if (!mergedFields.last_cleaning_recency) {
            aiDecision.customer_reply = "รับทราบครับ อาการเสียงดังผิดปกติมักต้องเช็กพัดลมหรือมอเตอร์ครับ ล้างแอร์ล่าสุดประมาณเมื่อไหร่ครับ?";
            aiDecision.missing_fields = ["last_cleaning_recency"] as any;
        } else {
            aiDecision.customer_reply = `รับทราบครับ เดี๋ยวประสานงานให้ช่างเข้าไปเช็กจุดยึดและมอเตอร์หน้างานให้นะครับ ไม่ทราบว่าอยู่แถวไหน และสะดวกวันไหนครับ?`;
        }
        aiDecision.intent = "repair_request";
        mergedFields.service_type = "repair";
        aiDecision.should_handoff = false;
        canonicalHandled = true;
      } else if (effectiveTopic === "relocation_pricing") {
        aiDecision.customer_reply = `✅ ข้อมูลราคาถอด/ย้ายแอร์เบื้องต้น
🔧 บริการ: ถอดและย้ายแอร์

📌 แอร์ติดผนัง
• 13,000-24,000 BTU: ถอด เริ่มต้น 1,000 บาท | ย้ายพร้อมติดตั้ง เริ่มต้น 4,500 บาท
• 36,000 BTU: ถอด เริ่มต้น 1,500 บาท | ย้ายพร้อมติดตั้ง เริ่มต้น 5,000 บาท

📌 แอร์แขวน / 4 ทิศทาง
• 13,000-25,000 BTU: ถอด เริ่มต้น 1,500 บาท | ย้ายพร้อมติดตั้ง เริ่มต้น 8,500 บาท
• 36,000 BTU ขึ้นไป: ถอด เริ่มต้น 2,000 บาท | ย้ายพร้อมติดตั้ง เริ่มต้น 9,500 บาท

⚠️ ราคาจริงอาจเปลี่ยนตามระยะทาง สภาพหน้างาน และอุปกรณ์เพิ่มเติม

ต้องการให้ช่วยประเมินเพิ่มเติม รบกวนแจ้ง BTU และจำนวนเครื่องด้วยครับ 😊`;
        aiDecision.intent = "relocation_request";
        mergedFields.service_type = "relocation";
        aiDecision.should_handoff = false;
        canonicalHandled = true;
      } else if (effectiveTopic === "repair_leak_pricing") {
        aiDecision.customer_reply = `ค่าซ่อมรั่วแอร์พร้อมเติมน้ำยา (รวมค่าแรง) เบื้องต้นครับ

• 9,000-13,000 BTU ติดผนัง: 3,500 บาท | แขวน: 4,000 บาท
• 18,000 BTU ติดผนัง: 3,800 บาท | แขวน: 4,500 บาท
• 24,000 BTU ติดผนัง: 4,000 บาท | แขวน: 4,800 บาท
• 36,000 BTU ติดผนัง: 4,500 บาท | แขวน: 5,500 บาท
• 60,000 BTU แขวน/4 ทิศทาง: 7,500 บาท

⚠️ ราคาจริงอาจเปลี่ยนตามจุดรั่ว ความยากของงาน และอะไหล่ที่ต้องใช้เพิ่ม ต้องตรวจหน้างานก่อนยืนยันครับ

หากต้องการนัดช่างเข้าตรวจ แจ้ง BTU และประเภทเครื่องได้เลยครับ 😊`;
        aiDecision.intent = "general_inquiry";
        aiDecision.should_handoff = false;
        canonicalHandled = true;
      } else if (effectiveTopic === "parts_pricing") {
        aiDecision.customer_reply = `ค่าอะไหล่แอร์เบื้องต้น (ราคาเริ่มต้น อาจเปลี่ยนตามยี่ห้อและรุ่น)

• ค่าตรวจเช็กหน้างาน: 1,000 บาท
• แผงวงจร Non-Inverter: 2,500 บาท | Inverter: 5,000+ บาท
• มอเตอร์พัดลม: 2,200-5,500 บาท
• แคปสตาร์ทคอมฯ: 1,200 บาท | มอเตอร์: 800 บาท
• คอมเพรสเซอร์ 9,000 BTU มือสอง: 5,500 บาท | ใหม่: 7,800 บาท
• คอมเพรสเซอร์ 24,000 BTU มือสอง: 7,500 บาท | ใหม่: 9,500 บาท

⚠️ ราคาอะไหล่เป็นราคาเริ่มต้น อาจเปลี่ยนตามสถานะอะไหล่ในตลาดครับ

หากต้องการประเมินให้ตรงกว่านี้ รบกวนแจ้งยี่ห้อและอาการของเครื่องด้วยครับ 😊`;
        aiDecision.intent = "general_inquiry";
        aiDecision.should_handoff = false;
        canonicalHandled = true;
      }
    }
  }

  let customerReply = finalClean(aiDecision.customer_reply);

  if (canonicalHandled && aiDecision.intent === "general_inquiry") {
      activeFlow = "general";
      meta.active_flow = "general";
  }

  // Guard: if AI returns placeholder "..." or empty, substitute a safe fallback
  if (!customerReply || customerReply === "...") {
      customerReply = "ขออภัยครับ ระบบขัดข้องชั่วคราว กรุณารอสักครู่แล้วลองใหม่ หรือแจ้งได้เลยครับ";
  }

  // REPAIR WORDING SANITIZER & HANDOFF POLICY
  if (activeFlow === "repair" && !(canonicalHandled && hasCanonicalFaqTopic)) {
      customerReply = customerReply.replace(/ล้างแอร์/g, "ซ่อมแอร์").replace(/ล้าง/g, "ซ่อม/ตรวจเช็ก");
      // Block BTU if triage just finished or about to finish
      if (customerReply.includes("BTU") || customerReply.includes("บีทียู")) {
          if (!mergedFields.machine_type) {
              customerReply = "รับทราบครับ แอร์ที่ต้องการให้ซ่อมเป็นแอร์ประเภทไหนครับ? (เช่น ติดผนัง, แขวน, คาสเซ็ท)";
          } else {
              customerReply = customerReply.replace(/\d+,\d+ BTU/g, "").replace(/ขนาด BTU เท่าไหร่|กี่ BTU/g, "รายละเอียดเพิ่มเติม");
          }
      }
      
      // Handoff Policy Guard: NEVER confirm booking, always forward to admin
      if (customerReply.includes("จอง") || customerReply.includes("นัด") || customerReply.includes("ช่างจะเข้าไป") || customerReply.includes("ยืนยัน")) {
          customerReply = customerReply.replace(/จองสำเร็จแล้วครับ/g, "ส่งข้อมูลให้แอดมินตรวจสอบคิวให้นะครับ")
                                       .replace(/นัดหมายเรียบร้อยครับ/g, "บันทึกข้อมูลเบื้องต้นให้แล้วครับ เดี๋ยวแอดมินเช็กคิวแล้วยืนยันกลับอีกครั้งครับ")
                                       .replace(/ช่างจะเข้าไป/g, "เดี๋ยวผมส่งข้อมูลให้แอดมินเช็กคิวแล้วจะแจ้งยืนยันการเข้างานของช่างให้อีกครั้งนะ")
                                       .replace(/(ยืนยัน|สรุป)(วัน|นัด).*?(นะครับ|ใช่ไหมครับ)/g, "เดี๋ยวผมส่งข้อมูลให้แอดมินเช็กคิวแล้วยืนยันกลับอีกครั้งนะครับ")
                                       .replace(/จองวัน.*?เรียบร้อย/g, "บันทึกข้อมูลให้แอดมินเช็กคิวเรียบร้อยครับ");
      }
  }

  // Final check for instruction leakage
  const isInternalLeak = /ระบบควร|ต้องถาม|handoff|แอดมินตรวจสอบ|นอกโซน|พื้นที่พิเศษ|ส่งต่อให้/.test(customerReply);
  if (isInternalLeak) {
      console.warn(`[CASE_MANAGER] Internal leak detected in AI reply: "${customerReply}"`);
      if (activeFlow === "repair") {
          if (!mergedFields.building_type) customerReply = "รบกวนขอทราบประเภทหน้างานด้วยครับ เช่น บ้าน คอนโด หรือตึกแถวครับ? 😊";
          else if (!mergedFields.parking_context) customerReply = "ที่หน้างานมีที่จอดรถไหมครับ?";
          else if (!mergedFields.walking_distance) customerReply = "จากที่จอดรถเดินไกลไหมครับ หรือประมาณกี่เมตรครับ?";
          else customerReply = "รับทราบครับ ขอทราบเบอร์ติดต่อและโลเคชันหน้างานเพิ่มเติมอีกนิดนะครับ เดี๋ยวผมประสานงานแอดมินให้ครับ";
      } else {
          customerReply = "รับทราบข้อมูลครับ รบกวนแจ้งรายละเอียดเพิ่มเติมหรือเบอร์โทรติดต่อไว้ได้เลยครับ 😊";
      }
  }

  const missingForBooking = getMissingBookingFields(mergedFields);
  const hasValidDate = hasNormalizedPreferredDate(mergedFields);
  const hasValidTime = hasExactPreferredTime(mergedFields);
  
  const isSalesTriageIncomplete = activeFlow === "sales" && !mergedFields.room_size;
  const isCommercialTriageIncomplete = aiDecision.intent === "commercial_pricing_query" && (!mergedFields.btu || !mergedFields.machine_count);
  
  const isBookingReady = !isRepairTriageIncomplete && !isSalesTriageIncomplete && !isCommercialTriageIncomplete && missingForBooking.length === 0 && hasValidDate && hasValidTime;

  // REPAIR HARD GATE: Never summary in turn 1 or if triage incomplete
  const minTurnsRequired = activeFlow === "repair" ? 3 : 2;
  const isInitialTurn = recentMessages.length < minTurnsRequired;
  const shouldSuppressSummary = isInitialTurn || isRepairTriageIncomplete;

  if (isBookingReady && !shouldSuppressSummary) {
      const isJustAccepting = (msgLower === "ครับ" || msgLower === "ค่ะ" || msgLower === "โอเค");
      customerReply = isJustAccepting ? "รับทราบครับ ผมรวบรวมข้อมูลส่งต่อแอดมินเพื่อคอนเฟิร์มคิวกลับให้ทางแชทนี้ทันทีครับ ขอบคุณครับ 😊" : buildBookingConfirmationReply(mergedFields);
      aiDecision.customer_reply = customerReply;
      aiDecision.should_handoff = true;
      aiDecision.missing_fields = [];
  } else if (
      BOOKING_INTENTS.includes(aiDecision.intent) &&
      !canonicalHandled &&
      // Don't loop booking triage over FAQ pivots, greetings, or off-topic questions
      !isExplicitPricingPivot &&
      !isGenuineGreeting &&
      classified.intent !== "faq_pricing" &&
      classified.intent !== "general_inquiry" &&
      classified.intent !== "greeting"
  ) {
      const missing = [...missingForBooking];
      if (!hasValidDate && !missing.includes("preferred_date")) missing.push("preferred_date");
      if (!hasValidTime && !missing.includes("preferred_time")) missing.push("preferred_time");
      if (isRepairTriageIncomplete) {
          if (!mergedFields.symptoms) missing.unshift("symptoms");
          else if (!mergedFields.last_cleaning_recency) missing.unshift("last_cleaning_recency");
          else if (!mergedFields.building_type) missing.unshift("building_type");
          else if (!mergedFields.parking_context) missing.unshift("parking_context");
          else if (!mergedFields.walking_distance) missing.unshift("walking_distance");
      }

      const nextTarget = missing[0] as string;
      const question = FIELD_QUESTIONS[nextTarget];

      customerReply = question ?? `รบกวนขอทราบ${nextTarget}เพิ่มเติมอีกนิดนะครับ 😊`;
      if (!question) {
          console.warn(`[CASE_MANAGER] Missing field question for: ${nextTarget}. Using fallback.`);
      }
      aiDecision.customer_reply = customerReply;
      aiDecision.should_handoff = false;
      aiDecision.missing_fields = missing as any;
  }

  const summary = buildSummary({
    customerName: mergedFields.customer_name ?? params.customerName,
    serviceType: mergedFields.service_type ?? null,
    area: mergedFields.area ?? null,
    address: mergedFields.address ?? null,
    symptoms: mergedFields.symptoms ?? null,
    preferredDate: mergedFields.preferred_date ?? null,
    preferredTime: mergedFields.preferred_time_exact ?? mergedFields.preferred_time ?? null,
    missingFields: aiDecision.missing_fields as string[]
  } as any);

  let lastPromptType: ConversationMetadata["last_prompt_type"] = "none";
  const missingField = aiDecision.missing_fields[0] as string;
  if (isBookingReady) lastPromptType = "booking_summary_confirm";
  else if (missingField === "preferred_date") lastPromptType = "booking_date";
  else if (missingField === "preferred_time") lastPromptType = "booking_time";
  else if (missingField === "customer_name") lastPromptType = "booking_name";
  else if (missingField === "phone") lastPromptType = "booking_phone";
  else if (missingField === "area") lastPromptType = "booking_area";
  else if (missingField === "symptoms") lastPromptType = "repair_noise_step";
  else if (missingField === "last_cleaning_recency") lastPromptType = "repair_history_step";
  else if (missingField === "building_type") lastPromptType = "repair_building_step";
  else if (missingField === "parking_context") lastPromptType = "repair_parking_step";
  else if (missingField === "walking_distance") lastPromptType = "repair_parking_distance_step";
  else if (activeFlow === "sales" && missingField === "room_size") lastPromptType = "sales_qualify";

  const nextMetadata: ConversationMetadata = {
      ...meta,
      last_missing_field_asked: missingField as string || null,
      last_interaction_at: new Date().toISOString(),
      last_reply_mode: aiDecision.should_handoff ? "handoff" : (isBookingReady ? "confirm_and_ask" : "ask_missing"),
      active_flow: activeFlow,
      last_prompt_type: lastPromptType,
      awaiting_field: (missingField as any) || null,
      last_resolved_service: mergedFields.service_type || meta.last_resolved_service
  };

  // SANITIZER: Map AI hallucinations to valid enums
  if (aiDecision.missing_fields) {
    aiDecision.missing_fields = aiDecision.missing_fields.map((f: string) => {
      if (f === "date") return "preferred_date";
      if (f === "time") return "preferred_time";
      if (f === "name") return "customer_name";
      return f;
    }) as any;
  }

  const finalDecision = aiDecisionSchema.parse({
    ...aiDecision,
    customer_reply: customerReply
  });

  return {
    intent: finalDecision.intent as IntentName,
    shouldHandoff: finalDecision.should_handoff,
    nextAction: finalDecision.should_handoff ? "handoff" : (isBookingReady ? "reply" : "ask_missing"),
    nextMissingField: (finalDecision.missing_fields[0] as any) || null,
    capturedFields: normalizeScheduleFields(extractedFields, params.messageText),
    retryCount: (meta.clarification_retry_count || 0),
    policyMessage: null,
    customerReply,
    mergedFields,
    summary,
    stateAdvanced: true,
    nextMetadata,
    policyBlockReason
  };

  } catch (error) {
    console.error("[CASE_MANAGER] Fatal error:", error);
    return {
      intent: "general_inquiry", shouldHandoff: false, nextAction: "reply", nextMissingField: null,
      capturedFields: {}, retryCount: 0, policyMessage: "system_error",
      customerReply: "ขออภัยครับ ระบบขัดข้องชั่วคราว รบกวนแจ้งเบอร์โทรไว้ เดี๋ยวแอดมินรีบติดต่อกลับครับ 😊",
      mergedFields: params.metadata?.active_flow === "general" ? {} : (params.metadata as any) || {},
      summary: "System error in processCustomerMessage", stateAdvanced: false,
      nextMetadata: params.metadata || {}
    };
  }
}
