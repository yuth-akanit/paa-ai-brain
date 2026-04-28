export type ThreadStatus = "open" | "waiting_customer" | "qualified" | "handed_off" | "closed";
export type LeadStatus = "new" | "collecting_info" | "qualified" | "quoted" | "handed_off" | "closed";
export type MessageRole = "customer" | "assistant" | "admin" | "system";
export type HandoffStatus = "pending" | "accepted" | "resolved";
export type ServiceType = "cleaning" | "repair" | "inspection" | "relocation" | "installation" | "cold_room" | "other";
export type IntentName =
  | "faq_pricing"
  | "faq_service_area"
  | "faq_contact"
  | "repair_request"
  | "inspection_request"
  | "cleaning_request"
  | "relocation_request"
  | "installation_request"
  | "cold_room_request"
  | "admin_handoff"
  | "scheduling_request"
  | "greeting"
  | "general_inquiry"
  | "product_availability_query"
  | "sales_inquiry"
  | "relocation_pricing_query"
  | "availability_query"
  | "closing"
  | "commercial_pricing_query"
  | "low_signal_ack";

export type ChannelProvider = "line" | "facebook" | "website" | "instagram";
export type CustomerChannelType = "line" | "messenger" | "phone" | "email";

export type PricingBucket = {
  machine_type: "wall" | "cassette" | "ceiling_floor" | "package" | "duct" | "unknown";
  btu?: string | number | null;
  quantity: number;
};

export type ExtractedCaseFields = {
  customer_name?: string;
  phone?: string;
  area?: string;
  address?: string; // Standard address
  site_context?: string; // e.g. mall, factory, night work
  service_type?: ServiceType;
  machine_count?: number;
  machine_type?: "wall" | "cassette" | "ceiling_floor" | "package" | "duct" | "cold_room";
  btu?: string;
  usage_context?: string; // e.g. bedroom, office
  room_size?: string; // e.g. 20 sqm
  symptoms?: string;
  repair_subtype?: "noise" | "not_cold" | "leak" | "smell" | "unknown";
  preferred_date?: string;
  preferred_date_iso?: string;
  preferred_time?: string;
  preferred_time_exact?: string;
  urgency?: "low" | "medium" | "high";
  last_cleaning_recency?: string;
  building_type?: string;
  parking_context?: string;
  walking_distance?: string;
  product_type?: "wall" | "cassette" | "portable" | "commercial" | "parts" | "unknown";
  need_installation?: boolean;
  pricing_buckets?: PricingBucket[];
};

export type AiDecision = {
  customer_reply: string;
  intent: IntentName;
  confidence: number;
  should_handoff: boolean;
  missing_fields: Array<keyof ExtractedCaseFields | "policy_scope" | "photo_request">;
  extracted_fields: ExtractedCaseFields;
};

export type KnowledgeSearchResult = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  score: number;
};

export type CaseSummaryPayload = {
  caseId: string;
  customerName: string | null;
  phone: string | null;
  area: string | null;
  serviceType: ServiceType | null;
  symptoms: string | null;
  preferredDate: string | null;
  urgency: string | null;
  leadStatus: LeadStatus;
  summary: string;
  handoffReason: string | null;
};

export type AvailabilityPolicyBlockReason =
  | "sunday_closed"
  | "too_soon_same_day"
  | "too_soon_next_day"
  | "slot_unavailable";

export type FinalTurnDecision = {
  intent: IntentName;
  shouldHandoff: boolean;
  nextAction: 
    | "ask_missing" 
    | "clarify" 
    | "policy_explain" 
    | "reply" 
    | "handoff" 
    | "skip_reply" 
    | "confirm_and_ask"
    | "propose_alternative_slot"
    | "reconfirm_slot";
  nextMissingField: keyof ExtractedCaseFields | "policy_scope" | "photo_request" | "room_size" | "usage_context" | "last_cleaning_recency" | "building_type" | "parking_context" | "walking_distance" | "urgency" | null;
  capturedFields: Record<string, unknown>;
  retryCount: number;
  policyMessage: string | null;
  customerReply: string; 
  stateAdvanced: boolean;
  
  // Milestone 1B Policy & Negotiation Fields
  policyBlockReason?: AvailabilityPolicyBlockReason | null;
  proposedSlot?: {
    date: string;
    time: string;
  } | null;
  pendingProposal?: boolean;
  decisionSource?: "normal_orchestration" | "business_fallback" | "system_recovery";
  errorCode?: string | null;

  replyInstructions?: {
    ackStyle?: "brief" | "none";
    retryCount?: number;
  };
};

export type ConversationMetadata = {
  last_missing_field_asked?: string | null;
  clarification_retry_count?: number;
  last_interaction_at?: string | null;

  last_reply_mode?: string | null;
  last_user_turn_resolution?: "captured_field" | "low_signal" | "topic_shift" | "sticker" | "unclear_image" | "data_provision" | null;
  last_successfully_captured_field?: string | null;

  image_clarification_retry_count?: number;
  last_image_clarification_requested_at?: string | null;
  media_flow_state?: "none" | "awaiting_service_label_for_image" | "awaiting_image_retry" | "image_retry_exhausted";
  availability_flow_state?: "none" | "availability_conflict" | "awaiting_alternative_slot" | "proposed_alternative_slot" | "slot_reconfirmation";
  
  // Milestone 1B State
  last_proposed_slot?: { date: string; time: string } | null;
  proposal_source?: "conflict_resolution" | "sunday_closed" | "advance_booking_policy" | null;
  slot_reconfirmation_pending?: boolean;
  policy_block_reason?: AvailabilityPolicyBlockReason | null;
  pending_proposal?: boolean;

  // Milestone 1C: Flow Isolation & Deterministic Confirmation
  active_flow?: "sales" | "repair" | "cleaning_booking" | "relocation_booking" | "installation_booking" | "commercial_booking" | "general";
  last_resolved_service?: ServiceType | null;
  last_prompt_type?:
    | "sales_qualify"
    | "repair_noise_step"
    | "repair_symptoms_step"
    | "repair_history_step"
    | "repair_building_step"
    | "repair_parking_step"
    | "repair_parking_distance_step"
    | "repair_machine_type_step"
    | "repair_machine_count_step"
    | "booking_name"
    | "booking_phone"
    | "booking_area"
    | "booking_date"
    | "booking_time"
    | "booking_summary_confirm"
    | "none";
  awaiting_field?: keyof ExtractedCaseFields | "policy_scope" | "photo_request" | null;
  pending_confirmation?: {
    type: "booking_time_confirm" | "booking_date_confirm" | "summary_confirm" | "sales_interest_confirm" | "relocation_details_confirm";
    value: string;
  } | null;
};
