import { NextResponse } from "next/server";
import { aiRespondRequestSchema } from "../../../../lib/schemas";
import { processCustomerMessage } from "../../../../lib/cases/case-manager";
import { createConversationMessage, getServiceCase, updateCaseState, updateThreadState } from "../../../../lib/db/queries";
import type { ConversationMetadata } from "../../../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let requestId = `rt_temp_${startedAt}_${Math.random().toString(36).slice(2, 8)}`;
  const isDev = process.env.NODE_ENV !== "production";

  try {
    const authHeader = request.headers.get("x-ai-gateway-key");
    const rawBody = await request.json();

    const inboundParse = aiRespondRequestSchema.safeParse(rawBody);
    if (!inboundParse.success) {
      console.error("[AI-RESPOND] invalid_schema", {
        requestId,
        channel: typeof rawBody?.channel === "string" ? rawBody.channel : null,
        runtimeMode: typeof rawBody?.runtime?.runtimeMode === "string" ? rawBody.runtime.runtimeMode : null,
        issues: inboundParse.error.issues,
        details: isDev ? inboundParse.error.flatten() : undefined
      });
      return NextResponse.json({ ok: false, error: "invalid_schema" }, { status: 400 });
    }

    const inbound = inboundParse.data;
    requestId = inbound.runtime?.requestId || requestId;
    const sourceEvent = {
      ...inbound.sourceEvent,
      messageType: inbound.sourceEvent.messageType || "text"
    };

    const expectedKey = process.env.AI_GATEWAY_INTERNAL_KEY;
    if (!expectedKey || !authHeader || authHeader !== expectedKey) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    console.log(`[AI-RESPOND] Fetching case for provider=${inbound.channel} user=${inbound.channelUserId}`);
    const { serviceCase, thread, customerId } = await getServiceCase(inbound.channelUserId, inbound.channel);
    const actualThreadId = thread.id;

    let imageBase64: string | null = sourceEvent.imageBase64 ?? null;
    let customerMessage = inbound.customerMessage || "";

    if (!imageBase64 && sourceEvent.messageType === "image" && sourceEvent.messageId && inbound.channel === "line") {
      try {
        const { getMessageContent } = await import("@/lib/line/client");
        imageBase64 = await getMessageContent(sourceEvent.messageId);
      } catch (e) {
        console.error("Failed to download image", e);
      }
    }

    // Quick handle for Rich Menu Taps
    const menuCmd = customerMessage.trim().toUpperCase();
    if (menuCmd.startsWith("MENU:") || menuCmd === "POSTBACK:ASK_AI") {
      customerMessage = "[menu_tap]";
    }

    const threadMetadata = (thread.metadata || {}) as ConversationMetadata;

    console.log(`[AI-RESPOND] Processing logic for request ${requestId}`);
    // All logic and routing decisions flow through the Decision Contract in case-manager.
    const decision = await processCustomerMessage({
      threadId: actualThreadId,
      caseId: serviceCase.id,
      customerId,
      customerName: serviceCase.customer_name,
      channelUserId: inbound.channelUserId,
      messageText: customerMessage,
      messageType: sourceEvent.messageType,
      imageBase64,
      providerMessageId: sourceEvent.messageId ?? null,
      requestId,
      metadata: threadMetadata
    });

    console.log(`[AI-RESPOND] Done processing. Updating state...`);
    await updateCaseState({
      caseId: serviceCase.id,
      aiIntent: decision.intent,
      extractedFields: decision.mergedFields,
      missingFields: (decision.nextAction === "confirm_and_ask" || decision.nextAction === "ask_missing") && decision.nextMissingField ? [decision.nextMissingField] : [],
      leadStatus: decision.shouldHandoff ? "handed_off" : (decision.nextAction === "reply" && !decision.nextMissingField ? "qualified" : "collecting_info"),
      summary: decision.summary
    });

    await updateThreadState({
      threadId: actualThreadId,
      metadata: decision.nextMetadata as any
    });

    if (decision.customerReply) {
      await createConversationMessage({
        threadId: actualThreadId,
        caseId: serviceCase.id,
        role: "assistant",
        messageText: decision.customerReply
      });
    }

    console.log(`[AI-RESPOND] Successfully completed request ${requestId}`);

    return NextResponse.json({
      ok: true,
      intent: decision.intent,
      confidence: 1.0,
      should_handoff: decision.shouldHandoff,
      missing_fields: decision.nextMissingField ? [decision.nextMissingField] : [],
      extracted_fields: decision.mergedFields,
      customer_reply: decision.customerReply,
      recommended_action: decision.nextAction === "skip_reply" ? "skip_reply" : "reply_customer",
      admin_summary: decision.summary,
      decision_meta: { 
        reason: decision.nextAction,
        retry_count: decision.retryCount,
        state_advanced: decision.stateAdvanced,
        captured_fields: decision.capturedFields,
        metadata: decision.nextMetadata,
        decision_source: decision.decisionSource,
        error_code: decision.errorCode
      }
    });

  } catch (error) {
    console.error(`[AI-RESPOND] [${requestId}] critical_failure`, error);
    return NextResponse.json({
      ok: true,
      intent: "general_inquiry",
      should_handoff: true,
      customer_reply: "ขออภัยครับ ระบบขัดข้องชั่วคราว เดี๋ยวเจ้าหน้าที่ติดต่อกลับนะครับ",
      recommended_action: "handoff"
    });
  }
}
