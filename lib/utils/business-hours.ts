const TZ = "Asia/Bangkok";

export type BusinessStatus = {
  isOpen: boolean;       // Mon-Sat 09:00-18:00
  isNightOnly: boolean;  // Mon-Sat after 18:00 — repair jobs only, 2x rate
  isClosed: boolean;     // Sunday
  hour: number;
  day: number;           // 0=Sun … 6=Sat
};

export function getBusinessStatus(now: Date = new Date()): BusinessStatus {
  const bkk = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    weekday: "short",
    hour12: false
  }).formatToParts(now);

  const hourStr = bkk.find(p => p.type === "hour")?.value ?? "12";
  const weekdayStr = bkk.find(p => p.type === "weekday")?.value ?? "Mon";

  const hour = parseInt(hourStr, 10);
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
  };
  const day = weekdayMap[weekdayStr] ?? 1;

  const isClosed = day === 0;
  const isOpen = !isClosed && hour >= 9 && hour < 18;
  const isNightOnly = !isClosed && !isOpen;

  return { isOpen, isNightOnly, isClosed, hour, day };
}

export function buildBusinessHoursPromptNote(status: BusinessStatus): string {
  if (status.isClosed) {
    return `[ข้อมูลเวลาทำการ: ขณะนี้เป็นวันอาทิตย์ — หยุดทำการ ถ้าลูกค้าถามว่ามีคิวไหม ให้แจ้งว่าหยุดวันอาทิตย์ครับ เปิดวันจันทร์ถึงเสาร์ 09.00-18.00 น. หลัง 18.00 รับเฉพาะงานซ่อมด่วน ค่าแรง x2]`;
  }
  if (status.isNightOnly) {
    return `[ข้อมูลเวลาทำการ: ขณะนี้เลย 18.00 น. แล้ว — รับเฉพาะงานซ่อมด่วนนอกเวลา ค่าแรงคิด x2 ถ้าลูกค้าขอจองล้างแอร์/ติดตั้ง/อื่นๆ ที่ไม่ใช่งานซ่อม ให้แจ้งว่านัดหมายปกติได้วันจันทร์-เสาร์ 09.00-18.00 น.]`;
  }
  return `[ข้อมูลเวลาทำการ: จันทร์-เสาร์ 09.00-18.00 น. / หลัง 18.00 รับเฉพาะงานซ่อม ค่าแรง x2 / หยุดวันอาทิตย์]`;
}
