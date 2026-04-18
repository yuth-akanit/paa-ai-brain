import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import type { BookingWebhookPayload } from "@/lib/booking/webhook";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  cleaning: "ล้างแอร์",
  repair: "ซ่อมแอร์",
  inspection: "ตรวจเช็คแอร์",
  relocation: "ย้ายแอร์",
  installation: "ติดตั้งแอร์",
  cold_room: "ห้องเย็น"
};

function formatBookingMessage(payload: BookingWebhookPayload): string {
  const serviceLabel = SERVICE_TYPE_LABELS[payload.service_type] ?? payload.service_type;
  const lines = [
    "🔔 มีการจองงานใหม่!",
    "",
    `ลูกค้า: ${payload.customer_name}`,
    `เบอร์: ${payload.phone}`,
    `ที่อยู่: ${payload.address}`,
    payload.area ? `พื้นที่: ${payload.area}` : null,
    `บริการ: ${serviceLabel}`,
    `จำนวนเครื่อง: ${payload.machine_count} เครื่อง`,
    `วันที่: ${payload.date}`,
    `เวลา: ${payload.time}`,
    payload.symptoms ? `อาการ: ${payload.symptoms}` : null,
    "",
    `Case: ${payload.case_id}`
  ];
  return lines.filter((l) => l !== null).join("\n");
}

async function pushToTarget(to: string, text: string, token: string): Promise<void> {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE push failed for ${to}: ${response.status} ${body}`);
  }
}

export async function POST(request: Request) {
  const env = getEnv();

  const authHeader = request.headers.get("x-ai-gateway-key");
  if (env.AI_GATEWAY_INTERNAL_KEY && authHeader !== env.AI_GATEWAY_INTERNAL_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const targets = (env.LINE_ADMIN_NOTIFY_TARGETS || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (targets.length === 0) {
    console.warn("[ADMIN-BOOKING-WEBHOOK] LINE_ADMIN_NOTIFY_TARGETS is empty — skipping push");
    return NextResponse.json({ ok: true, pushed: 0 });
  }

  const token =
    env.LINE_CHANNEL_ACCESS_TOKEN_PAA_AIR ||
    env.LINE_CHANNEL_ACCESS_TOKEN_P_AND_A_AIR ||
    env.LINE_CHANNEL_ACCESS_TOKEN_PA_COOLING ||
    env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    console.warn("[ADMIN-BOOKING-WEBHOOK] No LINE token available — skipping push");
    return NextResponse.json({ ok: true, pushed: 0 });
  }

  let payload: BookingWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const message = formatBookingMessage(payload);
  const results = await Promise.allSettled(
    targets.map((to) => pushToTarget(to, message, token))
  );

  const pushed = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .filter((r) => r.status === "rejected")
    .map((r) => (r as PromiseRejectedResult).reason?.message);

  if (failed.length > 0) {
    console.error("[ADMIN-BOOKING-WEBHOOK] Some pushes failed", failed);
  }

  console.log(`[ADMIN-BOOKING-WEBHOOK] pushed=${pushed}/${targets.length} case=${payload.case_id}`);
  return NextResponse.json({ ok: true, pushed, failed: failed.length });
}
