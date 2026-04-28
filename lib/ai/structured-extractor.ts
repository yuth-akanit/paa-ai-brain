import { runJsonCompletion } from "./client";
import { buildExtractionPrompt } from "./prompts";
import { extractedFieldsSchema } from "../schemas";
import type { ExtractedCaseFields } from "../types";
import {
  detectKnownArea,
  hasExplicitAddressLabel,
  hasExplicitNameLabel,
  hasNamePhoneCombo,
  isFrontDoorParkingText,
  looksLikeCompactThaiAddress,
  looksLikeScheduleLabelText,
  looksLikeThaiAddress,
  normalizeInlineText,
  parseLabeledFields,
  splitMeaningfulLines
} from "../cases/conversation-signals";

function heuristicExtract(message: string, currentFields: ExtractedCaseFields = {}): ExtractedCaseFields {
  const nextFields: ExtractedCaseFields = { ...currentFields };
  const normalizedMessage = normalizeInlineText(message);
  const lines = splitMeaningfulLines(message);
  const labeledFields = parseLabeledFields(message);
  const hasExplicitName = hasExplicitNameLabel(message);
  const hasNameCombo = hasNamePhoneCombo(message);
  const hasScheduleLabels = looksLikeScheduleLabelText(message);
  const hasAddressLabel = hasExplicitAddressLabel(message);
  const phoneMatch = message.match(/(0\d{8,9})/);
  const machineMatch = message.match(/(\d+)\s*(เครื่อง|ตัว)/);
  const areaMatch = message.match(/(?:อยู่|แถว|เขต|โซน)\s*([ก-๙A-Za-z0-9\s]+?)(?=(?:\s*(?:ขอ|สะดวก|พรุ่งนี้|วันนี้|ด่วน|รับงาน|ไหม|ครับ|ค่ะ|คะ))|$)/);
  const addressMatch = message.match(/(?:ที่อยู่|หน้างานอยู่ที่|ติดตั้งที่|ทำที่|พิกัด|สถานที่)\s*[:：]?\s*([\s\S]+)/i);
  const preferredDateMatch =
    message.match(/((?:วันนี้|พรุ่งนี้|มะรืน|(?:วัน)?(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์))(?:ที่?นี้|หน้า)?(?:\s*(?:ช่วง)?(?:เช้า|บ่าย|เย็น))?)/) ??
    message.match(/(ช่วง(?:เช้า|บ่าย|เย็น))/);
  
  // Milestone 2: Multi-unit pricing buckets
  const normalizedMachineMessage = message.replace(/(อีกตัว|อีกเครื่อง)/g, "1 เครื่อง");
  
  // Support "2 ติดผนัง" or "ติดผนัง 2" — use [ \t]* (not \s*) to prevent matching across newlines
  // e.g. "ติดผนัง\n9000" must NOT be parsed as type=wall qty=9000 (9000 is BTU, not count)
  const bucketMatches = Array.from(normalizedMachineMessage.matchAll(/(?:(\d+)[ \t]*(?:เครื่อง|ตัว)?[ \t]*(ติดผนัง|wall|cassette|คาสเซ็ท|4 ทิศทาง|แขวน|ceiling|floor|package))|(?:(ติดผนัง|wall|cassette|คาสเซ็ท|4 ทิศทาง|แขวน|ceiling|floor|package)[ \t]*(?:จำนวน|qty)?[ \t]*(\d+))/gi));
  
  // Implicit unknowns: catch remaining count
  const unknownMatches = Array.from(normalizedMachineMessage.matchAll(/(\d+)\s*(?:เครื่อง|ตัว)\s*(?!.*(ติดผนัง|wall|cassette|แขวน|ceiling))/gi));

  const preferredTimeMatch =
    message.match(/((?:เวลา|ตอน)\s*\d{1,2}(?::|\.)?\d{0,2}\s*น\.?|(?:\d{1,2}(?::|\.)\d{2}\s*น\.?)|(?:\d{1,2}\s*โมง(?:เช้า|เย็น)?(?:ครึ่ง)?))/) ??
    message.match(/(?<!ไม่)((?:ช่วง|ตอน)?(?:เช้า|บ่าย|เย็น))/);
  
  // Avoid capturing postal codes as BTU. Require keyword if message is long.
  const btuMatch = message.match(/(\d{4,5})\s*(?:btu|บีทียู)/i) ?? 
                   (!phoneMatch && message.length < 50 ? message.match(/(\d{4,5}(?!.*(?:ตำบล|แขวง|เขต|อำเภอ|จังหวัด)))/) : null);
  const customerNameMatch =
    message.match(/(?:ชื่อ|ผมชื่อ|ดิฉันชื่อ|หนูชื่อ)\s*[:：]?\s*([ก-๙A-Za-z\s]+)/);

  if (customerNameMatch) {
    const candidate = customerNameMatch[1].trim();
    if (candidate.length >= 2 && candidate.length <= 20 && !/[0-9]/.test(candidate)) {
       nextFields.customer_name = candidate;
    }
  }

  // Combined name+phone: "ต้น08502521202" or ".ต้น 085-025-21202" (strip leading punctuation first)
  if (!nextFields.customer_name && !currentFields.customer_name) {
    const cleanedForNamePhone = message.replace(/^[\s.,;:!?'"'""\-]+/, "");
    const namePhoneMatch = cleanedForNamePhone.match(/^(?:คุณ\s*)?([ก-๙A-Za-z]{2,10})\s*(0\d[\d\-]{8,10})$/);
    if (namePhoneMatch) {
      const namePart = namePhoneMatch[1].trim();
      const phonePart = namePhoneMatch[2].replace(/\-/g, "");
      if (!/[ก-๙]/.test(phonePart.slice(0, 1)) && phonePart.length >= 9) {
        nextFields.customer_name = namePart;
        nextFields.phone = phonePart;
      }
    }
  }

  if (phoneMatch) {
    nextFields.phone = phoneMatch[1];
  }

  Object.assign(nextFields, labeledFields);

  for (const line of lines) {
    if (!nextFields.phone) {
      const linePhone = line.match(/(0\d{8,9})/);
      if (linePhone) nextFields.phone = linePhone[1];
    }

    if (!nextFields.preferred_date) {
      const lineDateMatch =
        line.match(/((?:วันนี้|พรุ่งนี้|มะรืน|(?:วัน)?(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์))(?:ที่?นี้|หน้า)?(?:\s*(?:ช่วง)?(?:เช้า|บ่าย|เย็น))?)/) ??
        line.match(/(ช่วง(?:เช้า|บ่าย|เย็น))/);
      if (lineDateMatch) nextFields.preferred_date = lineDateMatch[1].trim();
    }

    if (!nextFields.preferred_time) {
      const lineTimeMatch =
        line.match(/((?:เวลา|ตอน)\s*\d{1,2}(?::|\.)?\d{0,2}\s*น\.?|(?:\d{1,2}(?::|\.)\d{2}\s*น\.?)|(?:\d{1,2}\s*โมง(?:เช้า|เย็น)?(?:ครึ่ง)?))/) ??
        line.match(/(?<!ไม่)((?:ช่วง|ตอน)?(?:เช้า|บ่าย|เย็น))/);
      if (lineTimeMatch) nextFields.preferred_time = lineTimeMatch[1].trim();
    }
  }

  if (machineMatch) {
    nextFields.machine_count = Number(machineMatch[1]);
  }

  if (areaMatch) {
    const areaCandidate = areaMatch[1].trim();
    const areaFiller = /^(แล้ว|ครับ|ค่ะ|คะ|ได้|โอเค|ใช่|เรียบร้อย)$/;
    const areaNoise = /(จอดรถ|ที่จอด|เมตร|เดินไกล|มีที่จอด|ไม่มีที่จอด)/;
    if (areaCandidate.length >= 3 && !areaFiller.test(areaCandidate) && !areaNoise.test(areaCandidate)) {
      nextFields.area = areaCandidate;
    }
  }

  if (addressMatch && (!hasScheduleLabels || hasAddressLabel)) {
    nextFields.address = normalizeInlineText(addressMatch[1]);
  }

  if (!nextFields.address && !hasScheduleLabels && (looksLikeThaiAddress(message) || looksLikeCompactThaiAddress(message))) {
    nextFields.address = normalizedMessage;
  }

  if (!nextFields.area && nextFields.address) {
    const detectedArea = detectKnownArea(nextFields.address);
    if (detectedArea && detectedArea !== "สมุทรปราการ") {
      nextFields.area = detectedArea;
    }
  }

  if (preferredDateMatch && !nextFields.preferred_date) {
    nextFields.preferred_date = preferredDateMatch[1].trim();
  }

  if (preferredTimeMatch && !nextFields.preferred_time) {
    nextFields.preferred_time = preferredTimeMatch[1].trim();
  }

  if (btuMatch && !hasScheduleLabels) {
    nextFields.btu = btuMatch[1];
  }

  if (!hasExplicitName && !hasNameCombo && nextFields.customer_name !== currentFields.customer_name) {
    delete nextFields.customer_name;
  }

  if (hasScheduleLabels && !hasAddressLabel) {
    delete nextFields.address;
  }

  if (bucketMatches.length > 0) {
    const buckets: any[] = [];
    for (const match of bucketMatches) {
      const qty = parseInt(match[1] || match[4]); // match[1] if order (qty, type), match[4] if (type, qty)
      const rawType = (match[2] || match[3]).toLowerCase();

      // Sanity cap: qty >= 100 is almost certainly a BTU value, not a machine count
      // e.g. "ติดผนัง 9000" should be BTU=9000, not 9000 machines
      if (qty >= 100) {
        // Treat it as BTU if no btu captured yet, then skip adding as a bucket
        if (!nextFields.btu) nextFields.btu = String(qty);
        continue;
      }

      let normalizedType: "wall" | "cassette" | "ceiling_floor" | "package" | "unknown" = "unknown";

      if (rawType.includes("ติดผนัง") || rawType.includes("wall")) normalizedType = "wall";
      else if (rawType.includes("cassette") || rawType.includes("คาสเซ็ท") || rawType.includes("4 ทิศทาง")) normalizedType = "cassette";
      else if (rawType.includes("แขวน") || rawType.includes("ceiling") || rawType.includes("floor")) normalizedType = "ceiling_floor";
      else if (rawType.includes("package")) normalizedType = "package";

      buckets.push({ machine_type: normalizedType, quantity: qty, btu: nextFields.btu });
    }

    // Add unknowns if they aren't already covered by a known type match in the same message
    for (const match of unknownMatches) {
        const qty = parseInt(match[1]);
        const totalPatternMatchedQty = buckets.reduce((acc, b) => acc + b.quantity, 0);
        if (qty > totalPatternMatchedQty || nextFields.machine_count === qty) {
             // This is a bit complex for heuristics, but we'll add an unknown bucket if we found a machine count 
             // that isn't fully explained by known buckets
        }
    }
    
    // Simpler heuristic: if "ไม่แน่ใจ" or "ไม่รู้รุ่น" is present, add the remaining machine_count as unknown
    if (message.includes("ไม่แน่ใจ") || message.includes("ไม่รู้รุ่น")) {
        const knownQty = buckets.reduce((acc, b) => acc + b.quantity, 0);
        const totalQty = nextFields.machine_count || bucketMatches.reduce((acc, b) => acc + parseInt(b[1]), 0);
        if (totalQty > knownQty) {
            buckets.push({ machine_type: "unknown", quantity: totalQty - knownQty });
        } else if (message.includes("อีก") && message.match(/(\d+|อีก)(ตัว|เครื่อง)/)) {
             // Handle "อีกเครื่อง" as 1 unknown
             buckets.push({ machine_type: "unknown", quantity: 1 });
        }
    }

    nextFields.pricing_buckets = buckets;
  }

  // REPAIR TRIAGE HEURISTICS
  const buildingMatch = isFrontDoorParkingText(message)
    ? null
    : message.match(/(ตึกแถว|คอนโด|บ้านเดี่ยว|บ้าน|หมู่บ้าน|อพาร์ทเม้นท์|หอพัก|ทาวน์โฮม|ทาวน์เฮ้าส์)/);
  if (buildingMatch) {
      nextFields.building_type = buildingMatch[1];
  }

  const parkingMatch = message.match(/(มีที่จอด|จอดรถได้|จอดริมถนน|ไม่มีที่จอด|จอดห่าง|จอดหน้าบ้าน|จอดในบ้าน)/);
  if (isFrontDoorParkingText(message)) {
      nextFields.parking_context = normalizedMessage;
      nextFields.walking_distance = "หน้างาน";
  } else if (parkingMatch) {
      nextFields.parking_context = parkingMatch[1].includes("ไม่มี") ? "ไม่มีที่จอดรถ" : "มีที่จอดรถ";
  }

  const distanceMatch = message.match(/(\d+)\s+(เมตร|เมตร|m|โล|กิโล|km)/) || message.match(/(เดิน|ไม่ไกล|ใกล้|ห่าง)\s*(\d+)/);
  if (distanceMatch) {
      nextFields.walking_distance = distanceMatch[0].trim();
  }

  const historyMatch = message.match(/(เพิ่ง|พึ่ง|ล้าง|ทำ)\s*(เมื่อ|ไป|ล่าสุด|เดือน|ปี|อาทิตย์|สัปดาห์)\s*([ก-๙0-9]+)/);
  if (historyMatch) {
      nextFields.last_cleaning_recency = historyMatch[0].trim();
  }

  const typeMatch = message.match(/(ติดผนัง|wall|แขวน|ceiling|floor|คาสเซ็ท|cassette|4 ทิศทาง|ตู้ตั้ง|package)/i);
  if (typeMatch) {
      const raw = typeMatch[1].toLowerCase();
      if (raw.includes("ผนัง") || raw.includes("wall")) nextFields.machine_type = "wall";
      else if (raw.includes("แขวน") || raw.includes("ceiling") || raw.includes("floor")) nextFields.machine_type = "ceiling_floor";
      else if (raw.includes("cassette") || raw.includes("คาสเซ็ท") || raw.includes("4 ทิศทาง")) nextFields.machine_type = "cassette";
      else if (raw.includes("package") || raw.includes("ตู้ตั้ง")) nextFields.machine_type = "package";
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

  if (!nextFields.repair_subtype) {
    if (message.includes("ไม่เย็น")) nextFields.repair_subtype = "not_cold";
    else if (message.includes("เสียงดัง") || message.includes("มอเตอร์ดัง") || message.includes("สั่น") || message.includes("ดนตรี")) nextFields.repair_subtype = "noise";
    else if (message.includes("น้ำหยด") || message.includes("รั่ว")) nextFields.repair_subtype = "leak";
    else if (message.includes("กลิ่น")) nextFields.repair_subtype = "smell";
  }

  if (!nextFields.room_size) {
    const rsMatch = message.match(/(\d+(?:\.\d+)?)\s*(ตรม|ตารางเมตร|sqm|sq\.?m)/i);
    if (rsMatch) nextFields.room_size = rsMatch[0];
  }

  if (!nextFields.product_type) {
    if (message.includes("เคลื่อนที่")) nextFields.product_type = "portable";
    else if (message.includes("อะไหล่") || message.includes("มอเตอร์") || message.includes("แผง")) nextFields.product_type = "parts";
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

function mergePricingBuckets(current: any[] = [], incoming: any[] = []): any[] {
  if (!incoming.length) return current;
  const merged = [...current];
  for (const item of incoming) {
    const existingIndex = merged.findIndex(v => v.machine_type === item.machine_type && v.btu === item.btu);
    if (existingIndex > -1) {
      // Overwrite quantity if explicitly provided in new message
      merged[existingIndex] = { ...merged[existingIndex], ...item };
    } else {
      merged.push(item);
    }
  }
  return merged;
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

      const mergedBuckets = mergePricingBuckets(
        mergePricingBuckets(currentFields.pricing_buckets, (heuristicBase as any).pricing_buckets),
        (cleanParsed as any).pricing_buckets
      );

      // Layer: currentFields < heuristic < AI (all non-null)
      const result: any = {
        ...currentFields,
        ...heuristicBase,
        ...cleanParsed,
        pricing_buckets: mergedBuckets.length > 0 ? mergedBuckets : undefined
      };

      // STICKY NAME: Preserve existing name — AI extraction can introduce garbage
      if (currentFields.customer_name) {
        result.customer_name = currentFields.customer_name;
      }
      if (!currentFields.customer_name && !hasExplicitNameLabel(message) && !hasNamePhoneCombo(message)) {
        delete result.customer_name;
      }
      if (looksLikeScheduleLabelText(message) && !hasExplicitAddressLabel(message)) {
        delete result.address;
      }

      // Final name cleanup: Reject sentences captured as names
      if (result.customer_name) {
        const name = result.customer_name;
        const isTooLong = name.length > 25;
        const hasSentenceMarkers = /[.?!ๆ\n]/.test(name) || name.includes("ครับ") || name.includes("ค่ะ") || name.includes("ไหม");
        if (isTooLong || hasSentenceMarkers) {
           console.log(`[EXTRACTOR] Rejecting invalid name: "${name}"`);
           delete result.customer_name;
        }
      }

      return extractedFieldsSchema.parse(result);
    }
  } catch {
    // Fall through to heuristics.
  }

  const finalHeuristicResult: any = {
      ...heuristicBase,
      pricing_buckets: mergePricingBuckets(currentFields.pricing_buckets, (heuristicBase as any).pricing_buckets)
  };
  if (!currentFields.customer_name && !hasExplicitNameLabel(message) && !hasNamePhoneCombo(message)) {
    delete finalHeuristicResult.customer_name;
  }
  if (looksLikeScheduleLabelText(message) && !hasExplicitAddressLabel(message)) {
    delete finalHeuristicResult.address;
  }
  if (!finalHeuristicResult.pricing_buckets?.length) delete finalHeuristicResult.pricing_buckets;

  // Milestone 2 Sync: If machine_count/btu changed and we have exactly one bucket, sync it
  if (finalHeuristicResult.pricing_buckets?.length === 1) {
    if (finalHeuristicResult.machine_count) finalHeuristicResult.pricing_buckets[0].quantity = finalHeuristicResult.machine_count;
    if (finalHeuristicResult.btu) finalHeuristicResult.pricing_buckets[0].btu = finalHeuristicResult.btu;
  }

  return extractedFieldsSchema.parse(finalHeuristicResult);
}
