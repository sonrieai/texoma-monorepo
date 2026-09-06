/**
 * PHI-safe new-patient conversion aggregates (counts + dollars only).
 * Consult = Mongo `cdt_codes.isConsult` or configured appointment types;
 * show rate Complete ÷ (Complete + Broken); 66/67 drop; 69 miss;
 * same-day = sold codes; TP closed = all procs Complete.
 */

import {
  emptyCdtLookup,
  type CdtLookup,
} from "@/lib/cdt/categories";
import {
  resolveNpConsultTypeIds,
  type NpConsultTypeDoc,
} from "@/lib/nexhealth/kpi-reference";
import {
  isProcedureComplete,
  patientDayKey,
  procedurePatientId,
  procedureYmd,
} from "@/lib/nexhealth/procedure-status";
import { safeRate } from "@/lib/metrics";
import {
  appointmentTypeId,
  mapAttendance,
  nexPriceToCents,
  type NexAppointment,
  type NexAppointmentType,
  type NexProcedure,
  type NexTreatmentPlan,
} from "@/lib/nexhealth/client";

const OD_CONFIRM_CANCEL = new Set([66, 67]);
const OD_CONFIRM_NO_SHOW = new Set([69]);

const OD_CONFIRM_FIELD_KEYS = [
  "confirmation_status",
  "confirm_status",
  "confirmation",
  "confirmation_id",
  "confirm_id",
  "od_confirm",
  "def_num",
] as const;

export type ConversionSummary = {
  available: boolean;
  /** First completed non-consult appointment whose date falls in the period. */
  newPatients: number;
  npConsultTypeIds: number[];
  npConsultBooked: number;
  npConsultShow: number;
  npConsultNoShow: number;
  npConsultCancelled: number;
  npConsultShowRate: number | null;
  /** Consult Complete + same-day sold / first Tx Complete. */
  sameDayStarts: number;
  /** sameDayStarts ÷ npConsultShow (null if no shows). Target ≥30%. */
  sameDayStartRate: number | null;
  tpClosedCents: number;
  tpClosedCount: number;
  notices: string[];
};

export function emptyConversionSummary(): ConversionSummary {
  return {
    available: false,
    newPatients: 0,
    npConsultTypeIds: [],
    npConsultBooked: 0,
    npConsultShow: 0,
    npConsultNoShow: 0,
    npConsultCancelled: 0,
    npConsultShowRate: null,
    sameDayStarts: 0,
    sameDayStartRate: null,
    tpClosedCents: 0,
    tpClosedCount: 0,
    notices: [],
  };
}

function nexTsToYmd(nexTs: string): string {
  return nexTs.slice(0, 10);
}

function nexTsToIso(nexTs: string): string {
  if (nexTs.endsWith("Z")) return nexTs;
  return nexTs.replace(/\+0000$/, "Z").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

export function inYmdRange(
  date: string | null | undefined,
  fromYmd: string,
  toYmd: string,
): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= fromYmd && d <= toYmd;
}

/** Patient+ymd keys with a consult procedure posted (Mongo `cdt_codes.isConsult`). */
export function buildConsultProcedureDays(
  procedures: NexProcedure[],
  cdt: CdtLookup,
): Set<string> {
  const days = new Set<string>();
  for (const proc of procedures) {
    if (!cdt.isConsultCode(proc.code)) continue;
    const patientId = procedurePatientId(proc);
    const ymd = procedureYmd(proc);
    if (patientId == null || !ymd) continue;
    days.add(patientDayKey(patientId, ymd));
  }
  return days;
}

export type { NpConsultTypeDoc } from "@/lib/nexhealth/kpi-reference";
export { isProcedureComplete } from "@/lib/nexhealth/procedure-status";

function parseOdConfirmCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    if (OD_CONFIRM_CANCEL.has(n) || OD_CONFIRM_NO_SHOW.has(n)) return n;
    return null;
  }
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  if (/^66$/.test(t) || /\b(office|team)\s*cancel/i.test(t)) return 66;
  if (/^67$/.test(t) || /\bpatient\s*cancel/i.test(t)) return 67;
  if (/^69$/.test(t) || /\bno[\s-]?show/i.test(t)) return 69;
  const n = Number.parseInt(t, 10);
  if (n === 66 || n === 67 || n === 69) return n;
  return null;
}

