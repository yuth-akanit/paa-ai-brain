import { createServiceClient } from "@/lib/db/supabase";
import { jsonResponse } from "@/lib/utils";

const AUTO_RELEASE_MINUTES = 30;

export async function POST(req: Request) {
  // Optional: protect with a secret header
  const authHeader = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && authHeader !== expectedSecret) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoffTime = new Date(Date.now() - AUTO_RELEASE_MINUTES * 60 * 1000).toISOString();

  // Find all handed_off threads
  const { data: handedOffThreads, error: threadsErr } = await supabase
    .from("conversation_threads")
    .select("id, updated_at")
    .eq("status", "handed_off");

  if (threadsErr) {
    return jsonResponse({ error: threadsErr.message }, { status: 500 });
  }

  if (!handedOffThreads || handedOffThreads.length === 0) {
    return jsonResponse({ ok: true, scanned: 0, released: 0 });
  }

  const released: string[] = [];

  for (const thread of handedOffThreads) {
    // Find last admin message on this thread
    const { data: lastAdminMsg } = await supabase
      .from("conversation_messages")
      .select("created_at")
      .eq("thread_id", thread.id)
      .eq("role", "admin")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // If no admin message, use thread.updated_at as fallback
    const lastActivity = lastAdminMsg?.created_at ?? thread.updated_at;

    // Use Date objects, NOT string comparison — Supabase returns timestamps with
    // timezone offset (e.g. "+07:00") which sorts incorrectly as plain strings.
    if (lastActivity && new Date(lastActivity) < new Date(cutoffTime)) {
      // Release this thread back to AI
      await supabase
        .from("conversation_threads")
        .update({ status: "open" })
        .eq("id", thread.id);

      // Resolve any pending handoffs on this thread
      await supabase
        .from("admin_handoffs")
        .update({ status: "resolved" })
        .eq("thread_id", thread.id)
        .in("status", ["pending", "accepted"]);

      // Close the case so next customer greeting starts a fresh case (prevents stale context)
      await supabase
        .from("service_cases")
        .update({ lead_status: "closed" })
        .eq("thread_id", thread.id)
        .eq("lead_status", "handed_off");

      // Audit log
      await supabase.from("audit_logs").insert({
        entity_type: "conversation_thread",
        entity_id: thread.id,
        action: "auto_released_to_ai",
        payload: {
          reason: `No admin activity for ${AUTO_RELEASE_MINUTES}+ minutes`,
          last_activity: lastActivity
        }
      });

      released.push(thread.id);
    }
  }

  return jsonResponse({
    ok: true,
    scanned: handedOffThreads.length,
    released: released.length,
    released_thread_ids: released
  });
}
