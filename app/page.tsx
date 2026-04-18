import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#d1fae5,transparent_35%),linear-gradient(180deg,#0f172a,#1e293b)] px-6 py-20 text-white">
      <div className="max-w-3xl rounded-[32px] border border-white/10 bg-white/10 p-10 backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-emerald-200">PAA Air Service</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight">PAA AI Customer Service System</h1>
        <p className="mt-4 text-lg leading-8 text-slate-200">
          ระบบคัดกรองลูกค้า, เก็บข้อมูลหน้างาน, สรุปเคส และส่งต่อแอดมิน สำหรับ LINE OA และช่องทางแชตในอนาคต
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/admin/cases" className="rounded-2xl bg-emerald-300 px-5 py-3 font-medium text-slate-950">
            ไปที่ Admin Dashboard
          </Link>
          <Link href="/admin/knowledge" className="rounded-2xl border border-white/20 px-5 py-3 font-medium text-white">
            จัดการคลังความรู้
          </Link>
        </div>
      </div>
    </main>
  );
}
