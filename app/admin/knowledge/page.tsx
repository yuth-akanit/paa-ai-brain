export const dynamic = "force-dynamic";

import { KnowledgeForm } from "@/components/knowledge-form";
import { isMockMode } from "@/lib/config/app-mode";
import { listKnowledgeFromProvider } from "@/lib/data/knowledge-provider";
import { formatThaiDate } from "@/lib/utils";
import { dryRunScenarios } from "@/lib/dry-run/scenario-catalog";
import { mockScenarioOptions } from "@/lib/data/mock-store";
import { KnowledgeDebugger } from "../../../components/knowledge-debugger";
import { simulateConversation } from "@/lib/dry-run/simulate";
import { runFullRegression } from "@/lib/dry-run/regression-runner";

import { KnowledgeDeleteButton } from "@/components/knowledge-delete-button";

export default async function AdminKnowledgePage(props: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  const searchParams = await props.searchParams;
  const docs = await listKnowledgeFromProvider();
  const scenarioName = searchParams.scenario;
  const scenario = scenarioName ? dryRunScenarios.find((s) => s.name === scenarioName) : null;

  const simulationResult = scenario
    ? await simulateConversation(scenario.input)
    : null;
    
  const regressionSummary = await runFullRegression();

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Knowledge Base</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-900">จัดการ FAQ และนโยบายบริการ</h2>
        <p className="mt-3 text-sm text-slate-600">AI จะตอบได้เฉพาะข้อมูลราคาและนโยบายที่อยู่ในฐานข้อมูลนี้เท่านั้น</p>
        {isMockMode() ? (
          <p className="mt-3 text-xs text-amber-600 italic">
            หน้านี้อยู่ใน mock mode การเพิ่มข้อมูลจะเป็น dry-run เท่านั้น
          </p>
        ) : null}
      </div>

      {isMockMode() && (
        <KnowledgeDebugger
          scenarioOptions={mockScenarioOptions}
          currentScenario={scenarioName ?? ""}
          scenario={(scenario as any) ?? null}
          simulationResult={simulationResult}
          regressionSummary={regressionSummary}
          allDocs={docs}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <KnowledgeForm />

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">เอกสารล่าสุด</h2>
          <div className="mt-4 space-y-4">
            {docs.map((doc) => (
              <div key={doc.id} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">{doc.title}</h3>
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-700">{doc.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{doc.content}</p>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    {doc.category} | {formatThaiDate(doc.updated_at)}
                  </p>
                  <KnowledgeDeleteButton id={doc.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
