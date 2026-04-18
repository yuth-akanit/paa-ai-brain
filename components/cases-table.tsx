import Link from "next/link";

import { IntentBadge } from "@/components/intent-badge";
import { StatusBadge } from "@/components/status-badge";
import { cn, formatThaiDate } from "@/lib/utils";

type CaseRow = {
  id: string;
  lead_status: string;
  service_type: string | null;
  ai_intent?: string | null;
  ai_confidence?: number | null;
  should_handoff?: boolean | null;
  scenario_label?: string | null;
  summary: string | null;
  missing_fields?: string[] | null;
  extracted_fields?: {
    area?: string;
    urgency?: string;
    preferred_date?: string;
  } | null;
  handoff_reason?: string | null;
  updated_at: string;
  customers?: {
    display_name: string | null;
    phone: string | null;
  } | null;
};

const serviceLabels: Record<string, string> = {
  cleaning: "ล้างแอร์",
  repair: "งานซ่อม",
  inspection: "ตรวจเช็ก",
  relocation: "ย้ายแอร์",
  cold_room: "ห้องเย็น",
  other: "งานอื่น ๆ"
};

const urgencyTone: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-rose-100 text-rose-800"
};

function formatServiceType(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return serviceLabels[value] ?? value;
}

function formatMissingFields(value: string[] | null | undefined) {
  if (!value || value.length === 0) {
    return "ข้อมูลครบระดับพร้อมดำเนินการ";
  }

  return `รอเก็บเพิ่ม: ${value.join(", ")}`;
}

function isManualTakeover(item: CaseRow) {
  return item.handoff_reason === "admin_manual_takeover";
}

/* ──────────────────────────────────────────────────────
   Mobile card for each case
   ────────────────────────────────────────────────────── */
function CaseCard({ item }: { item: CaseRow }) {
  return (
    <Link
      href={`/admin/cases/${item.id}`}
      className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60 transition active:scale-[0.98] active:bg-slate-50"
    >
      {/* Top row: customer name + service type */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900">
            {item.customers?.display_name || "ยังไม่ทราบชื่อ"}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {item.customers?.phone || "-"} · #{item.id.slice(0, 8)}
          </p>
        </div>
        <p className="shrink-0 text-sm font-medium text-slate-700">
          {formatServiceType(item.service_type)}
        </p>
      </div>

      {/* Badges row */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge value={item.lead_status} />
        {item.ai_intent ? <IntentBadge value={item.ai_intent} /> : null}
        {isManualTakeover(item) ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">แอดมินรับช่วงเอง</span>
        ) : null}
        {item.extracted_fields?.urgency ? (
          <span className={cn("rounded-full px-2.5 py-1 text-xs", urgencyTone[item.extracted_fields.urgency] ?? "bg-slate-100 text-slate-700")}>
            {item.extracted_fields.urgency === "high" ? "เร่งด่วน" : item.extracted_fields.urgency === "medium" ? "ปานกลาง" : "ทั่วไป"}
          </span>
        ) : null}
        {item.extracted_fields?.preferred_date ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">{item.extracted_fields.preferred_date}</span>
        ) : null}
      </div>

      {/* Summary + meta */}
      {item.summary ? (
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{item.summary}</p>
      ) : null}

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>{formatMissingFields(item.missing_fields)}</span>
        <span className="shrink-0">{formatThaiDate(item.updated_at)}</span>
      </div>

      {item.should_handoff ? (
        <p className="mt-2 text-xs font-medium text-rose-700">ระบบแนะนำให้ส่งต่อแอดมิน</p>
      ) : null}
      {isManualTakeover(item) ? (
        <p className="mt-1 text-xs font-medium text-amber-800">เคสนี้แอดมินกดรับช่วงจาก AI เอง</p>
      ) : null}
      {item.handoff_reason ? (
        <p className="mt-1 text-xs font-medium text-rose-700">เหตุผลส่งต่อ: {item.handoff_reason}</p>
      ) : null}
    </Link>
  );
}

