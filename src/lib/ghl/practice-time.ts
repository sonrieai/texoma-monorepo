/**
 * Practice timezone for Open Dental → GoHighLevel sync.
 *
 * Open Dental stores appointment wall times in America/Chicago (naive MySQL
 * DATETIME). Calendar date fields and GHL event instants must use that zone
 * explicitly — never the Node host timezone.
 */

export const PRACTICE_TIME_ZONE = "America/Chicago";

export type WallDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const NAIVE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/** Parse a naive OD datetime (`YYYY-MM-DD HH:mm:ss`) or date-only string. */
export function parseOdWallParts(
  value: string,
): WallDateTimeParts | null {
  const text = value.trim();
  if (!text || text.startsWith("0000-00-00")) return null;
  const m = NAIVE_RE.exec(text);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4] ?? "0");
  const minute = Number(m[5] ?? "0");
  const second = Number(m[6] ?? "0");
  if (
    ![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))
  ) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { year, month, day, hour, minute, second };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function wallPartsToYmd(parts: WallDateTimeParts): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function readZoneParts(utcMs: number, timeZone: string): WallDateTimeParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/**
 * Convert America/Chicago wall time to a UTC Date (DST-safe, no extra deps).
 */
export function chicagoWallToUtcDate(parts: WallDateTimeParts): Date {
  const desiredAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let utcMs = desiredAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const seen = readZoneParts(utcMs, PRACTICE_TIME_ZONE);
    const seenAsUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second,
    );
    utcMs += desiredAsUtc - seenAsUtc;
  }
  return new Date(utcMs);
}

export function chicagoWallToUtcIso(parts: WallDateTimeParts): string {
  return chicagoWallToUtcDate(parts).toISOString();
}

/** YYYY-MM-DD in America/Chicago for "today" (not UTC). */
export function todayCentralYmd(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRACTICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

/**
 * Calendar date in America/Chicago.
 * Naive OD strings are treated as Chicago wall time (date portion is the field).
 * Absolute Date values are formatted in Chicago.
 */
export function toCentralYmd(
  value: Date | string | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return todayCentralYmd(value);
  }
  const text = String(value).trim();
  if (!text || text.startsWith("0000-00-00")) return null;
  if (/Z$|[+-]\d{2}:\d{2}$/.test(text.replace(" ", "T"))) {
    const d = new Date(text.includes("T") ? text : text.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return null;
    return todayCentralYmd(d);
  }
  const parts = parseOdWallParts(text);
  if (!parts) return null;
  return wallPartsToYmd(parts);
}

/**
 * Absolute ISO instant for a GHL calendar event.
 * Naive OD DATETIME strings are America/Chicago wall times.
 */
export function odWallDateTimeToIso(
  value: Date | string | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }
  const text = String(value).trim();
  if (!text || text.startsWith("0000-00-00")) return null;
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  if (/Z$|[+-]\d{2}:\d{2}$/.test(normalized)) {
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }
  const parts = parseOdWallParts(text);
  if (!parts) return null;
  return chicagoWallToUtcIso(parts);
}
