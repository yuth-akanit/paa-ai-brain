import type { ExtractedCaseFields } from "../types";

const BANGKOK_TIMEZONE = "Asia/Bangkok";

const THAI_WEEKDAY_TO_INDEX: Record<string, number> = {
  "อาทิตย์": 0,
  "จันทร์": 1,
  "อังคาร": 2,
  "พุธ": 3,
  "พฤหัส": 4,
  "พฤหัสบดี": 4,
  "ศุกร์": 5,
  "เสาร์": 6
};

const THAI_MONTH_TO_INDEX: Record<string, number> = {
  "ม.ค.": 1,
  "มกราคม": 1,
  "ก.พ.": 2,
  "กุมภาพันธ์": 2,
  "มี.ค.": 3,
  "มีนาคม": 3,
  "เม.ย.": 4,
  "เมษายน": 4,
  "พ.ค.": 5,
  "พฤษภาคม": 5,
  "มิ.ย.": 6,
  "มิถุนายน": 6,
  "ก.ค.": 7,
  "กรกฎาคม": 7,
  "ส.ค.": 8,
  "สิงหาคม": 8,
  "ก.ย.": 9,
  "กันยายน": 9,
  "ต.ค.": 10,
  "ตุลาคม": 10,
  "พ.ย.": 11,
  "พฤศจิกายน": 11,
  "ธ.ค.": 12,
  "ธันวาคม": 12
};

function getBangkokDateParts(reference = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(reference);

  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(pick("year"));
  const month = Number(pick("month"));
  const day = Number(pick("day"));
  const weekdayToken = pick("weekday");
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    year,
    month,
    day,
    weekday: weekdayMap[weekdayToken] ?? 0
  };
}

function formatIsoDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysBangkok(reference: Date, days: number) {
  const parts = getBangkokDateParts(reference);
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  return utcDate;
}

