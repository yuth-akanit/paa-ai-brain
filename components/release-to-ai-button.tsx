"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReleaseToAiButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRelease() {
    if (!confirm("ยืนยันการคืนเคสนี้ให้ AI ดูแลต่อ?")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/release`, {
        method: "POST",
      });

      if (res.ok) {
        router.refresh();
      } else {
        alert("เกิดข้อผิดพลาดในการคืนเคส");
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
      onClick={handleRelease}
      disabled={loading}
      className="w-full rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {loading ? "กำลังดำเนินการ..." : "คืนให้ AI ดูแลต่อ"}
    </button>
  );
}
