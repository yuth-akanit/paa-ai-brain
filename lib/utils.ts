export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function formatThaiDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(date);
}

export function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === null || item === undefined) {
        return false;
      }

      if (typeof item === "string") {
        return item.trim().length > 0;
      }

      if (Array.isArray(item)) {
        return item.length > 0;
      }

      return true;
    })
  ) as Partial<T>;
}

export function jsonResponse<T>(data: T, init?: ResponseInit) {
  return Response.json(data, init);
}

export function isMeaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== "string") return true;

  const v = value.trim().toLowerCase();
  return v !== "" && v !== "null" && v !== "undefined" && v !== "-";
}

export function joinMeaningful(parts: unknown[], sep = " / "): string {
  return parts
    .filter(isMeaningful)
    .map((v) => String(v).trim())
    .join(sep);
}

export function finalClean(text: string): string {
  return text
    .replace(/\bnull\b\s*(\(\s*null\s*\))?/gi, "")
    .replace(/(\s+\/)+\s+/g, " / ")         // Normalize standalone separators ' /  / ' -> ' / '
    .replace(/^[ \t]*\/[ \t]*/gm, "")       // Remove leading separator on any line
    .replace(/[ \t]*\/[ \t]*$/gm, "")       // Remove trailing separator on any line
    .replace(/[^\S\n]{2,}/g, " ")           // Collapse multiple spaces (but NOT newlines)
    .replace(/\n{3,}/g, "\n\n")             // Max 2 consecutive newlines
    .trim();
}
