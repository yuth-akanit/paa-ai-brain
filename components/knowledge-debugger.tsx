"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Route } from "next";
import { DryRunScenario } from "@/lib/dry-run/scenario-catalog";
import { IntentBadge } from "@/components/intent-badge";

import { SimulateResult } from "@/lib/dry-run/simulate";
import { RegressionSummary, GateProfile, runFullRegression } from "@/lib/dry-run/regression-runner";
import { useState, useTransition, useEffect } from "react";

type ScenarioOption = {
  value: string;
  label: string;
};

type KnowledgeDebuggerProps = {
  scenarioOptions: ScenarioOption[];
  currentScenario: string;
  scenario: DryRunScenario | null;
  simulationResult: SimulateResult | null;
  regressionSummary?: RegressionSummary;
  allDocs: any[];
};

export function KnowledgeDebugger({
  scenarioOptions,
  currentScenario,
  scenario,
  simulationResult,
  regressionSummary: initialSummary,
  allDocs
}: KnowledgeDebuggerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  
  const [summary, setSummary] = useState<RegressionSummary | undefined>(initialSummary);
  const [baseline, setBaseline] = useState<RegressionSummary | undefined>();
  const [isPending, startTransition] = useTransition();
  const [localSnapshots, setLocalSnapshots] = useState<{name: string, data: RegressionSummary}[]>([]);

  // Load snapshots from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('ai_qa_snapshots');
    if (saved) {
      try {
        setLocalSnapshots(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load snapshots", e);
      }
    }
  }, []);

  function saveSnapshot() {
    const name = prompt("Enter snapshot name:", `Baseline ${new Date().toLocaleTimeString()}`);
    if (!name || !summary) return;

    const newSnapshots = [...localSnapshots, { name, data: summary }];
    setLocalSnapshots(newSnapshots.slice(-10)); // Keep last 10
    localStorage.setItem('ai_qa_snapshots', JSON.stringify(newSnapshots.slice(-10)));
  }

  function loadSnapshot(data: RegressionSummary) {
    setBaseline(data);
    startTransition(async () => {
      const newSummary = await runFullRegression(summary?.profile || "balanced", data);
      setSummary(newSummary);
    });
  }

  async function updateProfile(profile: GateProfile) {
    startTransition(async () => {
      const newSummary = await runFullRegression(profile, baseline);
      setSummary(newSummary);
    });
  }

  function deleteSnapshot(index: number) {
    const newSnapshots = localSnapshots.filter((_, i) => i !== index);
    setLocalSnapshots(newSnapshots);
    localStorage.setItem('ai_qa_snapshots', JSON.stringify(newSnapshots));
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const baselineData = JSON.parse(e.target?.result as string) as RegressionSummary;
        setBaseline(baselineData);
        const newSummary = await runFullRegression(summary?.profile || "balanced", baselineData);
        setSummary(newSummary);
      } catch (err) {
        alert("Invalid baseline file");
      }
    };
    reader.readAsText(file);
  }

  function setScenario(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("scenario", value);
    } else {
      params.delete("scenario");
    }
    router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false });
  }

  const debug = scenario ? (scenario as any).knowledge_debug : null;
  const relevantDocs = debug?.relevant_knowledge_ids
    ? allDocs.filter((doc) => debug.relevant_knowledge_ids.includes(doc.id))
    : [];

  // Helper to compare values and return a badge
  const CompareBadge = ({
    expected,
    actual,
    label
  }: {
    expected: any;
    actual: any;
    label: string;
  }) => {
    const isMatch = JSON.stringify(expected) === JSON.stringify(actual);
    return (
      <div className="flex items-center justify-between gap-4 py-1.5 border-b border-white/5 last:border-0">
        <span className="text-xs text-slate-400">{label}</span>
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-slate-500 text-right">
            <div className="opacity-60">Exp: {JSON.stringify(expected)}</div>
            <div className={isMatch ? "text-emerald-400" : "text-rose-400"}>
              Act: {JSON.stringify(actual)}
            </div>
          </div>
          {isMatch ? (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-500 border border-emerald-500/20">
              MATCH
            </span>
          ) : (
            <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold text-rose-500 border border-rose-500/20 animate-pulse">
              MISMATCH
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl overflow-hidden relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] -mr-32 -mt-32" />
      
      <div className="flex flex-col gap-6 relative z-10">
        {/* Regression Summary Dashboard */}
        {summary && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">QC Configuration</p>
                <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                  {(["strict", "balanced", "lenient"] as GateProfile[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => updateProfile(p)}
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${
                        summary.profile === p ? "bg-emerald-500 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                
                {summary.metadata && (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 text-[9px] text-slate-500 font-mono">
                      <span>v{summary.metadata.schemaVersion}</span>
                      <span className="w-1 h-1 bg-slate-700 rounded-full" />
                      <span>{new Date(summary.metadata.generatedAt).toLocaleString()}</span>
                      <span className="w-1 h-1 bg-slate-700 rounded-full" />
                      <span className="text-emerald-500/80">Hash: {summary.metadata.catalogFingerprint}</span>
                    </div>
                    {summary.metadata.generatedBy && (
                      <div className="text-[9px] text-slate-400">
                        By: <span className="text-slate-200">{summary.metadata.generatedBy}</span> @ {summary.metadata.environment}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={saveSnapshot}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase px-3 py-1.5 rounded-xl border border-emerald-500/30 transition-all flex items-center gap-2"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Take Snapshot
                </button>

                <div className="h-6 w-px bg-slate-800" />

                <label className="flex items-center gap-2 cursor-pointer bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-[10px] font-bold text-slate-300 uppercase">Load Baseline</span>
                  <input type="file" className="hidden" accept=".json" onChange={handleFileUpload} />
                </label>
                
                {localSnapshots.length > 0 && (
                  <div className="relative group">
                    <button className="bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-[10px] font-bold text-slate-300 uppercase flex items-center gap-2">
                      History ({localSnapshots.length})
                    </button>
                    <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2">
                      <p className="text-[10px] text-slate-500 font-bold uppercase px-2 py-1">Saved Snapshots</p>
                      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                        {localSnapshots.map((snap, i) => (
                          <div key={i} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg group/item">
                            <button 
                              onClick={() => loadSnapshot(snap.data)}
                              className="text-[10px] text-slate-300 text-left truncate flex-1"
                            >
                              {snap.name}
                            </button>
                            <button onClick={() => deleteSnapshot(i)} className="text-rose-500 opacity-0 group-hover/item:opacity-100 p-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {baseline && (
                  <button 
                    onClick={() => { setBaseline(undefined); setSummary(initialSummary); }}
                    className="text-[10px] text-rose-500 underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm relative overflow-hidden">
              {isPending && <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] z-20 flex items-center justify-center text-xs animate-pulse">RE-EVALUATING GATE...</div>}
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Total Scenarios</span>
                <span className="text-2xl font-mono">{summary.total}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-emerald-500 uppercase font-bold">Passed</span>
                <span className="text-2xl font-mono text-emerald-400">
                  {summary.passed}
                  {summary.comparison && (
                    <span className={`ml-2 text-xs ${summary.comparison.accuracyDelta >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      {summary.comparison.accuracyDelta > 0 ? "+" : ""}{summary.comparison.accuracyDelta}%
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-rose-500 uppercase font-bold">Failed</span>
                <span className="text-2xl font-mono text-rose-400">{summary.failed}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-amber-500 uppercase font-bold">Intent Mismatch</span>
                <span className="text-2xl font-mono text-amber-400">{summary.intentMismatches}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-amber-500 uppercase font-bold">Handoff Mismatch</span>
                <span className="text-2xl font-mono text-amber-400">{summary.handoffMismatches}</span>
              </div>
              
              <div className={`flex flex-col items-center justify-center rounded-xl px-3 py-1 border shadow-lg transition-colors ${
                summary.gateStatus === 'PASS' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' :
                summary.gateStatus === 'WARN' ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' :
                'bg-rose-500/10 border-rose-500/50 text-rose-400'
              }`}>
                <span className="text-[10px] uppercase font-black tracking-tighter">GATE</span>
                <span className="text-xl font-black">{summary.gateStatus}</span>
              </div>
            </div>

            {summary.comparison && (
              <div className="flex flex-col gap-4">
                {summary.comparison.compatibility !== "COMPATIBLE" && (
                  <div className={`px-4 py-2 rounded-xl border flex items-center justify-between ${
                    summary.comparison.compatibility === "INCOMPATIBLE" 
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400" 
                      : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  }`}>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        Baseline ${summary.comparison.compatibility}: ${summary.comparison.compatibilityReason}
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {summary.comparison.newRegressions.length > 0 && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                      <p className="text-[10px] font-black text-rose-500 uppercase mb-2">New Regressions (Critical!)</p>
                      <div className="flex flex-wrap gap-2">
                        {summary.comparison.newRegressions.map(s => (
                          <span key={s} className="text-[10px] bg-rose-500/20 px-2 py-1 rounded border border-rose-500/20">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {summary.comparison.newResolved.length > 0 && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                      <p className="text-[10px] font-black text-emerald-500 uppercase mb-2">Resolved Issues</p>
                      <div className="flex flex-wrap gap-2">
                        {summary.comparison.newResolved.map(s => (
                          <span key={s} className="text-[10px] bg-emerald-500/20 px-2 py-1 rounded border border-emerald-500/20">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-slate-900/50 border border-slate-800 overflow-hidden">
                  <table className="w-full text-left text-[10px]">
                    <thead className="bg-slate-800/50 text-slate-500 uppercase font-bold">
                      <tr>
                        <th className="px-4 py-2">Scenario</th>
                        <th className="px-4 py-2 text-center">Baseline</th>
                        <th className="px-4 py-2 text-center">Current</th>
                        <th className="px-4 py-2 text-right">Change Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {summary.results.map((res) => {
                        const baselineRes = baseline?.results.find(b => b.scenarioName === res.scenarioName);
                        const isRegression = baselineRes?.isPassed && !res.isPassed;
                        const isResolved = baselineRes?.isPassed === false && res.isPassed;
                        const hasNoChange = baselineRes?.isPassed === res.isPassed;

                        return (
                          <tr key={res.scenarioName} className={`hover:bg-white/5 transition-colors ${isRegression ? "bg-rose-500/5" : isResolved ? "bg-emerald-500/5" : ""}`}>
                            <td className="px-4 py-2 font-medium text-slate-300">{res.scenarioName}</td>
                            <td className="px-4 py-2 text-center">
                              {baselineRes ? (
                                <span className={baselineRes.isPassed ? "text-emerald-500" : "text-rose-500"}>
                                  {baselineRes.isPassed ? "PASS" : "FAIL"}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={res.isPassed ? "text-emerald-500" : "text-rose-500"}>
                                {res.isPassed ? "PASS" : "FAIL"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              {isRegression ? (
                                <span className="text-rose-500 font-bold uppercase tracking-tighter">Regression</span>
                              ) : isResolved ? (
                                <span className="text-emerald-500 font-bold uppercase tracking-tighter">Fixed</span>
                              ) : hasNoChange ? (
                                <span className="text-slate-600">Unchanged</span>
                              ) : (
                                <span className="text-slate-600">New Scenario</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {summary.gateStatus !== 'PASS' && (
              <div className="flex flex-col gap-1 px-4 py-2 bg-rose-500/5 rounded-xl border border-rose-500/10 mb-2">
                <p className="text-[10px] text-rose-400/70 font-bold uppercase">Blocking Issues / Warnings ({summary.profile} mode):</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {summary.gateReasons.map((reason, i) => (
                    <span key={i} className="text-[10px] text-rose-300 flex items-center gap-1">
                      <span className="w-1 h-1 bg-rose-500 rounded-full" /> {reason}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 px-1">
              {Object.entries(summary.tagStats).map(([tag, stats]) => {
                const passRate = Math.round((stats.passed / stats.total) * 100);
                return (
                  <div key={tag} className="flex items-center gap-2 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">{tag}</span>
                    <span className={`text-[10px] font-bold ${passRate === 100 ? "text-emerald-400" : "text-amber-400"}`}>
                      {passRate}%
                    </span>
                  </div>
                );
              })}
              {summary.metadata?.notes && (
                <div className="mt-6 pt-6 border-t border-slate-700/30 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block mb-2">Release Notes</span>
                    <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50 text-slate-300 italic text-sm">
                      &quot;{summary.metadata.notes}&quot;
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block">Sign-off Trail</span>
                    <div className="grid grid-cols-2 gap-2">
                       <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                         <p className="text-[8px] text-slate-500 uppercase">Approved By</p>
                         <p className="text-xs text-emerald-400 font-bold">{summary.metadata.approvedBy || "PENDING"}</p>
                       </div>
                       <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                         <p className="text-[8px] text-slate-500 uppercase">Reviewed By</p>
                         <p className="text-xs text-sky-400 font-bold">{summary.metadata.reviewedBy || "PENDING"}</p>
                       </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-emerald-400 leading-tight">AI QA & Policy Debugger</h3>
              {scenario?.tags && (
                <div className="flex gap-1 mt-1">
                  {scenario.tags.map(tag => (
                    <span key={tag} className="text-[10px] bg-slate-800 text-slate-400 px-1.5 rounded border border-slate-700 uppercase tracking-tighter">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400 hidden sm:inline">Scenario:</span>
            <select
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={currentScenario}
              onChange={(e) => setScenario(e.target.value)}
            >
              <option value="">เลือก scenario เพื่อดักแก้...</option>
              {scenarioOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            
            <button
              onClick={() => {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(summary, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href",     dataStr);
                downloadAnchorNode.setAttribute("download", `regression_report_${new Date().toISOString()}.json`);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
              }}
              className="rounded-xl bg-slate-800 border border-slate-700 p-2 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
              title="Export Full Report"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
        </div>

        {scenario ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left: Input & Comparison */}
            <div className="space-y-6">
              <div className="rounded-2xl bg-white/5 p-5 border border-white/10">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-3">Customer Input</p>
                <p className="text-lg font-medium italic text-slate-200">&quot;{scenario.input.message}&quot;</p>
              </div>

              <div className="rounded-2xl bg-white/5 p-5 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Expected vs Actual</p>
                  {simulationResult?.ok && (
                    <span className="text-[10px] text-emerald-500 animate-pulse bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">LIVE SIMULATION ACTIVE</span>
                  )}
                </div>
                <div className="space-y-1">
                  <CompareBadge label="Intent" expected={scenario.expected.intent} actual={simulationResult?.detected_intent} />
                  <CompareBadge label="Handoff" expected={scenario.expected.should_handoff} actual={simulationResult?.should_handoff} />
                  <CompareBadge label="Missing Fields" expected={scenario.expected.missing_fields.length} actual={simulationResult?.missing_fields.length} />
                </div>
              </div>

              {/* Field-level Extraction Comparison */}
              <div className="rounded-2xl bg-white/5 p-5 border border-white/10">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-3">Field Extraction (Deep Check)</p>
                <div className="space-y-3">
                  {Object.entries(scenario.expected.extracted_fields || {}).map(([key, expectedValue]) => {
                    const actualValue = (simulationResult?.extracted_fields as any)?.[key];
                    const isMatch = JSON.stringify(expectedValue) === JSON.stringify(actualValue);
                    
                    return (
                      <div key={key} className="flex flex-col gap-1 py-2 border-b border-white/5 last:border-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono text-slate-300">{key}</span>
                          {isMatch ? (
                            <span className="text-[9px] text-emerald-500 font-bold">MATCH</span>
                          ) : actualValue === undefined ? (
                            <span className="text-[9px] text-rose-500 font-bold uppercase">Missing</span>
                          ) : (
                            <span className="text-[9px] text-amber-500 font-bold uppercase">Partial</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-slate-500">Exp:</span>
                          <span className="text-slate-300 truncate max-w-[80px]">{JSON.stringify(expectedValue)}</span>
                          <span className="text-slate-500">Act:</span>
                          <span className={isMatch ? "text-emerald-400" : "text-amber-400"}>{JSON.stringify(actualValue) || "null"}</span>
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(scenario.expected.extracted_fields || {}).length === 0 && (
                    <p className="text-xs text-slate-600 italic">No fields defined for this scenario</p>
                  )}
                </div>
              </div>
            </div>

            {/* Middle: Knowledge & Trace */}
            <div className="space-y-6">
              <div className="rounded-2xl bg-white/5 p-5 border border-white/10 h-full">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-4">Decision Trace</p>
                <div className="space-y-3">
                  {simulationResult?.trace.map((step, i) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <span className="text-slate-600 font-mono mt-0.5">{i+1}.</span>
                      <p className="text-slate-300 leading-relaxed font-mono text-xs">{step}</p>
                    </div>
                  ))}
                  {!simulationResult && (
                    <p className="text-sm text-slate-500 italic">No trace data available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Policy & Docs */}
            <div className="space-y-6">
              <div className="rounded-2xl bg-white/5 p-5 border border-white/10">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-3">Policy Scope</p>
                <div className="flex flex-wrap gap-2">
                  {debug?.policy_scope?.map((policy: string) => (
                    <span key={policy} className="rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] font-mono text-blue-400 border border-blue-500/20">
                      {policy}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-[10px] uppercase text-emerald-500/70 font-bold mb-2">Allowed</p>
                    <ul className="space-y-1">
                      {debug?.allowed_answer_types?.map((type: string) => (
                        <li key={type} className="text-[10px] text-slate-300 flex items-center gap-1">
                          <span className="text-emerald-500">✓</span> {type}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-rose-500/70 font-bold mb-2">Forbidden</p>
                    <ul className="space-y-1">
                      {debug?.forbidden_answer_types?.map((type: string) => (
                        <li key={type} className="text-[10px] text-slate-300 flex items-center gap-1">
                          <span className="text-rose-500">✕</span> {type}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white/5 p-5 border border-white/10">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-3">Relevant Knowledge</p>
                <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  {relevantDocs.length > 0 ? (
                    relevantDocs.map((doc: any) => (
                      <div key={doc.id} className="rounded-xl bg-slate-800/50 p-3 border border-slate-700">
                        <p className="text-xs font-semibold text-emerald-400">{doc.title}</p>
                        <p className="mt-1 text-[10px] text-slate-400 line-clamp-2">{doc.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic">ไม่ได้ระบุ Knowledge ที่เกี่ยวข้อง</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-white/5 border border-dashed border-white/10">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-slate-500">เลือก Scenario ด้านบนเพื่อวิเคราะห์ AI Performance</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
