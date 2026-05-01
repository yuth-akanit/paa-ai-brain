import { finalClean } from "@/lib/utils";
import type { ChannelProvider, ExtractedCaseFields, FinalTurnDecision } from "@/lib/types";

export const EXPLICIT_SILENT_REASONS = [
  "admin_takeover_active",
  "duplicate_message",
  "echo_self_message",
  "non_customer_event",
  "shadow_mode_silent",
  "review_only_mode"
] as const;

export type ExplicitSilentReason = (typeof EXPLICIT_SILENT_REASONS)[number];

type PublicRecommendedAction = "reply_customer" | "handoff_admin" | "skip_reply";

type BuildRespondPayloadInput = {
  channel: Extract<ChannelProvider, "facebook" | "line">;
  customerMessage: string;
  messageType?: string | null;
  runtimeMode?: string | null;
  decision: FinalTurnDecision & {
    mergedFields: ExtractedCaseFields;
    summary: string;
    nextMetadata?: unknown;
  };
};

type PublicRespondPayload = {
  ok: true;
  intent: string;
  confidence: number;
  should_handoff: boolean;
  missing_fields: string[];
  extracted_fields: ExtractedCaseFields;
  customer_reply: string;
  recommended_action: PublicRecommendedAction;
  admin_summary: string;
  decision_meta: {
    reason: string;
    retry_count: number;
    state_advanced: boolean;
    captured_fields: Record<string, unknown>;
    metadata: unknown;
    decision_source: string | null | undefined;
    error_code: string | null | undefined;
    raw_next_action: FinalTurnDecision["nextAction"];
    used_reply_fallback: boolean;
  };
};

function isExplicitSilentReason(value: string | null | undefined): value is ExplicitSilentReason {
  return typeof value === "string" && (EXPLICIT_SILENT_REASONS as readonly string[]).includes(value);
}

function toMachineTypeThai(machineType: ExtractedCaseFields["machine_type"]) {
  switch (machineType) {
    case "wall":
      return "แอร์ติดผนัง";
    case "cassette":
      return "แอร์คาสเซ็ท";
    case "ceiling_floor":
      return "แอร์แขวน/ตั้งพื้น";
    case "package":
      return "แอร์แพ็กเกจ";
    case "duct":
      return "แอร์ดักท์";
    case "cold_room":
      return "ห้องเย็น";
    default:
      return "แอร์";
  }
}

function determineSilentReason(input: BuildRespondPayloadInput): ExplicitSilentReason | null {
  const { decision, messageType, runtimeMode } = input;
  const normalizedType = String(messageType || "text").trim().toLowerCase();
  const normalizedRuntimeMode = String(runtimeMode || "").trim().toLowerCase();

  if (decision.policyMessage === "admin_takeover") {
    return "admin_takeover_active";
  }

  if (decision.policyMessage === "duplicate") {
    return "duplicate_message";
  }

  if (decision.policyMessage === "echo") {
    return "echo_self_message";
  }

  if (normalizedRuntimeMode === "shadow_silent") {
    return "shadow_mode_silent";
  }

  if (normalizedRuntimeMode === "review_only") {
    return "review_only_mode";
  }

  if (!["text", "image", "sticker"].includes(normalizedType)) {
    return "non_customer_event";
  }

  return null;
}

function getLastReplyMode(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as { last_reply_mode?: unknown }).last_reply_mode;
  return typeof value === "string" ? value : null;
}

function buildFollowUpQuestion(input: BuildRespondPayloadInput) {
  const { decision } = input;
  const fields = decision.mergedFields || {};

  if (decision.nextMissingField === "machine_type") {
    return "รบกวนแจ้งประเภทแอร์ด้วยครับ เช่น ติดผนัง แขวน หรือคาสเซ็ท เดี๋ยวผมช่วยประเมินให้ต่อครับ";
  }

  if (decision.nextMissingField === "machine_count") {
    return "รบกวนแจ้งจำนวนเครื่องด้วยครับ เดี๋ยวผมช่วยประเมินราคาเบื้องต้นให้ต่อครับ";
  }

  if (decision.nextMissingField === "btu") {
    return "รบกวนแจ้งขนาด BTU ของแต่ละเครื่องด้วยครับ เดี๋ยวผมช่วยเช็กราคาให้ตรงรุ่นครับ";
  }

  if (decision.nextMissingField === "service_type") {
    return "รบกวนแจ้งเพิ่มนิดนึงครับว่าต้องการล้างแอร์ ซ่อมแอร์ หรือติดตั้งครับ";
  }

  if (fields.machine_type && !fields.machine_count) {
    return `รับทราบครับ เป็น${toMachineTypeThai(fields.machine_type)} รบกวนแจ้งจำนวนเครื่องด้วยครับ เดี๋ยวผมช่วยประเมินให้ต่อครับ`;
  }

  if (fields.machine_count && !fields.machine_type) {
    return `รับทราบครับ มี ${fields.machine_count} เครื่อง รบกวนแจ้งประเภทแอร์ด้วยครับ เช่น ติดผนัง แขวน หรือคาสเซ็ทครับ`;
  }

  return buildSafeDefaultReply(input);
}

