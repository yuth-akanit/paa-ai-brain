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

  // Find all threads explicitly locked for admin takeover.
  const { data: handedOffThreads, error: threadsErr } = await supabase
    .from("conversation_threads")
    .select("id, updated_at")
    .eq("status", "handed_off");

  if (threadsErr) {
    return jsonResponse({ error: threadsErr.message }, { status: 500 });
  }

  // Recover older inconsistent states where the case was marked handed_off
  // but the thread never got locked, which prevents normal auto-release.
  const { data: handedOffCases, error: casesErr } = await supabase
    .from("service_cases")
    .select("id, thread_id, updated_at")
    .eq("lead_status", "handed_off");

  if (casesErr) {
    return jsonResponse({ error: casesErr.message }, { status: 500 });
  }

  const lockedThreadIds = new Set((handedOffThreads ?? []).map((thread) => thread.id));
  const releaseCandidates = [
    ...(handedOffThreads ?? []).map((thread) => ({
      threadId: thread.id,
      lastStateAt: thread.updated_at
    })),
    ...((handedOffCases ?? [])
      .filter((serviceCase) => !lockedThreadIds.has(serviceCase.thread_id))
      .map((serviceCase) => ({
        threadId: serviceCase.thread_id,
        lastStateAt: serviceCase.updated_at
      })))
  ];

  if (releaseCandidates.length === 0) {
    return jsonResponse({ ok: true, scanned: 0, released: 0 });
  }

  const released: string[] = [];

  for (const candidate of releaseCandidates) {
    // Find last admin message on this thread
    const { data: lastAdminMsg } = await supabase
      .from("conversation_messages")
      .select("created_at")
      .eq("thread_id", candidate.threadId)
      .eq("role", "admin")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // If no admin message, use the freshest handoff state timestamp as fallback
    const lastActivity = lastAdminMsg?.created_at ?? candidate.lastStateAt;

    // Use Date objects, NOT string comparison — Supabase returns timestamps with
    // timezone offset (e.g. "+07:00") which sorts incorrectly as plain strings.
    if (lastActivity && new Date(lastActivity) < new Date(cutoffTime)) {
      // Release this thread back to AI
      await supabase
        .from("conversation_threads")
        .update({ status: "open" })
        .eq("id", candidate.threadId);

      // Resolve any pending handoffs on this thread
      await supabase
        .from("admin_handoffs")
        .update({ status: "resolved" })
        .eq("thread_id", candidate.threadId)
        .in("status", ["pending", "accepted"]);

      // Close the case so next customer greeting starts a fresh case (prevents stale context)
      await supabase
        .from("service_cases")
        .update({ lead_status: "closed" })
        .eq("thread_id", candidate.threadId)
        .eq("lead_status", "handed_off");

      // Audit log
      await supabase.from("audit_logs").insert({
        entity_type: "conversation_thread",
        entity_id: candidate.threadId,
        action: "auto_released_to_ai",
        payload: {
          reason: `No admin activity for ${AUTO_RELEASE_MINUTES}+ minutes`,
          last_activity: lastActivity
        }
      });

      released.push(candidate.threadId);
    }
  }

  return jsonResponse({
    ok: true,
    scanned: releaseCandidates.length,
    released: released.length,
    released_thread_ids: released
  });
}
