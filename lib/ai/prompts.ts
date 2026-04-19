import type { ExtractedCaseFields, IntentName, KnowledgeSearchResult } from "@/lib/types";

type PromptInput = {
  customerMessage: string;
  threadSummary: string | null;
  knownFields: ExtractedCaseFields;
  knowledge: KnowledgeSearchResult[];
  priceFacts: Array<{ serviceCode: string; priceLabel: string; details: string }>;
  businessHoursNote?: string;
  nextFieldToAsk?: string | null;
};

export function buildIntentPrompt(message: string) {
  return `
You classify Thai HVAC customer service intents for PAA Air Service in Thailand.
Return JSON only with keys: intent, confidence, rationale.

Supported intents:
- faq_pricing: User asking about prices, costs, or fees.
- faq_service_area: User asking about service locations or coverage area.
- faq_contact: User asking for contact information, phone number, LINE ID, social media, or how to reach PAA.
- repair_request: AC not cold, broken, leaking.
- inspection_request: General checkup or assessment.
- cleaning_request: Regular AC cleaning OR booking/scheduling a cleaning job.
- relocation_request: Moving AC unit.
- installation_request: Installing a new AC unit or asking about installation cost/process.
- cold_room_request: Specific commercial/large cold room inquiries.
- admin_handoff: User explicitly wanting to talk to a human agent.
- scheduling_request: User asking about availability, appointment, or when the team is free.
- greeting: Simple greetings like hello, hi, sawasdee.
- general_inquiry: Other topics or vague messages.
- closing: Customer saying thank you, acknowledgement, or ok.

Examples:
- "จะจองล้างแอร์ครับ" -> cleaning_request (0.95)
- "รับแถวบางพลีไหมครับ" -> faq_service_area (0.95)
- "ราคาล้างแอร์เท่าไหร่" -> faq_pricing (0.97)
- "แอร์ไม่เย็นครับ" -> repair_request (0.95)
- "ขอคุยกับเจ้าหน้าที่ครับ" -> admin_handoff (0.99)
- "ติดตั้งแอร์ราคาเท่าไหร่" -> installation_request (0.95)

Customer message:
"""${message}"""
`;
}

export function buildExtractionPrompt(message: string, currentFields: ExtractedCaseFields) {
  return `
Extract HVAC entities from Thai text. Return JSON ONLY.

Schema:
0. customer_name: customer's name if explicitly provided
1. phone: Thai mobile/phone number if present
2. area: Thai location/district/province
3. address: fuller job-site address or landmark if the customer gives a specific address
4. machine_count: count of AC units (integer)
5. machine_type: AC unit type. Map as follows:
   - "ติดผนัง", "wall" -> "wall"
   - "4 ทิศทาง", "cassette" -> "cassette"
   - "แขวน", "ตั้งพื้น", "ceiling", "floor" -> "ceiling_floor"
   - "ตู้ตั้ง", "package" -> "package"
   - "cold room", "ห้องเย็น" -> "cold_room"
6. preferred_date: requested service date only
7. preferred_time: requested service time / time window only
8. service_type: One of [cleaning, repair, inspection, relocation, cold_room]
9. symptoms: air conditioning problems
10. urgency: [high, medium, low]

CRITICAL RULES:
- Return ONLY fields that are explicitly mentioned in the current message.
- Do NOT include fields that are not in the current message — omit them entirely.
- NEVER set any field to null, 0, or empty string. Omit it instead.
- Do NOT copy or repeat values from Current Fields into your response.
- If a district name like "บางพลี" appears, extract it into "area".

Current Fields (for reference only — do NOT repeat these in your response):
${JSON.stringify(currentFields)}

Message: """${message}"""
`;
}

const NEXT_FIELD_LABELS: Record<string, string> = {
  customer_name: "ชื่อลูกค้า",
  phone: "เบอร์โทรติดต่อ",
  address: "ที่อยู่หน้างาน",
  area: "พื้นที่/เขต",
  machine_count: "จำนวนเครื่อง",
  preferred_date: "วันที่สะดวก",
  preferred_time: "เวลาที่สะดวก",
  symptoms: "อาการที่พบ",
  service_type: "ประเภทบริการ (ล้าง/ซ่อม/ตรวจ/ย้าย)"
};

export function buildResponsePrompt(input: PromptInput, intent: IntentName) {
  const knownFieldsClean = Object.fromEntries(
    Object.entries(input.knownFields).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
  const hasKnownFields = Object.keys(knownFieldsClean).length > 0;

  // Tell AI exactly what single question to ask next — removes guesswork / checklist tone
  const nextFieldHint = input.nextFieldToAsk
    ? `\nขั้นตอนถัดไป: ถามเฉพาะ "${NEXT_FIELD_LABELS[input.nextFieldToAsk] ?? input.nextFieldToAsk}" เท่านั้น พูดสั้น เป็นธรรมชาติ ไม่ถามอื่น`
    : "";

  // Cap KB and price facts to keep prompt lean
  const relevantKB = input.knowledge.slice(0, 2);
  const relevantPrices = input.priceFacts.slice(0, 12);

  return `คุณคือ "พี่เอ" ผู้ช่วยของ PAA Air Service บุคลิกเป็นกันเอง สุภาพ

กฎหลัก:
- ตอบภาษาไทยธรรมชาติ ลงท้าย "ครับ" อย่าตอบยาว
- ถามทีละ 1 เรื่อง ถามสั้น เป็นธรรมชาติ
- ถ้าลูกค้าให้ข้อมูลมา รับทราบสั้นๆ แล้วถามต่อ
- ห้ามถามซ้ำสิ่งที่รู้แล้ว
- ราคาต้องมาจาก Price Facts เท่านั้น ห้ามแต่ง
- วันอาทิตย์หยุด เปิด จันทร์-เสาร์ 09:00-18:00
- closing intent → customer_reply เป็นค่าว่าง, cold_room/admin_handoff → should_handoff=true${nextFieldHint}

${hasKnownFields ? `รู้แล้ว (ห้ามถามซ้ำ):\n${JSON.stringify(knownFieldsClean, null, 2)}` : ""}

Intent: ${intent}
สถานะสนทนา: ${input.threadSummary ?? "เริ่มต้น"}
ข้อความ: """${input.customerMessage}"""${input.businessHoursNote ? `\n${input.businessHoursNote}` : ""}

${relevantKB.length > 0 ? `ข้อมูลอ้างอิง:\n${JSON.stringify(relevantKB.map(i => ({ title: i.title, content: i.content })), null, 2)}` : ""}
${relevantPrices.length > 0 ? `ราคา:\n${JSON.stringify(relevantPrices, null, 2)}` : ""}

ตอบ JSON: {"customer_reply":"...","intent":"${intent}","confidence":0.9,"should_handoff":false,"missing_fields":[],"extracted_fields":{}}`;
}