function buildSafeDefaultReply(input: BuildRespondPayloadInput) {
  const { decision, customerMessage } = input;
  const fields = decision.mergedFields || {};
  const normalizedMessage = customerMessage.toLowerCase();
  const machineTypeLabel = toMachineTypeThai(fields.machine_type);
  const hasCount = typeof fields.machine_count === "number" && Number.isFinite(fields.machine_count);
  const hasType = Boolean(fields.machine_type);
  const hasBtu = Boolean(fields.btu);
  const looksLikePricing =
    decision.intent === "faq_pricing" ||
    /ราคา|เท่าไหร่|กี่บาท|ค่าบริการ|ประเมิน|quote|ราคา\+/.test(customerMessage);
  const looksLikeInstall = /ติดตั้ง|install/.test(normalizedMessage);

  if (decision.shouldHandoff) {
    return "รับทราบครับ เดี๋ยวเจ้าหน้าที่ตรวจสอบรายละเอียดและติดต่อกลับทางแชทนี้นะครับ";
  }

  if (hasType && !hasCount) {
    return `รับทราบครับ เป็น${machineTypeLabel} รบกวนแจ้งจำนวนเครื่องด้วยครับ เดี๋ยวผมช่วยประเมินเบื้องต้นให้ต่อครับ`;
  }

  if (hasCount && !hasType) {
    return `รับทราบครับ มี ${fields.machine_count} เครื่อง รบกวนแจ้งประเภทแอร์ด้วยครับ เช่น ติดผนัง แขวน หรือคาสเซ็ท เดี๋ยวผมช่วยประเมินให้ต่อครับ`;
  }

  if ((hasType || hasCount) && !hasBtu) {
    const countText = hasCount ? ` ${fields.machine_count} เครื่อง` : "";
    return `รับทราบครับ ${hasType ? machineTypeLabel : "แอร์"}${countText} รบกวนแจ้งขนาด BTU ของแต่ละเครื่องด้วยครับ เดี๋ยวผมช่วยเช็กราคาเบื้องต้นให้ครับ`;
  }

  if (looksLikePricing && looksLikeInstall) {
    return "ได้ครับ รบกวนแจ้งเพิ่มนิดนึงว่าเป็นติดตั้งเครื่องใหม่หรือย้ายเครื่องเดิม พร้อมระบุ BTU จำนวนเครื่อง และประเภทแอร์ครับ เดี๋ยวผมช่วยประเมินเบื้องต้นให้ครับ";
  }

  if (looksLikePricing) {
    return "ได้ครับ รบกวนแจ้งประเภทแอร์ ขนาด BTU และจำนวนเครื่องด้วยครับ เดี๋ยวผมช่วยเช็กราคาเบื้องต้นให้ครับ";
  }

  if (decision.intent === "general_inquiry") {
    return "รับทราบครับ รบกวนแจ้งเพิ่มเติมได้เลยครับว่าต้องการล้างแอร์ ซ่อมแอร์ ติดตั้ง หรือสอบถามราคาเรื่องไหน เดี๋ยวผมช่วยต่อให้ครับ";
  }

  return "รับทราบครับ รบกวนขอรายละเอียดเพิ่มเติมอีกนิดได้ไหมครับ เดี๋ยวผมช่วยดูให้ต่อครับ";
}

export function buildPublicAiRespondPayload(input: BuildRespondPayloadInput): PublicRespondPayload {
  const silentReason = determineSilentReason(input);
  const isLive = String(input.runtimeMode || "").trim().toLowerCase() === "live";
  const lastReplyMode = getLastReplyMode(input.decision.nextMetadata);
  const originalReply = finalClean(input.decision.customerReply || "");
  let recommendedAction: PublicRecommendedAction = "reply_customer";
  let reason: string = input.decision.nextAction;
  let customerReply = originalReply;
  let usedReplyFallback = false;

  if (silentReason && input.decision.nextAction === "skip_reply") {
    recommendedAction = "skip_reply";
    reason = silentReason;
    customerReply = "";
  } else {
    if (!customerReply && lastReplyMode === "ask_missing") {
      customerReply = finalClean(buildFollowUpQuestion(input));
      usedReplyFallback = true;
    }

    if (!customerReply) {
      customerReply = finalClean(buildSafeDefaultReply(input));
      usedReplyFallback = true;
    }

    if (!customerReply) {
      customerReply = "รับทราบครับ เดี๋ยวผมช่วยตรวจสอบและตอบกลับให้ต่อครับ";
      usedReplyFallback = true;
    }

    recommendedAction = "reply_customer";
    reason = usedReplyFallback ? "fallback_reply_generated" : input.decision.nextAction;
  }

  if (recommendedAction === "skip_reply" && !isExplicitSilentReason(reason)) {
    customerReply = finalClean(buildSafeDefaultReply(input));
    recommendedAction = "reply_customer";
    reason = "fallback_reply_generated";
    usedReplyFallback = true;
  }

  if (recommendedAction === "reply_customer" && !customerReply) {
    customerReply = "รับทราบครับ เดี๋ยวผมช่วยตรวจสอบและตอบกลับให้ต่อครับ";
    reason = "fallback_reply_generated";
    usedReplyFallback = true;
  }

  if (
    isLive &&
    input.channel === "facebook" &&
    !customerReply &&
    recommendedAction === "skip_reply" &&
    !isExplicitSilentReason(reason)
  ) {
    customerReply = finalClean(buildSafeDefaultReply(input));
    recommendedAction = "reply_customer";
    reason = "fallback_reply_generated";
    usedReplyFallback = true;
  }

  return {
    ok: true,
    intent: input.decision.intent,
    confidence: 1.0,
    should_handoff: input.decision.shouldHandoff,
    missing_fields: input.decision.nextMissingField ? [input.decision.nextMissingField] : [],
    extracted_fields: input.decision.mergedFields,
    customer_reply: customerReply,
    recommended_action: recommendedAction,
    admin_summary: input.decision.summary,
    decision_meta: {
      reason,
      retry_count: input.decision.retryCount,
      state_advanced: input.decision.stateAdvanced,
      captured_fields: input.decision.capturedFields,
      metadata: input.decision.nextMetadata,
      decision_source: input.decision.decisionSource,
      error_code: input.decision.errorCode,
      raw_next_action: input.decision.nextAction,
      used_reply_fallback: usedReplyFallback
    }
  };
}
