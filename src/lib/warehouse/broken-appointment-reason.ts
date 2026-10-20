/**
 * Open Dental marks both no-shows and cancellations as Broken (AptStatus 5).
 * The front desk posts D9986 (missed) or D9987 (cancelled) to tell them apart,
 * without linking the procedure to the appointment. Cancellations are often
 * posted days before the visit, so the nearest code for the same patient wins.
 */

import {
  isProcedureComplete,
  procedurePatientId,
  procedureYmd,
} from "@/lib/warehouse/procedure-status";
import type { AppointmentRecord, ProcedureRecord } from "@/lib/warehouse/types";

export type BrokenReason = "missed" | "cancelled";

export const MISSED_APPOINTMENT_CODE = "D9986";
export const CANCELLED_APPOINTMENT_CODE = "D9987";

/** Days before the visit a D9986/D9987 may be posted and still match it. */
export const BROKEN_REASON_DAYS_BEFORE = 30;
/** Days after the visit a D9986/D9987 may be posted and still match it. */
export const BROKEN_REASON_DAYS_AFTER = 7;

type Marker = { ymd: string; reason: BrokenReason };

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = new Date(`${fromYmd}T12:00:00Z`).getTime();
  const to = new Date(`${toYmd}T12:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
}

function reasonForCode(code: unknown): BrokenReason | null {
  const key = String(code ?? "").trim().toUpperCase();
  if (key === MISSED_APPOINTMENT_CODE) return "missed";
  if (key === CANCELLED_APPOINTMENT_CODE) return "cancelled";
  return null;
}

function compareRank(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

function appointmentStatus(appt: AppointmentRecord): string {
  return String(appt.apt_status ?? appt.appointment_status ?? appt.status ?? "")
    .trim()
    .toLowerCase();
}

function isBrokenOrUnscheduled(appt: AppointmentRecord): boolean {
  const status = appointmentStatus(appt);
  return status === "broken" || status === "unschedlist";
}

function appointmentYmd(appt: AppointmentRecord): string | null {
  const start = appt.start_time;
  return typeof start === "string" && start.length >= 10 ? start.slice(0, 10) : null;
}

/**
 * Sets `broken_reason` on Broken and Unscheduled-list appointments that have a
 * nearby D9986/D9987 for the same patient. Returns the same array.
 */
export function annotateBrokenReasons(
  appointments: AppointmentRecord[],
  procedures: ProcedureRecord[],
): AppointmentRecord[] {
  const markersByPatient = new Map<number, Marker[]>();
  for (const proc of procedures) {
    const reason = reasonForCode(proc.code);
    if (!reason || !isProcedureComplete(proc.status)) continue;
    const patientId = procedurePatientId(proc);
    const ymd = procedureYmd(proc);
    if (patientId == null || !ymd) continue;
    const list = markersByPatient.get(patientId) ?? [];
    list.push({ ymd, reason });
    markersByPatient.set(patientId, list);
  }

  for (const appt of appointments) {
    if (!isBrokenOrUnscheduled(appt)) continue;
    const patientId = appt.patient_id;
    const ymd = appointmentYmd(appt);
    if (patientId == null || !ymd) continue;
    const markers = markersByPatient.get(patientId);
    if (!markers) continue;

    let best: { reason: BrokenReason; rank: [number, number, number] } | null = null;
    for (const marker of markers) {
      const daysBefore = daysBetweenYmd(marker.ymd, ymd);
      if (daysBefore > BROKEN_REASON_DAYS_BEFORE || daysBefore < -BROKEN_REASON_DAYS_AFTER) {
        continue;
      }
      // Ties: posted on/before the visit wins, then D9986 over D9987.
      const rank: [number, number, number] = [
        Math.abs(daysBefore),
        daysBefore < 0 ? 1 : 0,
        marker.reason === "missed" ? 0 : 1,
      ];
      if (!best || compareRank(rank, best.rank) < 0) best = { reason: marker.reason, rank };
    }
    if (best) appt.broken_reason = best.reason;
  }
  return appointments;
}
