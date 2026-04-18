import { getEnv } from "@/lib/env";
import { processCustomerMessage } from "@/lib/cases/case-manager";
import { createAuditLog, createConversationMessage, findOrCreateCustomerByChannel, getOrCreateOpenThread, getOrCreateServiceCase, updateThreadState } from "@/lib/db/queries";
import { getMessageContent, replyLineMessage } from "@/lib/line/client";
import { verifyLineSignature } from "@/lib/line/verify-signature";
import { lineWebhookBodySchema } from "@/lib/schemas";
import { jsonResponse } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const env = getEnv();
    const signature = request.headers.get("x-line-signature");

    if (!verifyLineSignature(body, signature, env.LINE_CHANNEL_SECRET)) {
      return jsonResponse(
        {
          error: "invalid_signature"
        },
        { status: 401 }
      );
    }

    const parsedBody = lineWebhookBodySchema.safeParse(JSON.parse(body));

    if (!parsedBody.success) {
      return jsonResponse(
        {
          error: "invalid_payload",
          details: parsedBody.error.flatten()
        },
        { status: 400 }
      );
    }

    for (const event of parsedBody.data.events) {
      if (event.type !== "message" || !event.source.userId) {
        continue;
      }

      const customer = await findOrCreateCustomerByChannel({
        provider: "line",
        externalUserId: event.source.userId
      });
      const thread = await getOrCreateOpenThread(customer.id, "line");
      const serviceCase = await getOrCreateServiceCase(thread.id, customer.id);

      if (thread.status === "handed_off") {
        await createConversationMessage({
          threadId: thread.id,
          caseId: serviceCase.id,
          role: "customer",
          providerMessageId: event.message.id,
          messageText: event.message.type === "text" ? event.message.text : "[Image Sent] ลูกค้ารูปภาพมาให้ดู"
        });

        await updateThreadState({
          threadId: thread.id,
          lastCustomerMessageAt: new Date().toISOString()
        });

        await createAuditLog({
          entityType: "conversation_thread",
          entityId: thread.id,
          action: "line_webhook_handoff_message_buffered",
          payload: {
            lineUserId: event.source.userId,
            messageType: event.message.type
          }
        });

        continue;
      }

      let imageBase64: string | null = null;
      let messageText: string;

      if (event.message.type === "image") {
        imageBase64 = await getMessageContent(event.message.id);
        messageText = "ลูกค้ารูปภาพมาให้ดู";
      } else {
        messageText = event.message.text;
      }

      const result = await processCustomerMessage({
        threadId: thread.id,
        caseId: serviceCase.id,
        customerId: customer.id,
        customerName: customer.display_name,
        channelUserId: event.source.userId,
        messageText,
        imageBase64,
        providerMessageId: event.message.id
      });

      await createAuditLog({
        entityType: "conversation_thread",
        entityId: thread.id,
        action: "line_webhook_processed",
        payload: {
          lineUserId: event.source.userId,
          intent: result.aiDecision.intent,
          handoffId: result.handoffId
        }
      });

      if (event.replyToken && result.aiDecision.customer_reply) {
        await replyLineMessage(event.replyToken, result.aiDecision.customer_reply);
      }
    }

    return jsonResponse({
      ok: true
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "internal_error"
      },
      { status: 500 }
    );
  }
}
