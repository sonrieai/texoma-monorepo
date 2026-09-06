import type { NexProcedure } from "@/lib/nexhealth/client";

/** NexHealth / Open Dental procedure Complete statuses. */
export function isProcedureComplete(
  status: string | null | undefined,
): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "completed" || s === "complete" || s === "c";
}

export function procedureYmd(proc: NexProcedure): string | null {
  const raw = proc.start_date || proc.end_date || proc.updated_at;
  if (!raw) return null;
  return raw.slice(0, 10);
}

export function procedurePatientId(proc: NexProcedure): number | null {
  return typeof proc.patient_id === "number" ? proc.patient_id : null;
}

export function patientDayKey(patientId: number, ymd: string): string {
  return `${patientId}:${ymd}`;
}
