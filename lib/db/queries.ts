import { compactObject } from "../utils";
import { createServiceClient } from "./supabase";
import type { AiDecision, CaseSummaryPayload, ChannelProvider, ExtractedCaseFields, HandoffStatus, LeadStatus, ThreadStatus } from "../types";

export async function findOrCreateCustomerByChannel(params: {
  provider: ChannelProvider;
  externalUserId: string;
  displayName?: string | null;
}) {
  const supabase = createServiceClient();
  
  // 1. Get channel first
  const { data: channel, error: channelError } = await supabase
    .from("customer_channels")
    .select("customer_id")
    .eq("provider", params.provider)
    .eq("external_user_id", params.externalUserId)
    .maybeSingle();

  if (channelError) {
    throw new Error(`Failed to fetch customer channel: ${channelError.message}`);
  }

  // 2. If channel exists, fetch customer separately to avoid join errors
  if (channel?.customer_id) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("id", channel.customer_id)
      .single();
    
    if (customer) return customer;
  }

  let customer: any = null;
  let customerError: { message: string } | null = null;

  const baseInsert = await supabase
    .from("customers")
    .insert({
      display_name: params.displayName ?? null
    })
    .select("*")
    .single();

  customer = baseInsert.data;
  customerError = baseInsert.error;

  // Some legacy databases still enforce extra columns such as phone_digits/source.
  if (customerError?.message.includes("phone_digits")) {
    const legacyInsert = await supabase
      .from("customers")
      .insert({
        display_name: params.displayName ?? null,
        phone: null,
        phone_digits: params.externalUserId,
        source: params.provider,
        tags: []
      } as never)
      .select("*")
      .single();

    customer = legacyInsert.data;
    customerError = legacyInsert.error;
  }

  if (customerError) {
    throw new Error(`Failed to create customer: ${customerError.message}`);
  }

  let insertChannelError: { message: string } | null = null;

  const baseChannelInsert = await supabase.from("customer_channels").insert({
    customer_id: customer.id,
    provider: params.provider,
    external_user_id: params.externalUserId
  });

  insertChannelError = baseChannelInsert.error;

  if (insertChannelError?.message.includes("channel_type")) {
    const legacyChannelInsert = await supabase.from("customer_channels").insert({
      customer_id: customer.id,
      provider: params.provider,
      external_user_id: params.externalUserId,
      channel_type: params.provider,
      channel_value: params.externalUserId
    } as never);

    insertChannelError = legacyChannelInsert.error;
  }

  if (insertChannelError?.message.includes("channel_value")) {
    const legacyChannelValueInsert = await supabase.from("customer_channels").insert({
      customer_id: customer.id,
      provider: params.provider,
      external_user_id: params.externalUserId,
      channel_type: params.provider,
      channel_value: params.externalUserId
    } as never);

    insertChannelError = legacyChannelValueInsert.error;
  }

  if (insertChannelError) {
    throw new Error(`Failed to create customer channel: ${insertChannelError.message}`);
  }

  return customer;
}

export async function getOrCreateOpenThread(customerId: string, provider: ChannelProvider) {
  const supabase = createServiceClient();
  const { data: existing, error: existingError } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("customer_id", customerId)
    .eq("channel_provider", provider)
    .in("status", ["open", "waiting_customer", "handed_off"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to fetch thread: ${existingError.message}`);
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: createError } = await supabase
    .from("conversation_threads")
    .insert({
      customer_id: customerId,
      channel_provider: provider,
      status: "open"
    })
    .select("*")
    .single();

  if (createError) {
    throw new Error(`Failed to create thread: ${createError.message}`);
  }

  return created;
}

export async function getThreadById(threadId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch thread by id: ${error.message}`);
  }

  return data;
}

export async function getThreadByIdForCustomer(threadId: string, customerId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("id", threadId)
    .eq("customer_id", customerId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch customer thread by id: ${error.message}`);
  }

  return data;
}

export async function getOrCreateServiceCase(threadId: string, customerId: string) {
  const supabase = createServiceClient();
  const { data: existing, error: existingError } = await supabase
    .from("service_cases")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to fetch case: ${existingError.message}`);
  }

  // If the latest case is closed, don't reuse it — start a fresh case so stale
  // extracted_fields (machine_type, preferred_date, etc.) from the previous
  // completed booking do not contaminate the new conversation.
  if (existing && existing.lead_status !== "closed") {
    return existing;
  }

  const { data: created, error: createdError } = await supabase
    .from("service_cases")
    .insert({
      customer_id: customerId,
      thread_id: threadId,
      lead_status: "new"
    })
    .select("*")
    .single();

  if (createdError) {
    throw new Error(`Failed to create case: ${createdError.message}`);
  }

  return created;
}

