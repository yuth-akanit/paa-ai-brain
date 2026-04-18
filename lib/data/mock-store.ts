import casesFixture from "@/fixtures/cases.json";
import caseDetailsFixture from "@/fixtures/case-details.json";
import knowledgeFixture from "@/fixtures/knowledge.json";
import pricingFactsFixture from "@/fixtures/pricing-facts.json";
import { dryRunScenarios } from "@/lib/dry-run/scenario-catalog";

type MockCase = Record<string, any>;
type MockCaseDetail = {
  serviceCase: Record<string, any>;
  messages: Array<Record<string, any>>;
};

const scenarioToCaseId: Record<string, string> = {
  repair_request_basic: "mock-case-001",
  cold_room_request_handoff: "mock-case-003",
  faq_price_basic: "mock-case-004",
  inspection_request_basic: "mock-case-005",
  relocation_request_basic: "mock-case-006",
  low_confidence_custom_question: "mock-case-007",
  admin_direct_handoff_basic: "mock-case-008",
  faq_service_area_basic: "mock-case-009"
};

const scenarioLabels: Record<string, string> = {
  repair_request_basic: "ซ่อมแอร์ไม่เย็น",
  cold_room_request_handoff: "ห้องเย็นส่งต่อ",
  faq_price_basic: "ถามราคาล้างแอร์",
  inspection_request_basic: "ขอตรวจหน้างาน",
  relocation_request_basic: "ขอย้ายแอร์",
  low_confidence_custom_question: "คำถาม low confidence",
  admin_direct_handoff_basic: "ลูกค้าขอคุยเจ้าหน้าที่",
  faq_service_area_basic: "ถามพื้นที่ให้บริการ"
};

const extraCases: MockCase[] = [
  {
    id: "mock-case-008",
    customer_id: "mock-customer-008",
    thread_id: "mock-thread-008",
    lead_status: "handed_off",
    service_type: "other",
    ai_intent: "admin_handoff",
    ai_confidence: 0.91,
    extracted_fields: {
      customer_name: "ลูกค้าที่ต้องการคุยคน"
    },
    missing_fields: [],
    summary: "ลูกค้าขอคุยกับเจ้าหน้าที่หรือแอดมินโดยตรง",
    handoff_reason: "customer_requested_human_agent",
    updated_at: "2026-04-15T11:40:00.000Z",
    customers: {
      id: "mock-customer-008",
      display_name: "ลูกค้าที่ต้องการคุยคน",
      phone: null,
      default_area: null
    },
    conversation_threads: {
      id: "mock-thread-008",
      status: "handed_off"
    },
    admin_handoffs: [
      {
        id: "mock-handoff-008",
        handoff_reason: "customer_requested_human_agent",
        status: "pending"
      }
    ]
  },
  {
    id: "mock-case-009",
    customer_id: "mock-customer-009",
    thread_id: "mock-thread-009",
    lead_status: "new",
    service_type: "other",
    ai_intent: "faq_service_area",
    ai_confidence: 0.74,
    extracted_fields: {
      customer_name: "วิทยา",
      area: "บางนา"
    },
    missing_fields: [],
    summary: "ลูกค้าถามว่าพื้นที่บางนารับงานหรือไม่",
    handoff_reason: null,
    updated_at: "2026-04-15T11:46:00.000Z",
    customers: {
      id: "mock-customer-009",
      display_name: "วิทยา",
      phone: null,
      default_area: "บางนา"
    },
    conversation_threads: {
      id: "mock-thread-009",
      status: "open"
    },
    admin_handoffs: []
  }
];

