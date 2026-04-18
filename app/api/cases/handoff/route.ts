import { getAdminCaseDetail } from "@/lib/db/queries";
import { requestAdminHandoff } from "@/lib/cases/handoff";
import { handoffRequestSchema } from "@/lib/schemas";
import { jsonResponse } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = handoffRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.flatten() }, { status: 400 });
    }

    const detail = await getAdminCaseDetail(parsed.data.caseId);
    const extracted = detail.serviceCase.extracted_fields ?? {};

    const handoff = await requestAdminHandoff({
      caseId: parsed.data.caseId,
      threadId: detail.serviceCase.thread_id,
      reason: parsed.data.reason,
      summaryPayload: {
        caseId: detail.serviceCase.id,
        customerName: detail.serviceCase.customers?.display_name ?? null,
        phone: extracted.phone ?? null,
        area: extracted.area ?? null,
        serviceType: extracted.service_type ?? null,
        symptoms: extracted.symptoms ?? null,
        preferredDate: extracted.preferred_date ?? null,
        urgency: extracted.urgency ?? null,
        leadStatus: "handed_off",
        summary: detail.serviceCase.summary ?? "",
        handoffReason: parsed.data.reason
      }
    });

    return jsonResponse({
      handoff
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "internal_error"
      },
      { status: 500 }
    );
  }
}
