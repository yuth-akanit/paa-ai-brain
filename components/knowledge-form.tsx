"use client";

import { useState, useTransition } from "react";

const initialState = {
  title: "",
  category: "faq",
  tags: "faq, line, hvac",
  content: "",
  status: "published"
};

export function KnowledgeForm() {
  const [form, setForm] = useState(initialState);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="rounded-3xl bg-white p-6 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);

        startTransition(async () => {
          const response = await fetch("/api/admin/knowledge", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              ...form,
              tags: form.tags
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            })
          });

          if (!response.ok) {
            setMessage("บันทึกข้อมูลไม่สำเร็จ");
            return;
          }

          setForm(initialState);
          const payload = await response.json();
          setMessage(payload.mode === "mock" ? "mock mode: จำลองการบันทึกข้อมูลเรียบร้อย (ไม่มีการเขียนลงฐานจริง)" : "บันทึกคลังความรู้เรียบร้อย");
          if (payload.mode !== "mock") {
            window.location.reload();
          }
        });
      }}
    >
      <h2 className="text-lg font-semibold text-slate-900">เพิ่มข้อมูลคลังความรู้</h2>

      <div className="mt-4 grid gap-4">
        <Input label="หัวข้อ" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} />
        <Input label="หมวดหมู่" value={form.category} onChange={(value) => setForm((current) => ({ ...current, category: value }))} />
        <Input label="แท็ก (คั่นด้วย comma)" value={form.tags} onChange={(value) => setForm((current) => ({ ...current, tags: value }))} />
        <label className="grid gap-2 text-sm text-slate-700">
          <span>เนื้อหา</span>
          <textarea
            className="min-h-40 rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-0 focus:border-emerald-400"
            value={form.content}
            onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-6 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
      >
        {isPending ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
      </button>

      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </form>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm text-slate-700">
      <span>{label}</span>
      <input
        className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-400"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
