import Link from "next/link";
import { IntentBadge } from "@/components/intent-badge";
import { MockScenarioSwitcher } from "@/components/mock-scenario-switcher";
import { StatusBadge } from "@/components/status-badge";
import { getLineChannelDescriptor } from "@/lib/line/channel-descriptor";
import { formatThaiDate } from "@/lib/utils";
import type { DryRunScenario } from "@/lib/dry-run/scenario-catalog";
import type { SimulateResult } from "@/lib/dry-run/simulate";

import { ReleaseToAiButton } from "@/components/release-to-ai-button";
import { TakeOverButton } from "@/components/take-over-button";

type CaseDetailProps = {
  serviceCase: Record<string, any>;
  messages: Array<Record<string, any>>;
  scenarioOptions?: Array<{ value: string; label: string; caseId: string }>;
  scenario?: DryRunScenario | null;
  simulationResult?: SimulateResult | null;
};

export function CaseDetailView({ 
  serviceCase, 
  messages, 
  scenarioOptions = [],
  scenario = null,
  simulationResult = null
}: CaseDetailProps) {
  const customer = serviceCase.customers;
  const handoff = serviceCase.admin_handoffs?.[0];
  const thread = (serviceCase as any).conversation_threads;
  const extracted = serviceCase.extracted_fields ?? {};
  // Show release button when case OR thread is still in handed_off state
  const showReleaseButton =
    handoff?.status === "accepted" ||
    serviceCase.lead_status === "handed_off" ||
    thread?.status === "handed_off";
  const showTakeOverButton = !showReleaseButton;
  const missingFields = (serviceCase as any).missing_fields ?? [];
  const confidence = typeof serviceCase.ai_confidence === "number" ? Math.round(serviceCase.ai_confidence * 100) : null;
  const lineDisplayName = customer?.display_name || null;
  const providedName = extracted.customer_name || null;
  const primaryName = lineDisplayName || providedName || "ยังไม่ทราบชื่อลูกค้า";
  const showProvidedName = Boolean(lineDisplayName && providedName && lineDisplayName !== providedName);
  const sourceChannelMeta = (thread?.metadata as Record<string, any> | undefined)?.source_channel;
  const sourceChannel = getLineChannelDescriptor({
    provider: thread?.channel_provider || sourceChannelMeta?.provider || "line",
    accountKey: sourceChannelMeta?.account_key,
    channelPlatformId: sourceChannelMeta?.channel_platform_id
  });

  // Helper to compare values and return a status badge
  const CompareStatus = ({ label, expected, actual }: { label: string; expected: any; actual: any }) => {
    const isMatch = JSON.stringify(expected) === JSON.stringify(actual);
    return (
      <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <div className="flex items-center gap-2">
          {isMatch ? (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">MATCH</span>
          ) : (
            <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">MISMATCH</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-6">
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">เคส #{serviceCase.id.slice(0, 8)}</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">{primaryName}</h2>
              {showProvidedName ? (
                <p className="mt-2 text-sm text-slate-500">ชื่อลูกค้าแจ้ง: {providedName}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge value={serviceCase.lead_status} />
                <IntentBadge value={serviceCase.ai_intent} />
                {serviceCase.should_handoff ? <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">ส่งต่อแอดมิน</span> : null}
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 sm:min-w-[250px] sm:w-auto">
              {scenarioOptions.length > 0 ? (
                <MockScenarioSwitcher
                  options={scenarioOptions}
                  currentScenario={serviceCase.scenario_name ?? scenarioOptions[0]?.value ?? ""}
                  fallbackCaseId={serviceCase.id}
                />
              ) : null}
              <Link href={`/admin/cases?scenario=${serviceCase.scenario_name ?? ""}`} className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
                กลับไปดูในรายการเคส
              </Link>
              {showReleaseButton ? (
                <div className="mt-2">
                  <ReleaseToAiButton caseId={serviceCase.id} />
                </div>
              ) : (
                <div className="mt-2">
                  <TakeOverButton caseId={serviceCase.id} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4">
            <Info label="เบอร์โทร" value={customer?.phone || extracted.phone || "-"} />
            <Info label="พื้นที่" value={extracted.area || "-"} />
            <Info label="ประเภทงาน" value={serviceCase.service_type || extracted.service_type || "-"} />
            <Info label="วัน/เวลา" value={formatPreferredSchedule(extracted)} />
            <Info label="ระดับความเร่งด่วน" value={formatUrgency(extracted.urgency)} />
            <Info label="AI confidence" value={confidence !== null ? `${confidence}%` : "-"} />
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-700">สรุปเคส</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">{serviceCase.summary || "-"}</p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <p className="text-sm font-medium text-emerald-900">Customer Summary</p>
              <p className="mt-2 text-sm text-emerald-800">{renderChecklistSummary(extracted)}</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <p className="text-sm font-medium text-amber-900">Missing Fields</p>
              <p className="mt-2 text-sm text-amber-800">{missingFields.length > 0 ? missingFields.join(", ") : "ไม่มีรายการค้าง ระบบมองว่าข้อมูลครบระดับพร้อมดำเนินการ"}</p>
            </div>
          </div>
        </div>

        {scenario && simulationResult && (
          <div className="rounded-2xl bg-slate-900 p-4 shadow-xl text-white sm:rounded-3xl sm:p-6">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-6 bg-emerald-500 rounded-full" />
              <h3 className="text-lg font-semibold">AI Diagnostic & Regression Test</h3>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Expected vs Actual</p>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <CompareStatus label="Intent" expected={scenario.expected.intent} actual={simulationResult.detected_intent} />
                  <CompareStatus label="Should Handoff" expected={scenario.expected.should_handoff} actual={simulationResult.should_handoff} />
                  <CompareStatus label="Handoff Reason" expected={scenario.expected.handoff_reason} actual={simulationResult.handoff_reason} />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Decision Trace</p>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-2">
                  {simulationResult.trace.map((step, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="text-slate-500 font-mono">{i+1}.</span>
                      <p className="text-slate-300 font-mono">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <h3 className="text-lg font-semibold text-slate-900">ประวัติการสนทนา</h3>
          <div className="mt-4 space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "customer" ? "ml-auto max-w-[95%] sm:max-w-[85%]" : "mr-auto max-w-[95%] sm:max-w-[85%]"}>
                <div className={message.role === "customer" ? "rounded-2xl bg-slate-900 px-4 py-3 text-white" : "rounded-2xl bg-slate-100 px-4 py-3 text-slate-900"}>
                  <p className="text-xs uppercase tracking-wide opacity-70">{message.role}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{message_text_fix(message)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-400">{formatThaiDate(message.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">โปรไฟล์ลูกค้า</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">ชื่อ LINE</p>
              <p className="mt-2 font-medium text-slate-900">{lineDisplayName || "ยังไม่ทราบชื่อ"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">ชื่อลูกค้าแจ้ง</p>
              <p className="mt-2 font-medium text-slate-900">{providedName || "-"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">ช่องทาง</p>
              <p className="mt-2 font-medium text-slate-900">{sourceChannel.label}</p>
              {sourceChannel.channelPlatformId ? (
                <p className="mt-1 text-xs text-slate-500">Channel ID: {sourceChannel.channelPlatformId}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Extracted Fields</h3>
          <dl className="mt-4 space-y-3 text-sm text-slate-600">
            {Object.entries(extracted).map(([key, value]) => (
              <div key={key} className="rounded-2xl bg-slate-50 p-3">
                <dt className="font-medium capitalize text-slate-800">{formatFieldLabel(key)}</dt>
                <dd className="mt-1 break-words">{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
              </div>
            ))}
            {Object.keys(extracted).length === 0 ? <p className="text-slate-500">ยังไม่มีข้อมูลที่ระบบสกัดได้</p> : null}
          </dl>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">AI Decision</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Customer Reply</p>
              <p className="mt-2 leading-7 text-slate-900">{serviceCase.customer_reply || "-"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Recommended Next Action</p>
              <p className="mt-2 font-medium text-slate-900">{serviceCase.recommended_next_action || "-"}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">สถานะส่งต่อแอดมิน</h3>
          <p className="mt-3 text-sm text-slate-600">เหตุผล: {serviceCase.handoff_reason || handoff?.handoff_reason || "ยังไม่ต้องส่งต่อ"}</p>
          <p className="mt-2 text-sm text-slate-600">สถานะ: {handoff?.status || (serviceCase.handoff_reason ? "pending" : "-")}</p>
          <p className="mt-2 text-sm text-slate-600">ล่าสุด: {formatThaiDate(serviceCase.updated_at)}</p>
          
          {showReleaseButton ? (
            <div className="mt-4">
              <ReleaseToAiButton caseId={serviceCase.id} />
            </div>
          ) : showTakeOverButton ? (
            <div className="mt-4">
              <TakeOverButton caseId={serviceCase.id} />
            </div>
          ) : null}

          {serviceCase.admin_summary ? (
            <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-900">
              <p className="font-medium">สรุปสำหรับแอดมิน</p>
              <p className="mt-2 leading-7">{serviceCase.admin_summary}</p>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function message_text_fix(message: any) {
  return message.message_text || message.text || "-";
}

function formatFieldLabel(value: string) {
  const labels: Record<string, string> = {
    customer_name: "ชื่อลูกค้า",
    phone: "เบอร์โทร",
    area: "พื้นที่",
    service_type: "ประเภทงาน",
    machine_count: "จำนวนเครื่อง",
    symptoms: "อาการ",
    preferred_date: "วันที่สะดวก",
    urgency: "ความเร่งด่วน"
  };

  return labels[value] ?? value;
}

function formatUrgency(value?: string) {
  if (value === "high") {
    return "เร่งด่วน";
  }

  if (value === "medium") {
    return "ปานกลาง";
  }

  if (value === "low") {
    return "ทั่วไป";
  }

  return "-";
}

function renderChecklistSummary(extracted: Record<string, unknown>) {
  const collected = [
    extracted.customer_name ? "ชื่อลูกค้า" : null,
    extracted.phone ? "เบอร์โทร" : null,
    extracted.area ? "พื้นที่" : null,
    extracted.service_type ? "ประเภทงาน" : null,
    extracted.machine_count ? "จำนวนเครื่อง" : null,
    extracted.symptoms ? "อาการ" : null,
    extracted.preferred_date ? "เวลาที่สะดวก" : null
  ].filter(Boolean);

  return collected.length > 0 ? collected.join(", ") : "ยังไม่มีข้อมูลสำคัญที่เก็บได้";
}

function formatPreferredSchedule(extracted: Record<string, unknown>) {
  const date = typeof extracted.preferred_date === "string" ? extracted.preferred_date : "";
  const time = typeof extracted.preferred_time === "string" ? extracted.preferred_time : "";
  if (date && time) return `${date} ${time}`;
  if (date) return date;
  if (time) return time;
  return "-";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 sm:rounded-2xl sm:p-4">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900 sm:mt-2">{value}</p>
    </div>
  );
}