/* ──────────────────────────────────────────────────────
   Main component — cards on mobile, table on desktop
   ────────────────────────────────────────────────────── */
export function CasesTable({ cases }: { cases: CaseRow[] }) {
  if (cases.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">ยังไม่มีเคสในมุมมองนี้</h3>
        <p className="mt-2 text-sm text-slate-500">ลองเปลี่ยนตัวกรองสถานะ หรือสลับไปดู mock scenarios อื่นเพื่อทดสอบหน้าแอดมินได้ครับ</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Mobile: card list ── */}
      <div className="space-y-3 lg:hidden">
        {cases.map((item) => (
          <CaseCard key={item.id} item={item} />
        ))}
      </div>

      {/* ── Desktop: full table ── */}
      <div className="hidden overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/70 lg:block">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr className="text-left text-sm text-slate-500">
              <th className="px-6 py-4 font-medium">ลูกค้า</th>
              <th className="px-6 py-4 font-medium">ประเภทงาน</th>
              <th className="px-6 py-4 font-medium">สถานะ</th>
              <th className="px-6 py-4 font-medium">ภาพรวมเคส</th>
              <th className="px-6 py-4 font-medium">อัปเดตล่าสุด</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {cases.map((item) => (
              <tr key={item.id} className="align-top text-sm transition hover:bg-slate-50/80">
                <td className="px-6 py-4">
                  <Link href={`/admin/cases/${item.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                    {item.customers?.display_name || "ยังไม่ทราบชื่อ"}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">{item.customers?.phone || "-"}</p>
                  <p className="mt-2 text-xs text-slate-400">#{item.id.slice(0, 8)}</p>
                </td>
                <td className="px-6 py-4 text-slate-700">
                  <div className="space-y-2">
                    <p className="font-medium text-slate-900">{formatServiceType(item.service_type)}</p>
                    <div className="flex flex-wrap gap-2">
                      {item.ai_intent ? <IntentBadge value={item.ai_intent} /> : null}
                      {isManualTakeover(item) ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">แอดมินรับช่วงเอง</span>
                      ) : null}
                      {item.extracted_fields?.area ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{item.extracted_fields.area}</span> : null}
                      {item.extracted_fields?.urgency ? (
                        <span className={cn("rounded-full px-2.5 py-1 text-xs", urgencyTone[item.extracted_fields.urgency] ?? "bg-slate-100 text-slate-700")}>
                          {item.extracted_fields.urgency === "high" ? "เร่งด่วน" : item.extracted_fields.urgency === "medium" ? "ปานกลาง" : "ทั่วไป"}
                        </span>
                      ) : null}
                      {item.extracted_fields?.preferred_date ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">{item.extracted_fields.preferred_date}</span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-2">
                    <StatusBadge value={item.lead_status} />
                    {item.ai_confidence !== null && item.ai_confidence !== undefined ? (
                      <p className="text-xs text-slate-500">มั่นใจ {Math.round(item.ai_confidence * 100)}%</p>
                    ) : null}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">
                  <div className="space-y-2">
                    <p className="line-clamp-2 leading-6">{item.summary || "-"}</p>
                    <p className="text-xs text-slate-500">{formatMissingFields(item.missing_fields)}</p>
                    {item.scenario_label ? <p className="text-xs text-slate-400">scenario: {item.scenario_label}</p> : null}
                    {item.should_handoff ? <p className="text-xs font-medium text-rose-700">ระบบแนะนำให้ส่งต่อแอดมิน</p> : null}
                    {isManualTakeover(item) ? <p className="text-xs font-medium text-amber-800">เคสนี้แอดมินกดรับช่วงจาก AI เอง</p> : null}
                    {item.handoff_reason ? <p className="text-xs font-medium text-rose-700">เหตุผลส่งต่อ: {item.handoff_reason}</p> : null}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-500">
                  <div className="space-y-2">
                    <p>{formatThaiDate(item.updated_at)}</p>
                    <Link href={`/admin/cases/${item.id}`} className="inline-flex text-xs font-medium text-emerald-700 hover:text-emerald-800">
                      เปิดรายละเอียด
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