const extraCaseDetails: Record<string, MockCaseDetail> = {
  "mock-case-008": {
    serviceCase: {
      id: "mock-case-008",
      customer_id: "mock-customer-008",
      thread_id: "mock-thread-008",
      lead_status: "handed_off",
      service_type: "other",
      ai_confidence: 0.91,
      summary: "ลูกค้าขอคุยกับเจ้าหน้าที่หรือแอดมินโดยตรง",
      handoff_reason: "customer_requested_human_agent",
      admin_summary: "ลูกค้าร้องขอคุยกับเจ้าหน้าที่โดยตรง ควรให้แอดมินรับช่วงต่อทันที",
      updated_at: "2026-04-15T11:40:00.000Z",
      missing_fields: [],
      extracted_fields: {
        customer_name: "ลูกค้าที่ต้องการคุยคน"
      },
      customers: {
        display_name: "ลูกค้าที่ต้องการคุยคน",
        phone: null
      },
      admin_handoffs: [
        {
          id: "mock-handoff-008",
          handoff_reason: "customer_requested_human_agent",
          status: "pending"
        }
      ]
    },
    messages: [
      {
        id: "mock-msg-015",
        role: "customer",
        message_text: "ขอคุยกับเจ้าหน้าที่หรือแอดมินได้เลยครับ",
        created_at: "2026-04-15T11:34:00.000Z"
      },
      {
        id: "mock-msg-016",
        role: "assistant",
        message_text: "รายละเอียดเคสนี้ต้องให้เจ้าหน้าที่ช่วยตรวจสอบต่อ เดี๋ยวแอดมินประสานกลับพร้อมข้อมูลที่เหมาะสมให้นะครับ",
        created_at: "2026-04-15T11:36:00.000Z"
      }
    ]
  },
  "mock-case-009": {
    serviceCase: {
      id: "mock-case-009",
      customer_id: "mock-customer-009",
      thread_id: "mock-thread-009",
      lead_status: "new",
      service_type: "other",
      ai_confidence: 0.74,
      summary: "ลูกค้าถามว่าพื้นที่บางนารับงานหรือไม่",
      handoff_reason: null,
      updated_at: "2026-04-15T11:46:00.000Z",
      missing_fields: [],
      extracted_fields: {
        customer_name: "วิทยา",
        area: "บางนา"
      },
      customers: {
        display_name: "วิทยา",
        phone: null
      },
      admin_handoffs: []
    },
    messages: [
      {
        id: "mock-msg-017",
        role: "customer",
        message_text: "อยู่บางนา รับงานไหมครับ",
        created_at: "2026-04-15T11:42:00.000Z"
      },
      {
        id: "mock-msg-018",
        role: "assistant",
        message_text: "เมื่อมีลูกค้าสอบถามพื้นที่ให้บริการ ระบบควรถามเขต จังหวัด หรือโลเคชันหน้างานก่อนทุกครั้ง แล้วค่อยส่งต่อให้แอดมินตรวจสอบพื้นที่ให้บริการจริง หากแจ้งเขตหรือจังหวัดได้ ผมจะช่วยเช็กให้อีกครั้งครับ",
        created_at: "2026-04-15T11:44:00.000Z"
      }
    ]
  }
};

function enrichCaseRecord(record: MockCase) {
  const scenario = dryRunScenarios.find((item) => scenarioToCaseId[item.name] === record.id);
  const scenarioName = scenario?.name ?? null;
  const expected = scenario?.expected;

  return {
    ...record,
    scenario_name: scenarioName,
    scenario_label: scenarioName ? scenarioLabels[scenarioName] ?? scenarioName : null,
    should_handoff: expected?.should_handoff ?? record.lead_status === "handed_off",
    recommended_next_action: expected?.admin_summary?.recommended_next_action ?? null,
    customer_reply: expected?.customer_reply_equals ?? expected?.customer_reply_includes?.join(" | ") ?? null,
    channel: record.channel ?? scenario?.input?.channel ?? "line",
    has_missing_fields: (record.missing_fields?.length ?? 0) > 0
  };
}

function enrichCaseDetail(detail: MockCaseDetail) {
  const enrichedServiceCase = enrichCaseRecord(detail.serviceCase);

  return {
    ...detail,
    serviceCase: enrichedServiceCase
  };
}

export const mockScenarioOptions = dryRunScenarios.map((scenario) => ({
  value: scenario.name,
  label: scenarioLabels[scenario.name] ?? scenario.name,
  caseId: scenarioToCaseId[scenario.name]
}));

export const mockScenarioCaseMap = scenarioToCaseId;

export const mockCases: MockCase[] = [...casesFixture, ...extraCases].map((item) => enrichCaseRecord(item as MockCase));

export const mockCaseDetails = Object.fromEntries(
  Object.entries({
    ...caseDetailsFixture,
    ...extraCaseDetails
  }).map(([key, value]) => [key, enrichCaseDetail(value as MockCaseDetail)])
) as Record<string, MockCaseDetail>;

export const mockKnowledgeDocs = knowledgeFixture;
export const mockPricingFacts = pricingFactsFixture;