function extractOdConfirmCode(appt: NexAppointment): number | null {
  for (const key of OD_CONFIRM_FIELD_KEYS) {
    const value = appt[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const rec = value as Record<string, unknown>;
      const nested = parseOdConfirmCode(
        rec.id ?? rec.def_num ?? rec.code ?? rec.status ?? rec.name,
      );
      if (nested != null) return nested;
      continue;
    }
    const parsed = parseOdConfirmCode(value);
    if (parsed != null) return parsed;
  }
  return null;
}

/**
 * Consult attendance: OD confirm 66/67 cancel, 69 miss, Complete/Broken,
 * then NexHealth flag fallback (`mapAttendance`).
 */
export function mapConversionAttendance(
  appt: NexAppointment,
): "show" | "no_show" | "cancelled" | "unknown" {
  const od = extractOdConfirmCode(appt);
  if (od != null && OD_CONFIRM_CANCEL.has(od)) return "cancelled";
  if (od != null && OD_CONFIRM_NO_SHOW.has(od)) return "no_show";

  const aptStatus = String(
    appt.apt_status ?? appt.appointment_status ?? appt.status ?? "",
  )
    .trim()
    .toLowerCase();
  if (/\bcomplete(d)?\b/.test(aptStatus)) return "show";
  if (/\bbroken\b/.test(aptStatus)) return "no_show";

  return mapAttendance(appt);
}

/** Consult appointment: configured type, else any appt on a consult-procedure day. */
export function isConsultAppointment(
  appt: NexAppointment,
  consultTypeSet: Set<number>,
  consultProcedureDays: Set<string>,
): boolean {
  const typeId = appointmentTypeId(appt);
  if (consultTypeSet.size > 0) {
    return typeId != null && consultTypeSet.has(typeId);
  }
  if (typeof appt.patient_id === "number" && appt.start_time) {
    return consultProcedureDays.has(
      patientDayKey(appt.patient_id, appt.start_time.slice(0, 10)),
    );
  }
  return false;
}

function sumPlanFees(plan: NexTreatmentPlan): number {
  let cents = 0;
  for (const proc of plan.procedures ?? []) {
    cents += nexPriceToCents(proc.fee);
  }
  return cents;
}

export function isTreatmentPlanClosed(plan: NexTreatmentPlan): boolean {
  const procs = plan.procedures ?? [];
  if (procs.length === 0) return plan.status === "completed";
  return procs.every((p) => isProcedureComplete(p.status));
}

function planClosedYmd(plan: NexTreatmentPlan): string | null {
  const procs = plan.procedures ?? [];
  let max: string | null = null;
  for (const proc of procs) {
    if (!isProcedureComplete(proc.status)) continue;
    const ymd = procedureYmd(proc);
    if (ymd && (!max || ymd > max)) max = ymd;
  }
  if (max) return max;
  if (plan.updated_at) return plan.updated_at.slice(0, 10);
  return null;
}

