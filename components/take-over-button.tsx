"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TakeOverButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleTakeOver() {
    if (!confirm("ยืนยันให้แอดมินรับช่วงเคสนี้จาก AI ทันที?")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/take-over`, {
        method: "POST"
      });

      if (res.ok) {
        router.refresh();
      } else {
        alert("เกิดข้อผิดพลาดในการรับช่วงเคส");
      }
    } catch (error) {
      console.error(error);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleTakeOver}
      disabled={loading}
      className="w-full rounded-2xl bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
    >
      {loading ? "กำลังดำเนินการ..." : "รับช่วงจาก AI"}
    </button>
  );
}
