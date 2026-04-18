import { jsonResponse } from "@/lib/utils";
import { isDryRunMode } from "@/lib/config/app-mode";
import { simulateConversation } from "@/lib/dry-run/simulate";

export async function POST(request: Request) {
  if (!isDryRunMode()) {
    return jsonResponse({ error: "dry_run_mode_disabled" }, { status: 403 });
  }

  const body = await request.json();
  const result = await simulateConversation(body);

  return jsonResponse(result);
}
