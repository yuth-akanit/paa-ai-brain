import { isMockMode } from "@/lib/config/app-mode";
import { requestAdminHandoff } from "@/lib/cases/handoff";
import { createServiceClient } from "@/lib/db/supabase";
import type { CaseSummaryPayload, ServiceType } from "@/lib/types";
import { jsonResponse } from "@/lib/utils";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isMockMode()) {
      return jsonResponse({ error: "mock_mode_read_only" }, { status: 409 });
    }

    const { id } = await params;
    const supabase = createServiceClient();

    const { data: serviceCase, error: caseError } = await supabase
      .from("service_cases")
      .select(`
        *,
        customers(*),
        conversation_threads(*),
        admin_handoffs(*)
      `)
      .eq("id", id)
      .single();

    if (caseError || !serviceCase) {
      return jsonResponse({ error: caseError?.message ?? "case_not_found" }, { status: 404 });
    }

    const existingActiveHandoff = (serviceCase.admin_handoffs ?? []).find(
      (handoff: { status?: string }) => handoff.status === "pending" || handoff.status === "accepted"
    );

    if (existingActiveHandoff || serviceCase.conversation_threads?.status === "handed_off") {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: "already_handed_off"
      });
    }

    const extracted = (serviceCase.extracted_fields ?? {}) as Record<string, string | null | undefined>;
    const summaryPayload: CaseSummaryPayload = {
      caseId: serviceCase.id,
      customerName: serviceCase.customers?.display_name ?? extracted.customer_name ?? null,
      phone: serviceCase.customers?.phone ?? extracted.phone ?? null,
      area: extracted.area ?? null,
      serviceType: (serviceCase.service_type ?? extracted.service_type ?? null) as ServiceType | null,
      symptoms: extracted.symptoms ?? null,
      preferredDate: extracted.preferred_date ?? null,
      urgency: extracted.urgency ?? null,
      leadStatus: "handed_off",
      summary: serviceCase.summary || "แอดมินรับช่วงเคสนี้จาก AI ด้วยตนเอง",
      handoffReason: "admin_manual_takeover"
    };

    const handoff = await requestAdminHandoff({
      caseId: serviceCase.id,
      threadId: serviceCase.thread_id,
      reason: "admin_manual_takeover",
      summaryPayload
    });

    return jsonResponse({
      ok: true,
      handoffId: handoff.id
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
