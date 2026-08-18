/** User-facing sync/status badge — no vendor / infrastructure names. */
export function practiceStatusBadge(input: {
  source?: "warehouse" | "live" | string;
  empty?: boolean;
  lastSyncedAt?: string | null;
}): string {
  if (input.empty) return "No data yet";
  if (input.lastSyncedAt) {
    return `Updated ${input.lastSyncedAt.slice(0, 16).replace("T", " ")}`;
  }
  return "Live";
}

export function practiceSubtitle(
  locationLabel: string,
  windowLabel = "past & next 12 months",
): string {
  const base = locationLabel.trim();
  return base ? `${base} · ${windowLabel}` : windowLabel;
}

function effectivePeriodEnd(endIso: string, now = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  const end = endIso.slice(0, 10);
  return end > today ? today : end;
}

function monthYearLabel(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/** Period chip from warehouse range (e.g. "Jun 2026" or "Aug 2025 – Aug 2026"). */
export function cockpitPeriodLabel(
  startIso: string,
  endIso: string,
  now = new Date(),
): string {
  const start = startIso.slice(0, 10);
  const end = effectivePeriodEnd(endIso, now);
  if (start === end) {
    return new Date(`${end}T12:00:00`).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (start.slice(0, 7) === end.slice(0, 7)) return monthYearLabel(end);
  return `${monthYearLabel(start)} – ${monthYearLabel(end)}`;
}
