export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { CaseDetailView } from "@/components/case-detail-view";
import { getAdminCaseDetailFromProvider } from "@/lib/data/cases-provider";
import { isMockMode } from "@/lib/config/app-mode";
import { mockScenarioOptions } from "@/lib/data/mock-store";
import { dryRunScenarios } from "@/lib/dry-run/scenario-catalog";
import { simulateConversation } from "@/lib/dry-run/simulate";

export default async function AdminCaseDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scenario?: string }>;
}) {
  try {
    const { id } = await params;
    const detail = await getAdminCaseDetailFromProvider(id);
    
    // In mock mode, find the scenario and run simulation for comparison
    const scenarioName = detail.serviceCase.scenario_name;
    const scenario = scenarioName ? dryRunScenarios.find(s => s.name === scenarioName) : null;
    const simulationResult = scenario ? await simulateConversation(scenario.input) : null;

    return (
      <CaseDetailView 
        serviceCase={detail.serviceCase} 
        messages={detail.messages} 
        scenarioOptions={isMockMode() ? mockScenarioOptions : []} 
        scenario={scenario ?? null}
        simulationResult={simulationResult}
      />
    );
  } catch (error) {
    console.error("Error loading case detail:", error);
    notFound();
  }
}
