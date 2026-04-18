import { getAdminCaseDetail, getAdminCases } from "@/lib/db/queries";
import { isMockMode } from "@/lib/config/app-mode";
import { mockCaseDetails, mockCases } from "@/lib/data/mock-store";

type ListAdminCasesOptions = {
  status?: string;
  scenario?: string;
  intent?: string;
  handoff?: string;
  channel?: string;
  missing_fields?: string;
  tag?: string;
};

import { dryRunScenarios } from "@/lib/dry-run/scenario-catalog";

export async function listAdminCases(input?: string | ListAdminCasesOptions) {
  const options: ListAdminCasesOptions =
    typeof input === "string"
      ? {
          status: input
        }
      : input ?? {};

  if (isMockMode()) {
    let result = [...mockCases];

    if (options.scenario && options.scenario !== "all") {
      result = result.filter((item) => item.scenario_name === options.scenario);
    }

    if (options.status && options.status !== "all") {
      result = result.filter((item) => item.lead_status === options.status);
    }

    if (options.intent && options.intent !== "all") {
      result = result.filter((item) => item.ai_intent === options.intent);
    }

    if (options.handoff && options.handoff !== "all") {
      result = result.filter((item) => String(Boolean(item.should_handoff)) === options.handoff);
    }

    if (options.channel && options.channel !== "all") {
      result = result.filter((item) => item.channel === options.channel);
    }

    if (options.missing_fields && options.missing_fields !== "all") {
      result = result.filter((item) => String(Boolean(item.has_missing_fields)) === options.missing_fields);
    }

    if (options.tag && options.tag !== "all") {
      result = result.filter((item) => {
        const scenario = dryRunScenarios.find((s) => s.name === item.scenario_name);
        return scenario?.tags?.includes(options.tag!);
      });
    }

    return result;
  }

  return getAdminCases(options.status as any);
}

export async function getAdminCaseDetailFromProvider(caseId: string) {
  if (isMockMode()) {
    const detail = mockCaseDetails[caseId];

    if (!detail) {
      throw new Error("Mock case not found");
    }

    return detail;
  }

  return getAdminCaseDetail(caseId);
}
