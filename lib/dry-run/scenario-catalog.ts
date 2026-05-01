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
import regressionThaiName from "@/fixtures/scenarios/regression-thai-name.json";
import regressionPricingFragment from "@/fixtures/scenarios/regression-pricing-fragment.json";
import regressionLowSignal from "@/fixtures/scenarios/regression-low-signal.json";
import regressionMultiField from "@/fixtures/scenarios/regression-multi-field.json";
import regressionStickyFlow from "@/fixtures/scenarios/regression-sticky-flow.json";
import regressionPricingFragments from "@/fixtures/scenarios/regression-pricing-fragments.json";
import regressionImageExhaustion from "@/fixtures/scenarios/regression-image-exhaustion.json";
import milestone1Conflict from "@/fixtures/scenarios/milestone1-availability-conflict.json";
import milestone1ProposedSlotAck from "@/fixtures/scenarios/milestone1-proposed-slot-ack.json";
import m1aSlotUnavailable from "@/fixtures/scenarios/m1a-slot-unavailable.json";
import m1aAcceptAlternative from "@/fixtures/scenarios/m1a-accept-alternative.json";
import m1aSundayClosed from "@/fixtures/scenarios/m1a-sunday-closed.json";
import m1aRejectAndNew from "@/fixtures/scenarios/m1a-reject-and-new.json";
import m2MixedUnits from "@/fixtures/scenarios/m2-mixed-units.json";
import m2QuantityCorrection from "@/fixtures/scenarios/m2-quantity-correction.json";
import m2CumulativeBTU from "@/fixtures/scenarios/m2-cumulative-btu.json";
import m2MixedKnownUnknown from "@/fixtures/scenarios/m2-mixed-known-unknown.json";
import m1bSundayClosed from "@/fixtures/scenarios/m1b-sunday-closed.json";
import m1bTooSoon from "@/fixtures/scenarios/m1b-too-soon.json";
import m1bReconfirm from "@/fixtures/scenarios/m1b-reconfirm.json";
import m1bRejectNewDate from "@/fixtures/scenarios/m1b-reject-new-date.json";
import reproBroadAvailability from "@/fixtures/scenarios/repro-broad-availability.json";
import m1bBroadPricing from "@/fixtures/scenarios/m1b-broad-pricing.json";
import greetingShort from "@/fixtures/scenarios/greeting-short.json";
import reproAddressCapture from "@/fixtures/scenarios/repro-address-capture.json";
import reproAddressDot from "@/fixtures/scenarios/repro-address-dot.json";
import regressionInstallPivot from "@/fixtures/scenarios/regression-install-pivot.json";
import regressionNameDefer from "@/fixtures/scenarios/regression-name-defer.json";
import regressionRepairPivot from "@/fixtures/scenarios/regression-repair-pivot.json";
import regressionCompactAddress from "@/fixtures/scenarios/regression-compact-address.json";
import regressionMultilineContact from "@/fixtures/scenarios/regression-multiline-contact.json";
import regressionMultilineSchedule from "@/fixtures/scenarios/regression-multiline-schedule.json";
import regressionLabeledContact from "@/fixtures/scenarios/regression-labeled-contact.json";
import regressionLabeledSchedule from "@/fixtures/scenarios/regression-labeled-schedule.json";

import type { SimulateInput } from "@/lib/dry-run/simulate";
import type { ExtractedCaseFields, IntentName } from "@/lib/types";

export type ScenarioStatus = "active_contract" | "legacy_to_migrate" | "retired";

export type DryRunScenario = {
  name: string;
  tags?: string[];
  severity?: "critical" | "high" | "normal";
  decision_trace?: string[];
  metadata?: {
    milestone: "m0" | "m1a" | "m1b" | "m2";
    status: ScenarioStatus;
  };
  input: SimulateInput;
  expected: {
    intent: IntentName;
    should_handoff: boolean;
    nextAction?: string;
    policyBlockReason?: string;
    missing_fields: string[];
    extracted_fields?: Partial<ExtractedCaseFields>;
    customer_reply_equals?: string;
    customer_reply_includes?: string[];
    customer_reply_not_includes?: string[];
    handoff_reason: string | null;
    pendingProposal?: boolean;
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
  { ...(faqPrice as any), metadata: { milestone: "m0", status: "legacy_to_migrate" } },
  { ...(faqServiceArea as any), metadata: { milestone: "m0", status: "legacy_to_migrate" } },
  { ...(inspectionRequest as any), metadata: { milestone: "m1a", status: "active_contract" } },
  { ...(relocationRequest as any), metadata: { milestone: "m1a", status: "active_contract" } },
  { ...(repairRequest as any), metadata: { milestone: "m1a", status: "active_contract" } },
  { ...(coldRoomRequest as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(lowConfidence as any), metadata: { milestone: "m0", status: "legacy_to_migrate" } },
  { ...(adminDirectHandoff as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(bookingIntentCleaning as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(greetingNoPriceLeak as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(serviceAreaMaptaphut as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(serviceAreaBangplee as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(closingEmptyReply as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(contextNoRepeatCustomerName as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(regressionThaiName as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(regressionPricingFragment as any), metadata: { milestone: "m2", status: "legacy_to_migrate" } },
  { ...(regressionLowSignal as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(regressionMultiField as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(regressionStickyFlow as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(regressionPricingFragments as any), metadata: { milestone: "m2", status: "active_contract" } },
  { ...(regressionImageExhaustion as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(milestone1Conflict as any), metadata: { milestone: "m1a", status: "active_contract" } },
  { ...(milestone1ProposedSlotAck as any), metadata: { milestone: "m1a", status: "active_contract" } },
  { ...(m1aSlotUnavailable as any), metadata: { milestone: "m1a", status: "active_contract" } },
  { ...(m1aAcceptAlternative as any), metadata: { milestone: "m1a", status: "active_contract" } },
  { ...(m1aSundayClosed as any), metadata: { milestone: "m1a", status: "retired" } },
  { ...(m1aRejectAndNew as any), metadata: { milestone: "m1a", status: "active_contract" } },
  { ...(m2MixedUnits as any), metadata: { milestone: "m2", status: "active_contract" } },
  { ...(m2QuantityCorrection as any), metadata: { milestone: "m2", status: "active_contract" } },
  { ...(m2CumulativeBTU as any), metadata: { milestone: "m2", status: "active_contract" } },
  { ...(m2MixedKnownUnknown as any), metadata: { milestone: "m2", status: "active_contract" } },
  { ...(m1bSundayClosed as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(m1bTooSoon as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(m1bReconfirm as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(m1bRejectNewDate as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(reproBroadAvailability as any), metadata: { milestone: "m1", status: "active_contract" } },
  { ...(m1bBroadPricing as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(greetingShort as any), metadata: { milestone: "m0", status: "active_contract" } },
  { ...(reproAddressCapture as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(reproAddressDot as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(regressionInstallPivot as any), metadata: { milestone: "m2", status: "active_contract" } },
  { ...(regressionNameDefer as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(regressionRepairPivot as any), metadata: { milestone: "m1a", status: "active_contract" } },
  { ...(regressionCompactAddress as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(regressionMultilineContact as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(regressionMultilineSchedule as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(regressionLabeledContact as any), metadata: { milestone: "m1b", status: "active_contract" } },
  { ...(regressionLabeledSchedule as any), metadata: { milestone: "m1b", status: "active_contract" } }
];

export function getDryRunScenario(name: string) {
  return dryRunScenarios.find((scenario) => scenario.name === name) ?? null;
}