export function summarizeConversion(params: {
  fromYmd: string;
  toYmd: string;
  appointments: NexAppointment[];
  appointmentTypes: NexAppointmentType[];
  appointmentTypeDocs?: NpConsultTypeDoc[];
  procedures?: NexProcedure[];
  plans?: NexTreatmentPlan[];
  cdt?: CdtLookup;
}): ConversionSummary {
  const notices: string[] = [];
  const procedures = params.procedures ?? [];
  const plans = params.plans ?? [];
  const cdt = params.cdt ?? emptyCdtLookup;
  const consultProcedureDays = buildConsultProcedureDays(procedures, cdt);
  const { ids: npConsultTypeIds, source } = resolveNpConsultTypeIds({
    appointmentTypeDocs: params.appointmentTypeDocs ?? [],
  });
  const consultTypeSet = new Set(npConsultTypeIds);
  const hasConsultProcedures = consultProcedureDays.size > 0;
  const hasConsultFilter = consultTypeSet.size > 0 || hasConsultProcedures;

  if (source === "chart_appointments") {
    notices.push(
      `NP consult filter: ${npConsultTypeIds.length} appointment type(s) from chart + schedule.`,
    );
  } else if (hasConsultProcedures) {
    notices.push("NP consult filter: consult procedure codes from code chart.");
  } else {
    notices.push(
      "NP consult not linked yet — mark consult codes on the Code Chart and re-sync.",
    );
  }

  const consultApptKeysInRange = new Set<string>();
  let npConsultBooked = 0;
  let npConsultShow = 0;
  let npConsultNoShow = 0;
  let npConsultCancelled = 0;

  const consultShowDays = new Set<string>();

  if (hasConsultFilter) {
    for (const appt of params.appointments) {
      if (!inYmdRange(appt.start_time, params.fromYmd, params.toYmd)) continue;
      if (!isConsultAppointment(appt, consultTypeSet, consultProcedureDays)) continue;
      if (typeof appt.patient_id === "number" && appt.start_time) {
        consultApptKeysInRange.add(
          patientDayKey(appt.patient_id, appt.start_time.slice(0, 10)),
        );
      }

      const status = mapConversionAttendance(appt);
      if (status === "cancelled") {
        npConsultCancelled += 1;
        continue;
      }

      npConsultBooked += 1;
      if (status === "show") {
        npConsultShow += 1;
        if (typeof appt.patient_id === "number" && appt.start_time) {
          consultShowDays.add(
            patientDayKey(appt.patient_id, appt.start_time.slice(0, 10)),
          );
        }
      } else if (status === "no_show") {
        npConsultNoShow += 1;
      }
    }

    for (const proc of procedures) {
      if (!cdt.isConsultCode(proc.code) || !isProcedureComplete(proc.status)) {
        continue;
      }
      const patientId = procedurePatientId(proc);
      const ymd = procedureYmd(proc);
      if (patientId == null || !ymd) continue;
      if (!inYmdRange(ymd, params.fromYmd, params.toYmd)) continue;
      const key = patientDayKey(patientId, ymd);
      if (consultApptKeysInRange.has(key) || consultShowDays.has(key)) continue;
      consultShowDays.add(key);
      npConsultBooked += 1;
      npConsultShow += 1;
    }
  }

  const showDenom = npConsultShow + npConsultNoShow;
  if (npConsultBooked > 0 && showDenom === 0) {
    notices.push(
      `${npConsultBooked} NP consult(s) booked but attendance is unknown — confirm show / no-show mapping.`,
    );
  }

  const completeProcsByDay = new Map<string, NexProcedure[]>();
  for (const proc of procedures) {
    if (!isProcedureComplete(proc.status)) continue;
    const patientId = procedurePatientId(proc);
    const ymd = procedureYmd(proc);
    if (patientId == null || !ymd) continue;
    const key = patientDayKey(patientId, ymd);
    const list = completeProcsByDay.get(key);
    if (list) list.push(proc);
    else completeProcsByDay.set(key, [proc]);
  }

  let sameDayStarts = 0;
  for (const key of consultShowDays) {
    const dayProcs = completeProcsByDay.get(key) ?? [];
    const sold = dayProcs.some((p) => cdt.isAoxSoldCode(p.code));
    const firstTx = dayProcs.some(
      (p) => !cdt.isConsultCode(p.code) && !cdt.isAoxSoldCode(p.code),
    );
    if (sold || firstTx) sameDayStarts += 1;
  }
  if (consultShowDays.size > 0) {
    if (sameDayStarts > 0) {
      notices.push(
        `Same-day starts: ${sameDayStarts} consult complete(s) with sold or treatment code same day.`,
      );
    } else {
      notices.push(
        "Same-day starts: no consult complete + same-day sold or treatment code pairs yet.",
      );
    }
  }

  let tpClosedCents = 0;
  let tpClosedCount = 0;
  for (const plan of plans) {
    if (!isTreatmentPlanClosed(plan)) continue;
    const closedYmd = planClosedYmd(plan);
    if (!inYmdRange(closedYmd, params.fromYmd, params.toYmd)) continue;
    const fees = sumPlanFees(plan);
    if (fees <= 0) continue;
    tpClosedCents += fees;
    tpClosedCount += 1;
  }

  const firstTxYmdByPatient = new Map<number, string>();
  for (const proc of procedures) {
    if (!isProcedureComplete(proc.status)) continue;
    if (cdt.isConsultCode(proc.code)) continue;
    const patientId = procedurePatientId(proc);
    const ymd = procedureYmd(proc);
    if (patientId == null || !ymd) continue;
    const prev = firstTxYmdByPatient.get(patientId);
    if (!prev || ymd < prev) firstTxYmdByPatient.set(patientId, ymd);
  }

  let newPatients = 0;
  for (const ymd of firstTxYmdByPatient.values()) {
    if (inYmdRange(ymd, params.fromYmd, params.toYmd)) newPatients += 1;
  }

  const sameDayStartRate =
    npConsultShow > 0 ? safeRate(sameDayStarts, npConsultShow) : null;

  return {
    available: hasConsultFilter || plans.length > 0 || newPatients > 0,
    newPatients,
    npConsultTypeIds,
    npConsultBooked,
    npConsultShow,
    npConsultNoShow,
    npConsultCancelled,
    npConsultShowRate: showDenom > 0 ? safeRate(npConsultShow, showDenom) : null,
    sameDayStarts,
    sameDayStartRate,
    tpClosedCents,
    tpClosedCount,
    notices,
  };
}

