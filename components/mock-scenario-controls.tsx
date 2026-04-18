"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Option = {
  value: string;
  label: string;
};

type MockScenarioControlsProps = {
  scenarioOptions: Option[];
  current: {
    scenario: string;
    intent: string;
    status: string;
    handoff: string;
    tag?: string;
  };
};

const intentOptions: Option[] = [
  { value: "all", label: "ทุก intent" },
  { value: "faq_pricing", label: "ถามราคา" },
  { value: "faq_service_area", label: "ถามพื้นที่" },
  { value: "repair_request", label: "งานซ่อม" },
  { value: "inspection_request", label: "ขอตรวจเช็ก" },
  { value: "cleaning_request", label: "งานล้างแอร์" },
  { value: "relocation_request", label: "ขอย้ายแอร์" },
  { value: "cold_room_request", label: "งานห้องเย็น" },
  { value: "admin_handoff", label: "ขอคุยเจ้าหน้าที่" },
  { value: "general_inquiry", label: "คำถามทั่วไป" }
];

const statusOptions: Option[] = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "new", label: "เคสใหม่" },
  { value: "collecting_info", label: "กำลังเก็บข้อมูล" },
  { value: "qualified", label: "พร้อมคัดกรอง" },
  { value: "handed_off", label: "ส่งต่อแอดมิน" },
  { value: "closed", label: "ปิดเคส" }
];

const handoffOptions: Option[] = [
  { value: "all", label: "ทุกการตัดสินใจ" },
  { value: "true", label: "เฉพาะเคสส่งต่อ" },
  { value: "false", label: "เฉพาะเคสไม่ส่งต่อ" }
];

const channelOptions: Option[] = [
  { value: "all", label: "ทุกช่องทาง" },
  { value: "line", label: "LINE" },
  { value: "whatsapp", label: "WhatsApp" }
];

const missingFieldsOptions: Option[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "true", label: "มีข้อมูลที่ขาด" },
  { value: "false", label: "ข้อมูลครบ" }
];

const tagOptions: Option[] = [
  { value: "all", label: "ทุกกลุ่ม" },
  { value: "faq", label: "FAQ" },
  { value: "repair", label: "งานซ่อม" },
  { value: "commercial", label: "งานธุรกิจ" },
  { value: "critical", label: "วิกฤต" }
];

export function MockScenarioControls({ scenarioOptions, current }: MockScenarioControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (!value || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false });
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Control
          label="Scenario"
          value={current.scenario}
          options={[{ value: "all", label: "ทุก scenario" }, ...scenarioOptions]}
          onChange={(value) => setParam("scenario", value)}
        />
        <Control label="Intent" value={current.intent} options={intentOptions} onChange={(value) => setParam("intent", value)} />
        <Control label="Lead Status" value={current.status} options={statusOptions} onChange={(value) => setParam("status", value)} />
        <Control label="Handoff" value={current.handoff} options={handoffOptions} onChange={(value) => setParam("handoff", value)} />
        <Control label="Channel" value={(current as any).channel} options={channelOptions} onChange={(value) => setParam("channel", value)} />
        <Control
          label="Missing Info"
          value={(current as any).missing_fields}
          options={missingFieldsOptions}
          onChange={(value) => setParam("missing_fields", value)}
        />
        <Control
          label="Scenario Group"
          value={current.tag || "all"}
          options={tagOptions}
          onChange={(value) => setParam("tag", value)}
        />
      </div>
    </div>
  );
}

function Control({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm text-slate-700">
      <span>{label}</span>
      <select
        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-emerald-400"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
