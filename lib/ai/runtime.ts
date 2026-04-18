import { findOrCreateCustomerByChannel, getOrCreateOpenThread, getOrCreateServiceCase, getCaseByThreadId } from "../db/queries";
import { processCustomerMessage } from "../cases/case-manager";
import type { ChannelProvider } from "../types";

export type RuntimeIdentify = 
  | { threadId: string }
  | { provider: ChannelProvider; externalUserId: string; displayName?: string };

export async function processRuntimeMessage(
  id: RuntimeIdentify,
  messageText: string,
  providerMessageId?: string
) {
  let threadId: string;
  let caseId: string;
  let customerId: string;
  let customerName: string | null = null;

  if ("threadId" in id) {
    // Basic context if we already have the thread
    const serviceCase = await getCaseByThreadId(id.threadId);
    threadId = id.threadId;
    caseId = serviceCase.id;
    customerId = serviceCase.customer_id;
    // Note: in a more complex app, we'd fetch the customer name here if needed
  } else {
    // Identity resolution for external providers (LINE, n8n, etc)
    const customer = await findOrCreateCustomerByChannel({
      provider: id.provider,
      externalUserId: id.externalUserId
    });
    
    const thread = await getOrCreateOpenThread(customer.id, id.provider);
    const serviceCase = await getOrCreateServiceCase(thread.id, customer.id);
    
    threadId = thread.id;
    caseId = serviceCase.id;
    customerId = customer.id;
    customerName = id.displayName || customer.display_name || null;
  }

  return processCustomerMessage({
    threadId,
    caseId,
    customerId,
    customerName,
    channelUserId: "externalUserId" in id ? id.externalUserId : null,
    messageText,
    providerMessageId
  });
}