/** Same-day NP starts grouped by NexHealth provider id. */
export function perProviderSameDayNp(params: {
  fromYmd: string;
  toYmd: string;
  appointments: NexAppointment[];
  procedures: NexProcedure[];
  appointmentTypeDocs?: NpConsultTypeDoc[];
  cdt?: CdtLookup;
}): Map<number, number> {
  const cdt = params.cdt ?? emptyCdtLookup;
  const consultProcedureDays = buildConsultProcedureDays(params.procedures, cdt);
  const { ids: npConsultTypeIds } = resolveNpConsultTypeIds({
    appointmentTypeDocs: params.appointmentTypeDocs ?? [],
  });
  const consultTypeSet = new Set(npConsultTypeIds);
  const hasConsultFilter =
    consultTypeSet.size > 0 || consultProcedureDays.size > 0;
  if (!hasConsultFilter) return new Map();

  const completeProcsByDay = new Map<string, NexProcedure[]>();
  for (const proc of params.procedures) {
    if (!isProcedureComplete(proc.status)) continue;
    const patientId = procedurePatientId(proc);
    const ymd = procedureYmd(proc);
    if (patientId == null || !ymd) continue;
    const key = patientDayKey(patientId, ymd);
    const list = completeProcsByDay.get(key);
    if (list) list.push(proc);
    else completeProcsByDay.set(key, [proc]);
  }

  const consultShowByProvider = new Map<number, Set<string>>();
  const consultApptKeysInRange = new Set<string>();

  for (const appt of params.appointments) {
    if (!inYmdRange(appt.start_time, params.fromYmd, params.toYmd)) continue;
    if (!isConsultAppointment(appt, consultTypeSet, consultProcedureDays)) continue;
    if (typeof appt.patient_id === "number" && appt.start_time) {
      consultApptKeysInRange.add(
        patientDayKey(appt.patient_id, appt.start_time.slice(0, 10)),
      );
    }
    if (mapConversionAttendance(appt) !== "show") continue;
    const pid = appt.provider_id;
    if (pid == null || typeof appt.patient_id !== "number" || !appt.start_time) {
      continue;
    }
    const key = patientDayKey(appt.patient_id, appt.start_time.slice(0, 10));
    let set = consultShowByProvider.get(pid);
    if (!set) {
      set = new Set();
      consultShowByProvider.set(pid, set);
    }
    set.add(key);
  }

  for (const proc of params.procedures) {
    if (!cdt.isConsultCode(proc.code) || !isProcedureComplete(proc.status)) {
      continue;
    }
    const patientId = procedurePatientId(proc);
    const ymd = procedureYmd(proc);
    if (patientId == null || !ymd || !inYmdRange(ymd, params.fromYmd, params.toYmd)) {
      continue;
    }
    const key = patientDayKey(patientId, ymd);
    if (consultApptKeysInRange.has(key)) continue;
    const pid = proc.provider_id;
    if (pid == null) continue;
    let set = consultShowByProvider.get(pid);
    if (!set) {
      set = new Set();
      consultShowByProvider.set(pid, set);
    }
    set.add(key);
  }

  const counts = new Map<number, number>();
  for (const [pid, keys] of consultShowByProvider) {
    let total = 0;
    for (const key of keys) {
      const dayProcs = completeProcsByDay.get(key) ?? [];
      const sold = dayProcs.some((p) => cdt.isAoxSoldCode(p.code));
      const firstTx = dayProcs.some(
        (p) => !cdt.isConsultCode(p.code) && !cdt.isAoxSoldCode(p.code),
      );
      if (sold || firstTx) total += 1;
    }
    if (total > 0) counts.set(pid, total);
  }
  return counts;
}
