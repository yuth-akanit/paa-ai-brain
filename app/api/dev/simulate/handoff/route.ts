import { jsonResponse } from "@/lib/utils";
import { isDryRunMode } from "@/lib/config/app-mode";
import { simulateConversation } from "@/lib/dry-run/simulate";

export async function POST(request: Request) {
  if (!isDryRunMode()) {
    return jsonResponse({ error: "dry_run_mode_disabled" }, { status: 403 });
  }

  const body = await request.json();
  const result = await simulateConversation(body);

  return jsonResponse({
    ok: true,
    mode: "dry-run",
    intent: result.detected_intent,
    should_handoff: result.should_handoff,
    customer_reply: result.customer_reply,
    admin_summary: result.admin_summary
  });
}
