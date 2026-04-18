import adminDirectHandoff from "@/fixtures/scenarios/admin-direct-handoff.json";
import bookingIntentCleaning from "@/fixtures/scenarios/booking-intent.json";
import closingEmptyReply from "@/fixtures/scenarios/closing-no-reply.json";
import coldRoomRequest from "@/fixtures/scenarios/cold-room-request.json";
import contextNoRepeatCustomerName from "@/fixtures/scenarios/context-no-repeat.json";
import faqPrice from "@/fixtures/scenarios/faq-price.json";
import faqServiceArea from "@/fixtures/scenarios/faq-service-area.json";
import greetingNoPriceLeak from "@/fixtures/scenarios/greeting-no-price.json";
import inspectionRequest from "@/fixtures/scenarios/inspection-request.json";
import lowConfidence from "@/fixtures/scenarios/low-confidence.json";
import relocationRequest from "@/fixtures/scenarios/relocation-request.json";
import repairRequest from "@/fixtures/scenarios/repair-request.json";
import serviceAreaBangplee from "@/fixtures/scenarios/service-area-bangplee.json";
import serviceAreaMaptaphut from "@/fixtures/scenarios/service-area-maptaphut.json";

import type { SimulateInput } from "@/lib/dry-run/simulate";
import type { ExtractedCaseFields, IntentName } from "@/lib/types";

export type DryRunScenario = {
  name: string;
  tags?: string[];
  severity?: "critical" | "high" | "normal";
  decision_trace?: string[];
  input: SimulateInput;
  expected: {
    intent: IntentName;
    should_handoff: boolean;
    missing_fields: string[];
    extracted_fields?: Partial<ExtractedCaseFields>;
    customer_reply_equals?: string;
    customer_reply_includes?: string[];
    handoff_reason: string | null;
    admin_summary?: {
      reason?: string;
      recommended_next_action?: string;
      summary?: string;
    };
  };
  knowledge_debug?: {
    relevant_knowledge_ids: string[];
    policy_scope: string[];
    pricing_allowed?: boolean;
    booking_allowed?: boolean;
    should_handoff?: boolean;
    hints_for_reply?: string[];
    allowed_answer_types?: string[];
    forbidden_answer_types?: string[];
  };
};

export const dryRunScenarios: DryRunScenario[] = [
  faqPrice as any,
  faqServiceArea as any,
  inspectionRequest as any,
  relocationRequest as any,
  repairRequest as any,
  coldRoomRequest as any,
  lowConfidence as any,
  adminDirectHandoff as any,
  bookingIntentCleaning as any,
  greetingNoPriceLeak as any,
  serviceAreaMaptaphut as any,
  serviceAreaBangplee as any,
  closingEmptyReply as any,
  contextNoRepeatCustomerName as any
];

export function getDryRunScenario(name: string) {
  return dryRunScenarios.find((scenario) => scenario.name === name) ?? null;
}
