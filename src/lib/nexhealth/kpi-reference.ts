/**
 * KPI reference data from Mongo warehouse — no env-based type lists.
 */

import type { CdtLookup } from "@/lib/cdt/categories";
import { appointmentTypeId, type NexAppointment, type NexProcedure } from "@/lib/nexhealth/client";
import { isProcedureComplete } from "@/lib/nexhealth/procedure-status";

export type NpConsultTypeSource = "chart_appointments" | "none";

export type NpConsultTypeDoc = {
  nexhealthId: number;
  isNpConsult?: boolean;
};

function patientDayKey(patientId: number, ymd: string): string {
  return `${patientId}:${ymd}`;
}

function procedureYmd(proc: NexProcedure): string | null {
  const raw = proc.start_date || proc.end_date || proc.updated_at;
  if (!raw) return null;
  return raw.slice(0, 10);
}

function procedurePatientId(proc: NexProcedure): number | null {
  return typeof proc.patient_id === "number" ? proc.patient_id : null;
}

function buildConsultProcedureDays(
  procedures: NexProcedure[],
  cdt: CdtLookup,
): Set<string> {
  const days = new Set<string>();
  for (const proc of procedures) {
    if (!cdt.isConsultCode(proc.code) || !isProcedureComplete(proc.status)) {
      continue;
    }
    const patientId = procedurePatientId(proc);
    const ymd = procedureYmd(proc);
    if (patientId == null || !ymd) continue;
    days.add(patientDayKey(patientId, ymd));
  }
  return days;
}

/** Appointment types flagged in Mongo (inferred from consult procedures on sync). */
export function npConsultTypeIdsFromDocs(docs: NpConsultTypeDoc[]): number[] {
  return docs.filter((d) => d.isNpConsult).map((d) => d.nexhealthId);
}

/**
 * Infer NP consult appointment types: types scheduled on same patient-day as a
 * chart consult procedure (`cdt_codes.isConsult`).
 */
export function inferNpConsultAppointmentTypeIds(
  appointments: NexAppointment[],
  procedures: NexProcedure[],
  cdt: CdtLookup,
): number[] {
  const consultDays = buildConsultProcedureDays(procedures, cdt);
  if (consultDays.size === 0) return [];

  const ids = new Set<number>();
  for (const appt of appointments) {
    if (typeof appt.patient_id !== "number" || !appt.start_time) continue;
    const key = patientDayKey(appt.patient_id, appt.start_time.slice(0, 10));
    if (!consultDays.has(key)) continue;
    const typeId = appointmentTypeId(appt);
    if (typeId != null) ids.add(typeId);
  }
  return [...ids];
}

export function resolveNpConsultTypeIds(params: {
  appointmentTypeDocs: NpConsultTypeDoc[];
}): { ids: number[]; source: NpConsultTypeSource } {
  const ids = npConsultTypeIdsFromDocs(params.appointmentTypeDocs);
  if (ids.length > 0) return { ids, source: "chart_appointments" };
  return { ids: [], source: "none" };
}
