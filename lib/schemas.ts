import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

export const extractedFieldsSchema = z.object({
  customer_name: z.string().optional(),
  phone: z.string().max(30).optional(),
  area: z.string().optional(),
  address: z.string().optional(),
  site_context: z.string().optional(),
  service_type: z.enum(["cleaning", "repair", "inspection", "relocation", "installation", "cold_room", "other"]).optional(),
  machine_count: z.number().int().positive().max(200).optional(),
  machine_type: z.enum(["wall", "cassette", "ceiling_floor", "package", "duct", "cold_room"]).optional(),
  symptoms: z.string().optional(),
  repair_subtype: z.enum(["noise", "not_cold", "leak", "smell", "unknown"]).optional(),
  preferred_date: z.string().optional(),
  preferred_date_iso: z.string().optional(),
  preferred_time: z.string().optional(),
  preferred_time_exact: z.string().optional(),
  btu: z.string().optional(),
  urgency: z.enum(["low", "medium", "high"]).optional(),
  room_size: z.string().optional(),
  usage_context: z.string().optional(),
  last_cleaning_recency: z.string().optional(),
  building_type: z.string().optional(),
  parking_context: z.string().optional(),
  walking_distance: z.string().optional(),
  product_type: z.enum(["wall", "cassette", "portable", "commercial", "parts", "unknown"]).optional(),
  need_installation: z.boolean().optional(),
  pricing_buckets: z.array(z.object({
    machine_type: z.enum(["wall", "cassette", "ceiling_floor", "package", "duct", "unknown"]),
    btu: z.union([z.string(), z.number()]).optional().nullable(),
    quantity: z.number().int().positive().default(1)
  })).optional()
});

export const aiDecisionSchema = z.object({
  customer_reply: z.string(),
  intent: z.enum([
    "faq_pricing",
    "faq_service_area",
    "faq_contact",
    "repair_request",
    "inspection_request",
    "cleaning_request",
    "relocation_request",
    "installation_request",
    "cold_room_request",
    "admin_handoff",
    "scheduling_request",
    "greeting",
    "general_inquiry",
    "product_availability_query",
    "sales_inquiry",
    "relocation_pricing_query",
    "availability_query",
    "commercial_pricing_query",
    "closing",
    "low_signal_ack"
  ]),
  confidence: z.number().min(0).max(1),
  should_handoff: z.boolean(),
  missing_fields: z
    .array(
      z.enum([
        "customer_name",
        "phone",
        "area",
        "address",
        "service_type",
        "machine_type",
        "machine_count",
        "site_context",
        "symptoms",
        "repair_subtype",
        "preferred_date",
        "preferred_time",
        "btu",
        "urgency",
        "room_size",
        "product_type",
        "need_installation",
        "policy_scope",
        "photo_request",
        "last_cleaning_recency",
        "building_type",
        "parking_context",
        "walking_distance"
      ])
    )
    .default([]),
  extracted_fields: extractedFieldsSchema.default({})
});

const lineTextMessageSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  text: z.string()
});

const lineImageMessageSchema = z.object({
  id: z.string(),
  type: z.literal("image")
});

export const lineWebhookEventSchema = z.object({
  type: z.literal("message"),
  replyToken: z.string().optional(),
  source: z.object({
    userId: z.string().optional(),
    groupId: z.string().optional(),
    roomId: z.string().optional(),
    type: z.string()
  }),
  message: z.union([lineTextMessageSchema, lineImageMessageSchema]),
  timestamp: z.number()
});

export const lineWebhookBodySchema = z.object({
  destination: z.string().optional(),
  events: z.array(lineWebhookEventSchema)
});

export const adminCasePatchSchema = z.object({
  lead_status: z.enum(["new", "collecting_info", "qualified", "quoted", "handed_off", "closed"]).optional(),
  notes: z.string().optional(),
  admin_summary: z.string().optional()
});

export const adminKnowledgeSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  status: z.enum(["draft", "published"]).default("published")
});

const aiRespondSourceEventSchema = z
  .object({
    replyToken: z.union([nonEmptyString, z.null()]).optional(),
    messageId: z.union([nonEmptyString, z.null()]).optional(),
    messageType: nonEmptyString.optional().default("text"),
    timestamp: z.union([z.number(), z.string(), z.null()]).optional(),
    imageBase64: z.union([z.string(), z.null()]).optional(),
    mediaUrl: z.union([z.string(), z.null()]).optional()
  })
  .passthrough();

const aiRespondRuntimeSchema = z
  .object({
    requestId: z.string().optional(),
    receivedAt: z.string().optional(),
    mode: z.string().optional(),
    runtimeMode: z.enum(["shadow", "live"]).optional()
  })
  .passthrough();

export const aiRespondRequestSchema = z.object({
  channel: z.enum(["line", "facebook"]),
  channelUserId: nonEmptyString,
  channelPlatformId: nonEmptyString,
  accountKey: nonEmptyString,
  threadId: z.union([z.string(), z.null()]).optional(),
  customerMessage: nonEmptyString,
  sourceEvent: aiRespondSourceEventSchema.optional().default({ messageType: "text" }),
  runtime: aiRespondRuntimeSchema.optional()
});

export const aiRespondResponseSchema = z.object({
  ok: z.boolean(),
  intent: z.string(),
  confidence: z.number(),
  should_handoff: z.boolean(),
  missing_fields: z.array(z.string()),
  extracted_fields: z.record(z.any()),
  customer_reply: z.string(),
  recommended_action: z.enum(["reply_customer", "handoff_admin", "skip_reply"]),
  admin_summary: z.object({
    reason: z.string(),
    summary: z.string(),
    recommended_next_action: z.string()
  }).optional().nullable(),
  decision_meta: z.object({
    decision_version: z.string(),
    policy_version: z.string(),
    used_fallback: z.boolean(),
    error_code: z.string().optional().nullable()
  })
});

export const extractRequestSchema = z.object({
  text: z.string().min(1),
  currentFields: z.record(z.any()).default({})
});

export const handoffRequestSchema = z.object({
  caseId: z.string().uuid(),
  reason: z.string().min(1)
});
