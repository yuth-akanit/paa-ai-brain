import { createAdminHandoff, createAuditLog, updateCaseState, updateThreadState } from "@/lib/db/queries";
import { getEnv } from "@/lib/env";
import { pushLineMessage } from "@/lib/line/client";
import type { CaseSummaryPayload } from "@/lib/types";
import { joinMeaningful } from "@/lib/utils";

function getAdminNotifyTargets() {
  const env = getEnv();
  return (env.LINE_ADMIN_NOTIFY_TARGETS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function truncateLineText(text: string, maxLength = 950) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildAdminHandoffNotification(params: {
  handoffId: string;
  threadId: string;
  reason: string;
  summaryPayload: CaseSummaryPayload;
}) {
  const details = joinMeaningful([
    params.summaryPayload.area,
    params.summaryPayload.preferredDate,
    params.summaryPayload.symptoms
  ]);

  return truncateLineText(
    [
      "🚨 AI Handoff ใหม่",
      `Case: ${params.summaryPayload.caseId}`,
      `Thread: ${params.threadId}`,
      `Handoff: ${params.handoffId}`,
      `Reason: ${params.reason}`,
      `ลูกค้า: ${params.summaryPayload.customerName ?? "-"}`,
      `งาน: ${params.summaryPayload.serviceType ?? "-"}`,
      `โทร: ${params.summaryPayload.phone ?? "-"}`,
      `รายละเอียด: ${details || "-"}`,
      `สรุป: ${params.summaryPayload.summary}`,
      "Next: admin_review_customer_message"
    ].join("\n")
  );
}

async function notifyAdminsOfHandoff(params: {
  caseId: string;
  threadId: string;
  handoffId: string;
  reason: string;
  summaryPayload: CaseSummaryPayload;
}) {
  const targets = getAdminNotifyTargets();
  if (targets.length === 0) {
    await createAuditLog({
      entityType: "service_case",
      entityId: params.caseId,
      action: "admin_handoff_notify_skipped",
      payload: {
        reason: "missing_line_admin_notify_targets",
        handoffId: params.handoffId
      }
    });
    return;
  }

  const message = buildAdminHandoffNotification({
    handoffId: params.handoffId,
    threadId: params.threadId,
    reason: params.reason,
    summaryPayload: params.summaryPayload
  });

  const results = await Promise.allSettled(
    targets.map((target) => pushLineMessage(target, message))
  );

  const deliveredTargets = results.flatMap((result, index) =>
    result.status === "fulfilled" ? [targets[index]] : []
  );
  const failedTargets = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ target: targets[index], error: result.reason instanceof Error ? result.reason.message : String(result.reason) }]
      : []
  );

  await createAuditLog({
    entityType: "service_case",
    entityId: params.caseId,
    action: failedTargets.length === 0 ? "admin_handoff_notified" : "admin_handoff_notify_partial_failure",
    payload: {
      handoffId: params.handoffId,
      deliveredTargets,
      failedTargets
    }
  });
}

export async function requestAdminHandoff(params: {
  caseId: string;
  threadId: string;
  summaryPayload: CaseSummaryPayload;
  reason: string;
}) {
  await updateCaseState({
    caseId: params.caseId,
    leadStatus: "handed_off",
    handoffReason: params.reason
  });

  await updateThreadState({
    threadId: params.threadId,
    status: "handed_off"
  });

  const handoff = await createAdminHandoff({
    caseId: params.caseId,
    threadId: params.threadId,
    reason: params.reason,
    summaryPayload: params.summaryPayload
  });

  await createAuditLog({
    entityType: "service_case",
    entityId: params.caseId,
    action: "admin_handoff_created",
    payload: {
      handoffId: handoff.id,
      reason: params.reason
    }
  });

  await notifyAdminsOfHandoff({
    caseId: params.caseId,
    threadId: params.threadId,
    handoffId: handoff.id,
    reason: params.reason,
    summaryPayload: params.summaryPayload
  });

  return handoff;
}
