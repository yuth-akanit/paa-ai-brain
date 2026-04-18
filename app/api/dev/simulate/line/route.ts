import { jsonResponse } from "@/lib/utils";
import { isDryRunMode } from "@/lib/config/app-mode";
import { getDryRunScenario } from "@/lib/dry-run/scenario-catalog";
import { simulateConversation } from "@/lib/dry-run/simulate";

export async function POST(request: Request) {
  if (!isDryRunMode()) {
    return jsonResponse({ error: "dry_run_mode_disabled" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const fixtureName = body.fixture as string | undefined;

  const fixture = fixtureName ? getDryRunScenario(fixtureName) : getDryRunScenario("repair_request_basic");
  const payload = body.message ? body : fixture?.input;

  if (!payload) {
    return jsonResponse({ error: "fixture_not_found" }, { status: 404 });
  }

  const result = await simulateConversation(payload);
  return jsonResponse(result);
}
