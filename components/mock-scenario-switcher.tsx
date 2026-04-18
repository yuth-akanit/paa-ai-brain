"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";

type ScenarioOption = {
  value: string;
  label: string;
  caseId: string;
};

export function MockScenarioSwitcher({
  options,
  currentScenario,
  fallbackCaseId
}: {
  options: ScenarioOption[];
  currentScenario: string;
  fallbackCaseId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <label className="grid gap-2 text-sm text-slate-700">
      <span>Scenario</span>
      <select
        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-emerald-400"
        value={currentScenario}
        onChange={(event) => {
          const nextScenario = event.target.value;
          const option = options.find((item) => item.value === nextScenario);
          const params = new URLSearchParams(searchParams.toString());

          if (nextScenario) {
            params.set("scenario", nextScenario);
          } else {
            params.delete("scenario");
          }

          router.replace(`/admin/cases/${option?.caseId ?? fallbackCaseId}?${params.toString()}` as Route, { scroll: false });
        }}
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
