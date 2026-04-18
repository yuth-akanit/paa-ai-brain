import { z } from "zod";

export const extractedFieldsSchema = z.object({
  customer_name: z.string().optional(),
  phone: z.string().max(30).optional(),
  area: z.string().optional(),
  address: z.string().optional(),
  service_type: z.enum(["cleaning", "repair", "inspection", "relocation", "cold_room", "other"]).optional(),
  machine_count: z.number().int().positive().max(200).optional(),
  machine_type: z.enum(["wall", "cassette", "ceiling_floor", "package", "cold_room"]).optional(),
  symptoms: z.string().optional(),
  preferred_date: z.string().optional(),
  preferred_time: z.string().optional(),
  urgency: z.enum(["low", "medium", "high"]).optional()
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
    "cold_room_request",
    "admin_handoff",
    "scheduling_request",
    "greeting",
    "general_inquiry",
    "closing"
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
        "machine_count",
        "symptoms",
        "preferred_date",
        "preferred_time",
        "urgency",
        "policy_scope",
        "photo_request"
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

export const aiRespondRequestSchema = z.object({
  channel: z.literal("line"),
  channelUserId: z.string().min(1),
  threadId: z.string().uuid().optional().nullable(),
  customerMessage: z.string().optional().nullable(),
  sourceEvent: z.object({
    replyToken: z.string().min(1).optional(),
    messageId: z.string().min(1),
    timestamp: z.number(),
    messageType: z.string().optional()
  }),
  runtime: z.object({
    requestId: z.string(),
    receivedAt: z.string().datetime(),
    mode: z.string()
  })
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
