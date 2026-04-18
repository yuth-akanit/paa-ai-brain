"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function KnowledgeDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("ยืนยันการลบข้อมูลนี้?")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.refresh();
      } else {
        alert("เกิดข้อผิดพลาดในการลบข้อมูล");
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
      onClick={handleDelete}
      disabled={loading}
      className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
    >
      {loading ? "กำลังลบ..." : "ลบข้อมูล"}
    </button>
  );
}
