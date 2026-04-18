"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navItems: Array<{ href: Route; label: string }> = [
  { href: "/admin/cases", label: "เคสงาน" },
  { href: "/admin/knowledge", label: "คลังความรู้" }
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* ── Mobile top bar ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-slate-900 px-4 py-3 text-white lg:hidden">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">PAA Air Service</p>
          <p className="text-sm font-semibold">Admin Console</p>
        </div>
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="rounded-xl bg-slate-800 p-2 transition active:bg-slate-700"
          aria-label="Toggle navigation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {mobileNavOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </header>

      {/* ── Mobile nav dropdown ── */}
      {mobileNavOpen && (
        <nav className="sticky top-[52px] z-20 flex gap-2 bg-slate-900 px-4 pb-3 lg:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                "flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-medium transition",
                pathname.startsWith(item.href) ? "bg-emerald-400 text-slate-950" : "bg-slate-800 text-slate-200 active:bg-slate-700"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      {/* ── Desktop layout with sidebar ── */}
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[240px_1fr] lg:py-6">
        {/* Desktop sidebar — hidden on mobile */}
        <aside className="hidden rounded-3xl bg-slate-900 p-6 text-white lg:block">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">PAA Air Service</p>
            <h1 className="mt-2 text-2xl font-semibold">Admin Console</h1>
            <p className="mt-2 text-sm text-slate-300">ระบบคัดกรองลูกค้าและส่งต่องานจาก LINE OA</p>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block rounded-2xl px-4 py-3 text-sm transition",
                  pathname.startsWith(item.href) ? "bg-emerald-400 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
