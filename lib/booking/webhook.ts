import { getEnv } from "@/lib/env";
import type { ExtractedCaseFields, ServiceType } from "@/lib/types";

export type BookingWebhookPayload = {
  source: "paa-ai-brain";
  case_id: string;
  thread_id: string;
  customer_id: string;
  customer_name: string;
  phone: string;
  address: string;
  date: string;
  time: string;
  service_type: ServiceType;
  machine_count: number;
  area: string | null;
  symptoms: string | null;
  line_user_id: string | null;
};

export const BOOKING_REQUIRED_FIELDS: Array<keyof ExtractedCaseFields> = [
  "customer_name",
  "phone",
  "address",
  "preferred_date",
  "preferred_time",
  "service_type",
  "machine_count"
];

export function getMissingBookingFields(fields: ExtractedCaseFields) {
  return BOOKING_REQUIRED_FIELDS.filter((field) => {
    const value = fields[field];
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim().length === 0;
    return false;
  });
}

export function isBookingReady(fields: ExtractedCaseFields): fields is ExtractedCaseFields & {
  customer_name: string;
  phone: string;
  address: string;
  preferred_date: string;
  preferred_time: string;
  service_type: ServiceType;
  machine_count: number;
} {
  return getMissingBookingFields(fields).length === 0;
}

export async function sendBookingWebhook(payload: BookingWebhookPayload) {
  const env = getEnv();
  const response = await fetch(env.LINE_ADMIN_BOOKING_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send booking webhook: ${response.status} ${body}`);
  }

  const text = await response.text();
  return {
    ok: true,
    responseText: text
  };
}
