/**
 * One-time od_consult_date backfill for contacts the incremental sync never touched.
 * Uses the same consult rules as the live sync. Holds PatNums and dates only.
 */

import { isConsultAppointment } from "@/lib/ghl/od-disposition-tags";
import { nextConsultDateYmd } from "@/lib/ghl/od-ghl-sync-plan";

export type ConsultBackfillAction = "set" | "change" | "clear" | "unchanged";

type FutureAppt = {
  AptNum: number;
  PatNum: number;
  AptDateTime: Date | string | null;
  AppointmentTypeName: string | null;
};

/** PatNum → earliest future consult date (America/Chicago YYYY-MM-DD). */
export function nextConsultDateByPatient(
  futureAppts: readonly FutureAppt[],
  codesByApt: ReadonlyMap<number, readonly string[]>,
): Map<number, string> {
  const byPat = new Map<number, FutureAppt[]>();
  for (const row of futureAppts) {
    const list = byPat.get(row.PatNum) ?? [];
    list.push(row);
    byPat.set(row.PatNum, list);
  }
  const out = new Map<number, string>();
  for (const [patNum, rows] of byPat) {
    const sorted = [...rows].sort((a, b) =>
      String(a.AptDateTime ?? "").localeCompare(String(b.AptDateTime ?? "")),
    );
    const ymd = nextConsultDateYmd(
      sorted.map((row) => ({
        AptDateTime: row.AptDateTime,
        isConsult: isConsultAppointment({
          appointmentTypeName: row.AppointmentTypeName,
          procedureCodes: codesByApt.get(row.AptNum) ?? [],
        }),
      })),
    );
    if (ymd) out.set(patNum, ymd);
  }
  return out;
}

/**
 * GHL date custom fields come back as YYYY-MM-DD, an ISO string, or epoch ms
 * (midnight UTC of the stored date).
 */
export function ghlDateFieldYmd(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number" || /^\d{11,}$/.test(String(value).trim())) {
    const ms = Number(value);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match ? match[1] : null;
}

/**
 * `next` is the date OD says should be on the contact (null = no future consult).
 * Clearing is only allowed for contacts this sync already linked.
 */
export function consultDateBackfillAction(params: {
  current: string | null;
  next: string | null;
  linked: boolean;
}): ConsultBackfillAction {
  const { current, next } = params;
  if (next) {
    if (!current) return "set";
    return current === next ? "unchanged" : "change";
  }
  if (current && params.linked) return "clear";
  return "unchanged";
}
