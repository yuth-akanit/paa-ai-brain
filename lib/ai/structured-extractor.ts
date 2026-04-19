import { runJsonCompletion } from "./client";
import { buildExtractionPrompt } from "./prompts";
import { extractedFieldsSchema } from "../schemas";
import type { ExtractedCaseFields } from "../types";

function heuristicExtract(message: string, currentFields: ExtractedCaseFields = {}): ExtractedCaseFields {
  const nextFields: ExtractedCaseFields = { ...currentFields };
  const phoneMatch = message.match(/(0\d{8,9})/);
  const machineMatch = message.match(/(\d+)\s*(เครื่อง|ตัว)/);
  const areaMatch = message.match(/(?:อยู่|แถว|เขต|โซน|ที่)\s*([ก-๙A-Za-z0-9\s]+?)(?=(?:\s*(?:ขอ|สะดวก|พรุ่งนี้|วันนี้|ด่วน|รับงาน|ไหม|ครับ|ค่ะ|คะ))|$)/);
  const addressMatch = message.match(/(?:ที่อยู่|หน้างานอยู่ที่|ติดตั้งที่|ทำที่)\s*[:：]?\s*([^\n\r]+)/);
  const preferredDateMatch =
    message.match(/((?:วันนี้|พรุ่งนี้|มะรืน|วัน(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์))(?:ที่?นี้)?(?:\s*(?:ช่วง)?(?:เช้า|บ่าย|เย็น))?)/) ??
    message.match(/(ช่วง(?:เช้า|บ่าย|เย็น))/);
  const preferredTimeMatch =
    message.match(/((?:เวลา|ตอน)\s*\d{1,2}(?::|\.)?\d{0,2}\s*น\.?|(?:\d{1,2}(?::|\.)\d{2}\s*น\.?)|(?:\d{1,2}\s*โมง(?:เช้า|เย็น)?(?:ครึ่ง)?))/) ??
    message.match(/(ช่วง(?:เช้า|บ่าย|เย็น))/);
  const customerNameMatch =
    message.match(/(?:ชื่อ|ผมชื่อ|ดิฉันชื่อ|หนูชื่อ)\s*[:：]?\s*([ก-๙A-Za-z\s]+)/);

  if (customerNameMatch && !nextFields.customer_name) {
    nextFields.customer_name = customerNameMatch[1].trim();
  }

  // Context-aware: if service already known and message looks like a standalone Thai name
  if (!nextFields.customer_name && currentFields.service_type) {
    const trimmed = message.trim();
    const SKIP_WORDS = ["โอเค","ได้","ครับ","ค่ะ","คะ","ใช่","เดี๋ยว","รับทราบ","ล้าง","ซ่อม","ตรวจ","ย้าย","ราคา","สวัสดี","ขอบคุณ","ไม่","ok","yes","no"];
    const words = trimmed.split(/\s+/).filter(Boolean);
    const isShortThai = words.length >= 1 && words.length <= 3 && /^[ก-๙\s]+$/.test(trimmed);
    const hasSkipWord = words.some(w => SKIP_WORDS.includes(w.toLowerCase()));
    if (isShortThai && !hasSkipWord) {
      nextFields.customer_name = trimmed;
    }
  }

  if (phoneMatch && !nextFields.phone) {
    nextFields.phone = phoneMatch[1];
  }

  if (machineMatch && !nextFields.machine_count) {
    nextFields.machine_count = Number(machineMatch[1]);
  }

  if (areaMatch && !nextFields.area) {
    nextFields.area = areaMatch[1].trim();
  }

  if (addressMatch && !nextFields.address) {
    nextFields.address = addressMatch[1].trim();
  }

  if (preferredDateMatch && !nextFields.preferred_date) {
    nextFields.preferred_date = preferredDateMatch[1].trim();
  }

  if (preferredTimeMatch && !nextFields.preferred_time) {
    nextFields.preferred_time = preferredTimeMatch[1].trim();
  }

  if (!nextFields.address && nextFields.area) {
    nextFields.address = nextFields.area;
  }

  if (!nextFields.service_type) {
    if (message.includes("ล้าง")) {
      nextFields.service_type = "cleaning";
    } else if (message.includes("ซ่อม") || message.includes("ไม่เย็น") || message.includes("เสีย")) {
      nextFields.service_type = "repair";
    } else if (message.includes("ตรวจ") || message.includes("เช็ค")) {
      nextFields.service_type = "inspection";
    } else if (message.includes("ย้าย")) {
      nextFields.service_type = "relocation";
    } else if (message.includes("ห้องเย็น")) {
      nextFields.service_type = "cold_room";
    }
  }

  if (!nextFields.symptoms && (message.includes("ไม่เย็น") || message.includes("น้ำหยด") || message.includes("เสียงดัง"))) {
    nextFields.symptoms = message;
  }

  // machine_type: ALWAYS detect from the CURRENT message and override previous value.
  // This prevents an old case value (e.g. "cassette") from contaminating a new inquiry
  // where the customer explicitly mentions a different type (e.g. "ติดผนัง").
  const detectedMachineType = (() => {
    if (message.includes('4 ทิศทาง') || message.includes('cassette') || message.includes('คาสเซ็ท')) return 'cassette';
    if (message.includes('แขวน') || message.includes('ตั้งพื้น') || message.includes('ceiling')) return 'ceiling_floor';
    if (message.includes('ตู้ตั้ง') || message.includes('package')) return 'package';
    if (message.includes('ติดผนัง') || message.includes('wall')) return 'wall';
    return null;
  })();
  if (detectedMachineType) {
    // Explicit mention in message → always override
    nextFields.machine_type = detectedMachineType;
  }
  // If nothing detected in message, keep whatever was in currentFields (nextFields already has it)

  if (!nextFields.urgency) {
    if (message.includes("ด่วน")) {
      nextFields.urgency = "high";
    } else if (message.includes("วันนี้") || message.includes("พรุ่งนี้")) {
      nextFields.urgency = "medium";
    }
  }

  return extractedFieldsSchema.parse(nextFields);
}

export async function extractStructuredFields(message: string, currentFields: ExtractedCaseFields = {}, imageBase64?: string | null, options?: { disableRemote?: boolean }) {
  // Always compute heuristic baseline first — it handles things like short name detection
  // and is used as a fallback if the remote AI misses fields.
  const heuristicBase = heuristicExtract(message, currentFields);

  try {
    const raw = await runJsonCompletion(buildExtractionPrompt(message, currentFields), { ...options, imageBase64 });

    if (raw) {
      const parsed = JSON.parse(raw);
      // Strip null / empty-string values that the AI returns for "not found" fields.
      // These must NEVER override already-known values from currentFields or heuristic.
      const cleanParsed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v !== null && v !== undefined && v !== "" && v !== 0) {
          cleanParsed[k] = v;
        }
      }
      // Layer: currentFields < heuristic < AI (all non-null)
      return extractedFieldsSchema.parse({
        ...currentFields,
        ...heuristicBase,
        ...cleanParsed
      });
    }
  } catch {
    // Fall through to heuristics.
  }

  return heuristicBase;
}
