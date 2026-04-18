import { cn } from "@/lib/utils";

const statusMap: Record<string, string> = {
  new: "bg-slate-200 text-slate-800",
  collecting_info: "bg-amber-100 text-amber-800",
  qualified: "bg-emerald-100 text-emerald-800",
  quoted: "bg-cyan-100 text-cyan-800",
  handed_off: "bg-rose-100 text-rose-800",
  closed: "bg-slate-300 text-slate-700",
  open: "bg-sky-100 text-sky-800",
  waiting_customer: "bg-amber-100 text-amber-800"
};

const labelMap: Record<string, string> = {
  new: "เคสใหม่",
  collecting_info: "กำลังเก็บข้อมูล",
  qualified: "พร้อมคัดกรอง",
  quoted: "เสนอราคาแล้ว",
  handed_off: "ส่งต่อแอดมิน",
  closed: "ปิดเคส",
  open: "เปิดอยู่",
  waiting_customer: "รอลูกค้าตอบ"
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", statusMap[value ?? ""] ?? "bg-slate-200 text-slate-700")}>
      {value ? labelMap[value] ?? value : "-"}
    </span>
  );
}
