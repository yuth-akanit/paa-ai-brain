export type ThreadStatus = "open" | "waiting_customer" | "qualified" | "handed_off" | "closed";
export type LeadStatus = "new" | "collecting_info" | "qualified" | "quoted" | "handed_off" | "closed";
export type MessageRole = "customer" | "assistant" | "admin" | "system";
export type HandoffStatus = "pending" | "accepted" | "resolved";
export type ServiceType = "cleaning" | "repair" | "inspection" | "relocation" | "cold_room" | "other";
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
  | "closing";

export type ChannelProvider = "line" | "facebook" | "website" | "instagram";

export type ExtractedCaseFields = {
  customer_name?: string;
  phone?: string;
  area?: string;
  address?: string;
  service_type?: ServiceType;
  machine_count?: number;
  machine_type?: "wall" | "cassette" | "ceiling_floor" | "package" | "cold_room";
  symptoms?: string;
  preferred_date?: string;
  preferred_time?: string;
  urgency?: "low" | "medium" | "high";
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