function resolveThaiDate(text: string, reference = new Date()) {
  const normalized = text.trim();
  if (!normalized) return null;

  const isoMatch = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const thaiAbsoluteMatch = normalized.match(/\b(?:วัน)?(?:จันทร์|อังคาร|พุธ|พฤหัส(?:บดี)?|ศุกร์|เสาร์|อาทิตย์)?\s*(\d{1,2})\s*(ม\.ค\.|มกราคม|ก\.พ\.|กุมภาพันธ์|มี\.ค\.|มีนาคม|เม\.ย\.|เมษายน|พ\.ค\.|พฤษภาคม|มิ\.ย\.|มิถุนายน|ก\.ค\.|กรกฎาคม|ส\.ค\.|สิงหาคม|ก\.ย\.|กันยายน|ต\.ค\.|ตุลาคม|พ\.ย\.|พฤศจิกายน|ธ\.ค\.|ธันวาคม)\s*(\d{2,4})?/);
  if (thaiAbsoluteMatch) {
    const day = Number(thaiAbsoluteMatch[1]);
    const month = THAI_MONTH_TO_INDEX[thaiAbsoluteMatch[2]];
    const bangkokNow = getBangkokDateParts(reference);
    const rawYear = thaiAbsoluteMatch[3];
    let year = rawYear ? Number(rawYear) : bangkokNow.year;
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const thaiDateMatch = normalized.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (thaiDateMatch) {
    const day = Number(thaiDateMatch[1]);
    const month = Number(thaiDateMatch[2]);
    // Ignore time-like values such as "14.00" and keep looking for weekday/text dates.
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const rawYear = thaiDateMatch[3];
      const bangkokNow = getBangkokDateParts(reference);
      let year = rawYear ? Number(rawYear) : bangkokNow.year;
      if (year < 100) year += 2000;
      if (year > 2400) year -= 543;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  if (normalized.includes("วันนี้")) {
    return formatIsoDate(addDaysBangkok(reference, 0));
  }

  if (normalized.includes("พรุ่งนี้")) {
    return formatIsoDate(addDaysBangkok(reference, 1));
  }

  if (normalized.includes("มะรืน")) {
    return formatIsoDate(addDaysBangkok(reference, 2));
  }

  const weekdayMatch = normalized.match(/(?:วัน)?(จันทร์|อังคาร|พุธ|พฤหัส(?:บดี)?|ศุกร์|เสาร์|อาทิตย์)(นี้|หน้า)?/);
  if (weekdayMatch) {
    const bangkokNow = getBangkokDateParts(reference);
    const targetWeekday = THAI_WEEKDAY_TO_INDEX[weekdayMatch[1]];
    if (typeof targetWeekday === "number") {
      const suffix = weekdayMatch[2] ?? "";
      let delta = (targetWeekday - bangkokNow.weekday + 7) % 7;

      if (suffix === "หน้า") {
        delta = delta === 0 ? 7 : delta + 7;
      }

      return formatIsoDate(addDaysBangkok(reference, delta));
    }
  }

  return null;
}

export function hasExplicitAbsoluteThaiDate(text: string) {
  return /\b\d{1,2}\s*(ม\.ค\.|มกราคม|ก\.พ\.|กุมภาพันธ์|มี\.ค\.|มีนาคม|เม\.ย\.|เมษายน|พ\.ค\.|พฤษภาคม|มิ\.ย\.|มิถุนายน|ก\.ค\.|กรกฎาคม|ส\.ค\.|สิงหาคม|ก\.ย\.|กันยายน|ต\.ค\.|ตุลาคม|พ\.ย\.|พฤศจิกายน|ธ\.ค\.|ธันวาคม)\s*(\d{2,4})?/.test(text.trim());
}

function padTime(hours: number, minutes = 0) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isExactTimeValue(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function resolveThaiTime(text: string) {
  const normalized = text.trim();
  if (!normalized) return null;

  // Period keywords PRIORITY - if the user says "ช่วงบ่าย", we use that even if other numbers exist
  if (normalized.includes("ช่วงเช้า") || normalized === "เช้า" || normalized.includes("ตอนเช้า")) {
    return "ช่วงเช้า";
  }
  if (normalized.includes("ช่วงบ่าย") || normalized === "บ่าย" || normalized.includes("ตอนบ่าย")) {
    return "ช่วงบ่าย";
  }
  if (normalized.includes("ช่วงเย็น") || normalized === "เย็น" || normalized.includes("ตอนเย็น")) {
    return "ช่วงเย็น";
  }

  // Exact time HH:MM or HH.MM - MUST have separator to avoid house number collisions (e.g. 14/255)
  const hhmmMatch = normalized.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (hhmmMatch) {
    return padTime(Number(hhmmMatch[1]), Number(hhmmMatch[2]));
  }

  const halfHourMatch = normalized.match(/\b(\d{1,2})\s*โมง\s*ครึ่ง\b/);
  if (halfHourMatch) {
    return padTime(Number(halfHourMatch[1]), 30);
  }

  const hourMatch = normalized.match(/\b(\d{1,2})\s*โมง\b/);
  if (hourMatch) {
    return padTime(Number(hourMatch[1]), 0);
  }

  return null;
}

export function normalizeScheduleFields(fields: ExtractedCaseFields, messageText: string, reference = new Date()): ExtractedCaseFields {
  const nextFields: ExtractedCaseFields = { ...fields };
  const dateSource = [fields.preferred_date, messageText].filter(Boolean).join(" ");
  // Use messageText only — stale preferred_time from DB state must not re-confirm itself across turns
  const timeSource = messageText;

  const normalizedDate = resolveThaiDate(dateSource, reference);
  const normalizedTime = resolveThaiTime(timeSource);

  if (normalizedDate) {
    nextFields.preferred_date_iso = normalizedDate;
  }

  if (normalizedTime) {
    nextFields.preferred_time = normalizedTime;
    if (isExactTimeValue(normalizedTime)) {
      nextFields.preferred_time_exact = normalizedTime;
    }
  }

  return nextFields;
}

export function hasNormalizedPreferredDate(fields: ExtractedCaseFields) {
  return Boolean(fields.preferred_date_iso || resolveThaiDate(fields.preferred_date ?? ""));
}

export function hasExactPreferredTime(fields: ExtractedCaseFields) {
  return Boolean(fields.preferred_time_exact || (fields.preferred_time && isExactTimeValue(fields.preferred_time)));
}