export async function getServiceCaseById(caseId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("service_cases").select("*").eq("id", caseId).single();

  if (error) {
    throw new Error(`Failed to fetch service case: ${error.message}`);
  }

  return data;
}

export async function createConversationMessage(params: {
  threadId: string;
  caseId?: string | null;
  role: "customer" | "assistant" | "admin" | "system";
  providerMessageId?: string | null;
  messageText: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({
      thread_id: params.threadId,
      case_id: params.caseId ?? null,
      role: params.role,
      provider_message_id: params.providerMessageId ?? null,
      message_text: params.messageText,
      metadata: params.metadata ?? {}
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create message: ${error.message}`);
  }

  return data;
}

export async function getThreadMessages(threadId: string, limit = 30, caseId?: string) {
  const supabase = createServiceClient();
  let query = supabase
    .from("conversation_messages")
    .select("*")
    .eq("thread_id", threadId);

  // When caseId is provided, scope to the current case only. This prevents
  // messages from previously-closed cases (e.g. a finished booking) from
  // leaking into the AI prompt as stale context.
  if (caseId) {
    query = query.eq("case_id", caseId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch thread messages: ${error.message}`);
  }

  return data ?? [];
}

export async function updateThreadState(params: {
  threadId: string;
  status?: ThreadStatus;
  lastCustomerMessageAt?: string;
  lastAssistantMessageAt?: string;
  summary?: string | null;
  metadataPatch?: Record<string, unknown>;
}) {
  const supabase = createServiceClient();
  const { threadId, lastCustomerMessageAt, lastAssistantMessageAt, metadataPatch, ...rest } = params;

  const updateData: any = { ...compactObject(rest) };
  if (lastCustomerMessageAt) updateData.last_customer_message_at = lastCustomerMessageAt;
  if (lastAssistantMessageAt) updateData.last_assistant_message_at = lastAssistantMessageAt;

  if (metadataPatch && Object.keys(metadataPatch).length > 0) {
    const { data: existing, error: readError } = await supabase
      .from("conversation_threads")
      .select("metadata")
      .eq("id", threadId)
      .single();
    if (readError) {
      throw new Error(`Failed to read thread metadata: ${readError.message}`);
    }
    const prev = (existing?.metadata && typeof existing.metadata === "object") ? existing.metadata : {};
    updateData.metadata = { ...prev, ...metadataPatch };
  }

  const { error } = await supabase
    .from("conversation_threads")
    .update(updateData)
    .eq("id", threadId);

  if (error) {
    throw new Error(`Failed to update thread: ${error.message}`);
  }
}

export async function updateCaseState(params: {
  caseId: string;
  leadStatus?: LeadStatus;
  serviceType?: string | null;
  extractedFields?: ExtractedCaseFields;
  missingFields?: string[];
  aiIntent?: string | null;
  aiConfidence?: number | null;
  summary?: string | null;
  handoffReason?: string | null;
}) {
  const supabase = createServiceClient();
  const { caseId, ...rest } = params;
  const payload = compactObject({
    lead_status: rest.leadStatus,
    service_type: rest.serviceType,
    extracted_fields: rest.extractedFields,
    missing_fields: rest.missingFields,
    ai_intent: rest.aiIntent,
    ai_confidence: rest.aiConfidence,
    summary: rest.summary,
    handoff_reason: rest.handoffReason
  });

  const { error } = await supabase.from("service_cases").update(payload).eq("id", caseId);

  if (error) {
    throw new Error(`Failed to update case: ${error.message}`);
  }
}

export async function listPricingFacts() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("pricing_rules")
    .select("service_code, price_label, details")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch pricing rules: ${error.message}`);
  }

  return (data ?? []).map((item: any) => ({
    serviceCode: item.service_code,
    priceLabel: item.price_label,
    details: item.details
  }));
}

export async function createAdminHandoff(params: {
  caseId: string;
  threadId: string;
  reason: string;
  summaryPayload: CaseSummaryPayload;
  status?: HandoffStatus;
}) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("admin_handoffs")
    .insert({
      case_id: params.caseId,
      thread_id: params.threadId,
      handoff_reason: params.reason,
      summary_payload: params.summaryPayload,
      status: params.status ?? "pending"
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create handoff: ${error.message}`);
  }

  return data;
}

export async function createAuditLog(params: {
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
}) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("audit_logs").insert({
    table_name: params.entityType,
    record_id: params.entityId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    payload: params.payload
  });

  if (error) {
    throw new Error(`Failed to create audit log: ${error.message}`);
  }
}

