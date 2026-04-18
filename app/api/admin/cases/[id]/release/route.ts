import { createServiceClient } from "@/lib/db/supabase";
import { jsonResponse } from "@/lib/utils";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  // หา thread จาก case
  const { data: serviceCase } = await supabase
    .from("service_cases")
    .select("thread_id")
    .eq("id", id)
    .single();

  if (!serviceCase) return jsonResponse({ error: "case_not_found" }, { status: 404 });

  // Reset thread → open
  await supabase
    .from("conversation_threads")
    .update({ status: "open" })
    .eq("id", serviceCase.thread_id);

  // ปิด handoff ที่ active อยู่
  await supabase
    .from("admin_handoffs")
    .update({ status: "resolved" })
    .eq("thread_id", serviceCase.thread_id)
    .in("status", ["pending", "accepted"]);

  // Close case so next customer greeting starts a fresh case (prevents stale context reuse)
  await supabase
    .from("service_cases")
    .update({ lead_status: "closed" })
    .eq("id", id);

  return jsonResponse({ ok: true });
}
