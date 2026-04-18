"use client";

import { cn } from "@/lib/utils";

const labelMap: Record<string, string> = {
  faq_pricing: "ถามราคา",
  faq_service_area: "ถามพื้นที่",
  repair_request: "งานซ่อม",
  inspection_request: "ขอตรวจเช็ก",
  cleaning_request: "งานล้างแอร์",
  relocation_request: "ขอย้ายแอร์",
  cold_room_request: "งานห้องเย็น",
  admin_handoff: "ขอคุยเจ้าหน้าที่",
  general_inquiry: "คำถามทั่วไป"
};

const toneMap: Record<string, string> = {
  faq_pricing: "bg-cyan-100 text-cyan-800",
  faq_service_area: "bg-sky-100 text-sky-800",
  repair_request: "bg-amber-100 text-amber-800",
  inspection_request: "bg-violet-100 text-violet-800",
  cleaning_request: "bg-emerald-100 text-emerald-800",
  relocation_request: "bg-indigo-100 text-indigo-800",
  cold_room_request: "bg-rose-100 text-rose-800",
  admin_handoff: "bg-fuchsia-100 text-fuchsia-800",
  general_inquiry: "bg-slate-200 text-slate-700"
};

export function IntentBadge({ value }: { value: string | null | undefined }) {
  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", toneMap[value ?? ""] ?? "bg-slate-200 text-slate-700")}>
      {value ? labelMap[value] ?? value : "-"}
    </span>
  );
}