export async function hasAuditLogAction(entityType: string, entityId: string, action: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("action", action)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch audit log action: ${error.message}`);
  }

  return Boolean(data);
}

export async function getAdminCases(status?: LeadStatus | "all") {
  const supabase = createServiceClient();
  let query = supabase
    .from("service_cases")
    .select(
      `
      *,
      customers(*),
      conversation_threads(*),
      admin_handoffs(*)
    `
    )
    .order("updated_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("lead_status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch admin cases: ${error.message}`);
  }

  return data ?? [];
}

export async function getAdminCaseDetail(caseId: string) {
  const supabase = createServiceClient();
  const { data: serviceCase, error: caseError } = await supabase
    .from("service_cases")
    .select(
      `
      *,
      customers(*),
      conversation_threads(*),
      admin_handoffs(*)
    `
    )
    .eq("id", caseId)
    .single();

  if (caseError) {
    throw new Error(`Failed to fetch case detail: ${caseError.message}`);
  }

  const { data: messages, error: messagesError } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });

  if (messagesError) {
    throw new Error(`Failed to fetch case messages: ${messagesError.message}`);
  }

  return {
    serviceCase,
    messages: messages ?? []
  };
}

export async function getCaseByThreadId(threadId: string) {
  const supabase = createServiceClient();
  const { data: serviceCase, error } = await supabase
    .from("service_cases")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch case by thread: ${error.message}`);
  }
  
  if (!serviceCase) return null;

  // Fetch customer separately
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", serviceCase.customer_id)
    .single();

  return { ...serviceCase, customers: customer };
}

export async function patchAdminCase(caseId: string, payload: Record<string, unknown>) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("service_cases")
    .update(payload)
    .eq("id", caseId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to patch admin case: ${error.message}`);
  }

  return data;
}

export async function updateCustomerProfile(customerId: string, payload: { display_name?: string; phone?: string; default_area?: string }) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("customers").update(compactObject(payload)).eq("id", customerId);

  if (error) {
    throw new Error(`Failed to update customer profile: ${error.message}`);
  }
}

export async function listKnowledgeDocs() {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("knowledge_docs").select("*").order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch knowledge docs: ${error.message}`);
  }

  return data ?? [];
}

export async function createKnowledgeDoc(payload: {
  title: string;
  category: string;
  content: string;
  tags: string[];
  status: "draft" | "published";
}) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("knowledge_docs").insert(payload).select("*").single();

  if (error) {
    throw new Error(`Failed to create knowledge doc: ${error.message}`);
  }

  return data;
}

export async function deleteKnowledgeDoc(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("knowledge_docs").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete knowledge doc: ${error.message}`);
  }
}

export async function getFollowUpCandidates(hoursSinceLastMessage: number = 24) {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - hoursSinceLastMessage * 60 * 60 * 1000).toISOString();

  // Step 1: Get stale cases with their threads
  const { data: cases, error } = await supabase
    .from("service_cases")
    .select(`
      *,
      conversation_threads (*)
    `)
    .in("lead_status", ["new", "collecting_info"])
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(`Failed to fetch follow-up candidates: ${error.message}`);
  }

  if (!cases || cases.length === 0) return [];

  // Step 2: Filter by follow-up count (stored in thread metadata)
  const filtered = cases.filter(c => {
    const thread = c.conversation_threads;
    const meta = (thread as any)?.metadata || {};
    return (meta.follow_up_count || 0) < 2;
  });

  // Step 3: Get LINE channels for these customers
  const customerIds = [...new Set(filtered.map(c => c.customer_id))];
  const { data: channels } = await supabase
    .from("customer_channels")
    .select("*")
    .in("customer_id", customerIds)
    .eq("provider", "line");

  // Step 4: Attach LINE user ID to each candidate
  const channelMap = new Map((channels ?? []).map(ch => [ch.customer_id, ch]));
  return filtered.map(c => ({
    ...c,
    line_channel: channelMap.get(c.customer_id) ?? null
  }));
}

export async function markFollowUpSent(caseId: string, threadId: string, currentMetadata: any = {}) {
  const supabase = createServiceClient();
  const count = (currentMetadata.follow_up_count || 0) + 1;
  const newMetadata = {
    ...currentMetadata,
    follow_up_count: count,
    last_follow_up_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("conversation_threads")
    .update({ metadata: newMetadata })
    .eq("id", threadId);

  if (error) {
    throw new Error(`Failed to update thread metadata for follow-up: ${error.message}`);
  }

  // Also touch the case to update its updated_at
  await supabase.from("service_cases").update({ updated_at: new Date().toISOString() }).eq("id", caseId);
}
