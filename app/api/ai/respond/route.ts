import { NextResponse } from "next/server";
import { aiRespondRequestSchema, aiRespondResponseSchema } from "../../../../lib/schemas";
import { buildSafeHandoffDecision } from "../../../../lib/ai/brain";
import { processCustomerMessage } from "../../../../lib/cases/case-manager";
import { findOrCreateCustomerByChannel, getOrCreateOpenThread, getOrCreateServiceCase, createConversationMessage, updateThreadState, getThreadByIdForCustomer } from "../../../../lib/db/queries";
import { finalClean } from "../../../../lib/utils";
import { getLineProfile } from "../../../../lib/line/profile";
import { updateCustomerProfile } from "../../../../lib/db/queries";
import { describeChannel } from "../../../../lib/line/channel-descriptor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let requestId = `rt_temp_${startedAt}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    console.log(`[AI-RESPOND] route_enter t=0ms`);
    const authHeader = request.headers.get("x-ai-gateway-key");
    const rawBody = await request.json();

    const inboundParse = aiRespondRequestSchema.safeParse(rawBody);
    if (!inboundParse.success) {
      console.warn(`[AI-RESPOND] [${requestId}] invalid_inbound_schema`, inboundParse.error);
      return NextResponse.json(
        buildSafeHandoffDecision({
          reason: "invalid_inbound_schema",
          summary: "Inbound request failed schema validation"
        }),
        { status: 200 }
      );
    }

    const inbound = inboundParse.data;
    requestId = inbound.runtime?.requestId || requestId;
    console.log(`[AI-RESPOND] [${requestId}] after_schema_parse t=${Date.now() - startedAt}ms`);

    const expectedKey = process.env.AI_GATEWAY_INTERNAL_KEY;
    if (!expectedKey || !authHeader || authHeader !== expectedKey) {
      console.warn(`[AI-RESPOND] [${requestId}] unauthorized t=${Date.now() - startedAt}ms`);
      return NextResponse.json(
        buildSafeHandoffDecision({
          reason: "unauthorized_internal_request",
          summary: "Request blocked by internal security gate"
        }),
        { status: 401 }
      );
    }

    // --- Persistence / Write Path ---
    console.log(`[AI-RESPOND] [${requestId}] starting_persistence t=${Date.now() - startedAt}ms`);
    
    let resolvedDisplayName: string | null = null;
    try {
      const profile = await getLineProfile(inbound.channelUserId, {
        channelPlatformId: inbound.channelPlatformId,
        accountKey: inbound.accountKey
      });
      resolvedDisplayName = profile?.displayName?.trim() || null;
    } catch (error) {
      console.warn(`[AI-RESPOND] [${requestId}] profile_prefetch_failed t=${Date.now() - startedAt}ms`, error);
    }

    // 1. Resolve Customer
    const customer = await findOrCreateCustomerByChannel({
      provider: "line",
      externalUserId: inbound.channelUserId,
      displayName: resolvedDisplayName
    });

    // 1.1 Resolve a usable display name before summary/case generation.
    if (resolvedDisplayName && customer.display_name !== resolvedDisplayName) {
      await updateCustomerProfile(customer.id, {
        display_name: resolvedDisplayName,
      });
      customer.display_name = resolvedDisplayName;
    } else if (!customer.display_name || customer.display_name.startsWith("User_")) {
      try {
        const fallbackProfile = await getLineProfile(inbound.channelUserId, {
          channelPlatformId: inbound.channelPlatformId,
          accountKey: inbound.accountKey
        });
        const fallbackDisplayName = fallbackProfile?.displayName?.trim() || null;
        if (fallbackDisplayName) {
          await updateCustomerProfile(customer.id, {
            display_name: fallbackDisplayName,
          });
          customer.display_name = fallbackDisplayName;
        }
      } catch (error) {
        console.warn(`[AI-RESPOND] [${requestId}] profile_recovery_failed t=${Date.now() - startedAt}ms`, error);
      }
    }
    
    // 2. Resolve Thread
    const threadIdInput = inbound.threadId;
    let thread: any;
    if (!threadIdInput) {
      thread = await getOrCreateOpenThread(customer.id, "line");
    } else {
      try {
        thread = await getThreadByIdForCustomer(threadIdInput, customer.id);
      } catch (error) {
        console.warn(`[AI-RESPOND] [${requestId}] invalid_thread_context t=${Date.now() - startedAt}ms`, error);
        return NextResponse.json(
          buildSafeHandoffDecision({
            reason: "invalid_thread_context",
            summary: "Thread does not belong to the resolved customer"
          }),
          { status: 200 }
        );
      }
    }
    const actualThreadId = thread.id;

    // Stamp which LINE OA this thread belongs to (so admin can see which account)
    try {
      const sourceChannel = describeChannel({
        channelPlatformId: inbound.channelPlatformId,
        accountKey: inbound.accountKey
      });
      const existingMeta = (thread.metadata && typeof thread.metadata === "object") ? thread.metadata as Record<string, unknown> : {};
      const existingSource = existingMeta.source_channel as Record<string, unknown> | undefined;
      const needsUpdate =
        !existingSource ||
        existingSource.displayName !== sourceChannel.displayName ||
        existingSource.channelPlatformId !== sourceChannel.channelPlatformId ||
        existingSource.accountKey !== sourceChannel.accountKey;
      if (needsUpdate) {
        await updateThreadState({
          threadId: actualThreadId,
          metadataPatch: { source_channel: sourceChannel }
        });
        thread.metadata = { ...existingMeta, source_channel: sourceChannel };
      }
    } catch (error) {
      console.warn(`[AI-RESPOND] [${requestId}] source_channel_stamp_failed`, error);
    }

    // 3. Resolve Case
    const serviceCase = await getOrCreateServiceCase(actualThreadId, customer.id);

    // 3.1 Human Override Gate: If thread is handed off, save message and EXIT
    if (thread.status === "handed_off") {
      console.log(`[AI-RESPOND] [${requestId}] thread_is_handed_off_silencing_ai t=${Date.now() - startedAt}ms`);
      
      // Still persist the customer message
      await createConversationMessage({
        threadId: actualThreadId,
        caseId: serviceCase.id,
        role: "customer",
        providerMessageId: inbound.sourceEvent.messageId,
        messageText: inbound.customerMessage || ""
      });

      // Update last activity
      await updateThreadState({
        threadId: actualThreadId,
        lastCustomerMessageAt: new Date().toISOString()
      });

      return NextResponse.json({
        ok: true,
        intent: "admin_handoff",
        confidence: 1,
        missing_fields: [],
        extracted_fields: serviceCase.extracted_fields ?? {},
        customer_reply: "",
        recommended_action: "skip_reply",
        should_handoff: true,
        admin_summary: {
          reason: "admin_takeover_active",
          summary: thread.summary || "Thread is currently handled by an admin",
          recommended_next_action: "wait_for_admin_followup"
        },
        decision_meta: { reason: "admin_takeover_active" }
      });
    }

    console.log(`[AI-RESPOND] [${requestId}] before_process t=${Date.now() - startedAt}ms`);
    const processStartedAt = Date.now();
    
    let imageBase64: string | null = null;
    let customerMessage = inbound.customerMessage || "";

    // Sticker messages carry no text — treat as a closing acknowledgment so the bot
    // does not mistake silence for a new conversation start (greeting response).
    if (inbound.sourceEvent.messageType === "sticker") {
      await createConversationMessage({
        threadId: actualThreadId,
        caseId: serviceCase.id,
        role: "customer",
        providerMessageId: inbound.sourceEvent.messageId,
        messageText: "[sticker]"
      });
      return NextResponse.json({
        ok: true,
        intent: "closing",
        confidence: 1.0,
        should_handoff: false,
        missing_fields: [],
        extracted_fields: serviceCase.extracted_fields ?? {},
        customer_reply: "",
        recommended_action: "skip_reply",
        admin_summary: null,
        decision_meta: { reason: "sticker_closing" }
      });
    }

    if (inbound.sourceEvent.messageType === "image") {
      try {
        const { getMessageContent } = await import("@/lib/line/client");
        imageBase64 = await getMessageContent(inbound.sourceEvent.messageId);
        if (!customerMessage) {
          customerMessage = "ลูกค้ารูปภาพมาให้ดู";
        }
      } catch (e) {
        console.error("Failed to download image", e);
      }
    }

    // 4. Process Message (Includes Brain + DB Writes)
    const result = await processCustomerMessage({
      threadId: actualThreadId,
      caseId: serviceCase.id,
      customerId: customer.id,
      customerName: customer.display_name,
      channelUserId: inbound.channelUserId,
      messageText: customerMessage,
      imageBase64: imageBase64,
      providerMessageId: inbound.sourceEvent.messageId,
      requestId
    });

    const processMs = Date.now() - processStartedAt;
    console.log(`[AI-RESPOND] [${requestId}] after_process process_ms=${processMs}ms total_ms=${Date.now() - startedAt}ms`);
    console.log(
      `[AI-RESPOND] [${requestId}] ai_result ${JSON.stringify({
        channelUserId: inbound.channelUserId,
        channelPlatformId: inbound.channelPlatformId ?? null,
        accountKey: inbound.accountKey ?? null,
        messageId: inbound.sourceEvent.messageId,
        customerMessage,
        intent: result.aiDecision.intent,
        confidence: result.aiDecision.confidence,
        should_handoff: result.aiDecision.should_handoff,
        missing_fields: result.aiDecision.missing_fields,
        extracted_fields: result.mergedFields,
        customer_reply: finalClean(result.aiDecision.customer_reply),
        summary: result.summary
      })}`
    );

    // The result from processCustomerMessage contains aiDecision which matches our required format
    let finalCustomerReply = result.aiDecision.customer_reply;

    // Removed hardcoded override to allow AI to provide dynamic prices based on AC type
    if (result.aiDecision.intent === "cold_room_request") {
      finalCustomerReply = "งานห้องเย็นเป็นงานเฉพาะทางที่ต้องให้ช่างเทคนิคประเมินละเอียดก่อนนะครับ เดี๋ยวผมส่งต่อข้อมูลให้เจ้าหน้าที่ติดต่อกลับเพื่อขอรายละเอียดเพิ่มเติมและนัดหมายให้นะครับ";
    }

    const finalResponse = {
      ok: true,
      intent: result.aiDecision.intent,
      confidence: result.aiDecision.confidence,
      should_handoff: result.aiDecision.should_handoff,
      missing_fields: result.aiDecision.missing_fields,
      extracted_fields: result.mergedFields,
      customer_reply: finalClean(finalCustomerReply),
      recommended_action: result.aiDecision.should_handoff ? "handoff_admin" : "reply_customer",
      admin_summary: result.aiDecision.should_handoff ? {
        reason: "ai_requested_handoff",
        summary: result.summary,
        recommended_next_action: "admin_review_and_contact"
      } : null,
      decision_meta: {
        decision_version: "line-runtime-v2-persistent",
        policy_version: "runtime-policy-v1",
        used_fallback: false,
        error_code: null
      }
    };

    const outboundChecked = aiRespondResponseSchema.safeParse(finalResponse);
    if (!outboundChecked.success) {
      console.error(`[AI-RESPOND] [${requestId}] invalid_brain_output total_ms=${Date.now() - startedAt}ms`, outboundChecked.error);
      return NextResponse.json(
        buildSafeHandoffDecision({
          reason: "invalid_brain_output",
          summary: "Brain output failed response schema validation"
        }),
        { status: 200 }
      );
    }

    console.log(
      `[AI-RESPOND] [${requestId}] outbound ${JSON.stringify({
        intent: outboundChecked.data.intent,
        recommended_action: outboundChecked.data.recommended_action,
        should_handoff: outboundChecked.data.should_handoff,
        missing_fields: outboundChecked.data.missing_fields,
        customer_reply: outboundChecked.data.customer_reply
      })}`
    );
    console.log(`[AI-RESPOND] [${requestId}] return_ok action=${outboundChecked.data.recommended_action} total_ms=${Date.now() - startedAt}ms`);
    return NextResponse.json(outboundChecked.data, { status: 200 });

  } catch (error) {
    const totalMs = Date.now() - startedAt;
    console.error(`[AI-RESPOND] [${requestId}] catch total_ms=${totalMs}ms`, error);
    return NextResponse.json(
      buildSafeHandoffDecision({
        reason: "internal_error",
        summary: error instanceof Error ? error.message : "Unhandled exception in /api/ai/respond"
      }),
      { status: 200 }
    );
  }
}
