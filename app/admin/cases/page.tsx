export const dynamic = "force-dynamic";

import { CasesTable } from "@/components/cases-table";
import { MockScenarioControls } from "@/components/mock-scenario-controls";
import { listAdminCases } from "@/lib/data/cases-provider";
import { isMockMode } from "@/lib/config/app-mode";
import { mockScenarioOptions } from "@/lib/data/mock-store";

const statusOptions = [
  { value: "all", label: "ทั้งหมด" },
  { value: "new", label: "เคสใหม่" },
  { value: "collecting_info", label: "กำลังเก็บข้อมูล" },
  { value: "qualified", label: "พร้อมคัดกรอง" },
  { value: "handed_off", label: "ส่งต่อแอดมิน" },
  { value: "closed", label: "ปิดเคส" }
];

export default async function AdminCasesPage({
  searchParams
}: {
  searchParams: Promise<{
    status?: string;
    scenario?: string;
    intent?: string;
    handoff?: string;
    channel?: string;
    missing_fields?: string;
    tag?: string;
  }>;
}) {
  const resolved = await searchParams;
  const status = resolved.status ?? "all";
  const scenario = resolved.scenario ?? (isMockMode() ? mockScenarioOptions[0]?.value ?? "all" : "all");
  const intent = resolved.intent ?? "all";
  const handoff = resolved.handoff ?? "all";
  const channel = resolved.channel ?? "all";
  const missing_fields = resolved.missing_fields ?? "all";

  const tag = resolved.tag ?? "all";
  const cases = await listAdminCases({ status, scenario, intent, handoff, channel, missing_fields, tag });
  const allCases = await listAdminCases("all");
  const stats = {
    total: allCases.length,
    collecting: allCases.filter((item) => item.lead_status === "collecting_info").length,
    qualified: allCases.filter((item) => item.lead_status === "qualified").length,
    handoff: allCases.filter((item) => item.lead_status === "handed_off").length
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Case Queue</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">รายการเคสที่ต้องติดตาม</h2>
        <p className="mt-2 text-sm text-slate-600 sm:mt-3">ดูสถานะการคัดกรองลูกค้า, เคสที่พร้อมเสนอราคา, และเคสที่ต้องให้แอดมินรับช่วงต่อ</p>
        {isMockMode() ? <p className="mt-3 text-xs text-amber-600">กำลังแสดงข้อมูลจาก local mock mode โดยไม่แตะ Supabase</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <MetricCard label="เคสทั้งหมด" value={String(stats.total)} tone="slate" />
        <MetricCard label="กำลังเก็บข้อมูล" value={String(stats.collecting)} tone="amber" />
        <MetricCard label="พร้อมคัดกรอง" value={String(stats.qualified)} tone="emerald" />
        <MetricCard label="ส่งต่อแอดมิน" value={String(stats.handoff)} tone="rose" />
      </div>

      {isMockMode() ? (
        <MockScenarioControls
          scenarioOptions={mockScenarioOptions}
          current={{ scenario, intent, status, handoff, channel, missing_fields, tag } as any}
        />
      ) : null}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0">
        {statusOptions.map((item) => (
          <a
            key={item.value}
            href={`/admin/cases?status=${item.value}&scenario=${scenario}&intent=${intent}&handoff=${handoff}&channel=${channel}&missing_fields=${missing_fields}&tag=${tag}`}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition ${status === item.value ? "bg-slate-900 text-white" : "bg-white text-slate-700 active:bg-slate-100"}`}
          >
            {item.label}
          </a>
        ))}
      </div>

      <CasesTable cases={cases as any} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "slate" | "amber" | "emerald" | "rose";
}) {
  const toneMap = {
    slate: "bg-white text-slate-900",
    amber: "bg-amber-50 text-amber-900",
    emerald: "bg-emerald-50 text-emerald-900",
    rose: "bg-rose-50 text-rose-900"
  };

  return (
    <div className={`rounded-2xl p-4 shadow-sm sm:rounded-3xl sm:p-5 ${toneMap[tone]}`}>
      <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold sm:mt-2 sm:text-3xl">{value}</p>
    </div>
  );
}
