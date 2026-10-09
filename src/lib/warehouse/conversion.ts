/**
 * PHI-safe new-patient conversion aggregates (counts + dollars only).
 * Consult = Mongo `cdt_codes.isConsult` or configured appointment types;
 * show rate Complete ÷ (Complete + Broken); 66/67 drop; 69 miss;
 * same-day = more than $250 collected that day; TP closed = all procs Complete.
 */

import {
  emptyCdtLookup,
  type CdtLookup,
} from "@/lib/cdt/categories";
import {
  resolveNpConsultTypeIds,
  type NpConsultTypeDoc,
} from "@/lib/warehouse/kpi-reference";
import {
  isProcedureComplete,
  patientDayKey,
  procedurePatientId,
  procedureYmd,
} from "@/lib/warehouse/procedure-status";
import { safeRate } from "@/lib/metrics";
import {
  appointmentTypeId,
  moneyToCents,
  type AppointmentRecord,
  type AppointmentTypeRecord,
  type PaymentRecord,
  type ProcedureRecord,
  type TreatmentPlanRecord,
} from "@/lib/warehouse/types";

/** Same-day start requires patient payments that day strictly above this amount. */
export const SAME_DAY_START_MIN_CENTS = 25_000;

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
  /** IsNewPatient visits in range when the flag is loaded; otherwise consult bookings. */
  newPatientBooked: number;
  /** IsNewPatient shows when the flag is loaded; otherwise consult shows. */
  newPatientShows: number;
  /** Consult show with more than $250 collected that calendar day. */
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
    newPatientBooked: 0,
    newPatientShows: 0,
    sameDayStarts: 0,
    sameDayStartRate: null,
    tpClosedCents: 0,
    tpClosedCount: 0,
    notices: [],
  };
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
  procedures: ProcedureRecord[],
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

export type { NpConsultTypeDoc } from "@/lib/warehouse/kpi-reference";
export { isProcedureComplete } from "@/lib/warehouse/procedure-status";

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

function extractOdConfirmCode(appt: AppointmentRecord): number | null {
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
 * Consult and new-patient attendance from Open Dental AptStatus.
 * Complete is a show and Broken is a no-show.
 * Confirm defs 66/67 (cancel) and 69 (no-show) apply only while status is still open.
 * A confirmed or checked-in visit that is not Complete is not a show.
 */
export function mapConversionAttendance(
  appt: AppointmentRecord,
): "show" | "no_show" | "cancelled" | "unknown" {
  const aptStatus = String(
    appt.apt_status ?? appt.appointment_status ?? appt.status ?? "",
  )
    .trim()
    .toLowerCase();
  if (/\bcomplete(d)?\b/.test(aptStatus)) return "show";
  if (/\bbroken\b/.test(aptStatus)) return "no_show";

  const od = extractOdConfirmCode(appt);
  if (od != null && OD_CONFIRM_CANCEL.has(od)) return "cancelled";
  if (od != null && OD_CONFIRM_NO_SHOW.has(od)) return "no_show";

  return "unknown";
}

/** Live Open Dental rows set this boolean. Test fixtures omit it and keep consult-type rules. */
export function appointmentHasNewPatientFlag(
  appointments: AppointmentRecord[],
): boolean {
  return appointments.some((appt) => typeof appt.is_new_patient === "boolean");
}

/** Consult appointment: configured type, else any appt on a consult-procedure day. */
export function isConsultAppointment(
  appt: AppointmentRecord,
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

function sumPlanFees(plan: TreatmentPlanRecord): number {
  let cents = 0;
  for (const proc of plan.procedures ?? []) {
    cents += moneyToCents(proc.fee);
  }
  return cents;
}

export function isTreatmentPlanClosed(plan: TreatmentPlanRecord): boolean {
  const procs = plan.procedures ?? [];
  if (procs.length === 0) return plan.status === "completed";
  return procs.every((p) => isProcedureComplete(p.status));
}

function planClosedYmd(plan: TreatmentPlanRecord): string | null {
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
  appointments: AppointmentRecord[];
  appointmentTypes: AppointmentTypeRecord[];
  appointmentTypeDocs?: NpConsultTypeDoc[];
  procedures?: ProcedureRecord[];
  plans?: TreatmentPlanRecord[];
  payments?: PaymentRecord[];
  cdt?: CdtLookup;
  /** patient.DateFirstVisit values. When present, NP count uses this column. */
  firstVisits?: Array<string | null | undefined>;
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

    if (consultTypeSet.size === 0) {
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
  }

  const showDenom = npConsultShow + npConsultNoShow;
  if (npConsultBooked > 0 && showDenom === 0) {
    notices.push(
      `${npConsultBooked} NP consult(s) booked but attendance is unknown — confirm show / no-show mapping.`,
    );
  }

  const npFlag = appointmentHasNewPatientFlag(params.appointments);
  const npShowDays = new Set<string>();
  let newPatientBooked = 0;
  let newPatientShows = 0;
  if (npFlag) {
    for (const appt of params.appointments) {
      if (!inYmdRange(appt.start_time, params.fromYmd, params.toYmd)) continue;
      if (appt.is_new_patient !== true) continue;
      const attendance = mapConversionAttendance(appt);
      if (attendance === "cancelled") continue;
      newPatientBooked += 1;
      if (attendance !== "show") continue;
      newPatientShows += 1;
      if (typeof appt.patient_id === "number" && appt.start_time) {
        npShowDays.add(
          patientDayKey(appt.patient_id, appt.start_time.slice(0, 10)),
        );
      }
    }
  }

  const paymentCentsByDay = paymentsByPatientDay(params.payments ?? []);
  let sameDayStarts = 0;
  for (const key of npFlag ? npShowDays : consultShowDays) {
    if (isSameDayStartPayment(paymentCentsByDay.get(key) ?? 0)) {
      sameDayStarts += 1;
    }
  }
  if ((npFlag ? npShowDays : consultShowDays).size > 0) {
    if (sameDayStarts > 0) {
      notices.push(
        `Same-day starts: ${sameDayStarts} show(s) with more than $250 collected the same day.`,
      );
    } else {
      notices.push(
        "Same-day starts: no show with more than $250 collected the same day yet.",
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
  if (params.firstVisits) {
    for (const ymd of params.firstVisits) {
      if (inYmdRange(ymd, params.fromYmd, params.toYmd)) newPatients += 1;
    }
  } else {
    for (const ymd of firstTxYmdByPatient.values()) {
      if (inYmdRange(ymd, params.fromYmd, params.toYmd)) newPatients += 1;
    }
  }

  const sameDayDenom = npFlag ? newPatientShows : npConsultShow;
  const sameDayStartRate =
    sameDayDenom > 0 ? safeRate(sameDayStarts, sameDayDenom) : null;

  return {
    available: hasConsultFilter || plans.length > 0 || newPatients > 0,
    newPatients,
    npConsultTypeIds,
    npConsultBooked,
    npConsultShow,
    npConsultNoShow,
    npConsultCancelled,
    npConsultShowRate: showDenom > 0 ? safeRate(npConsultShow, showDenom) : null,
    newPatientBooked: npFlag ? newPatientBooked : npConsultBooked,
    newPatientShows: npFlag ? newPatientShows : npConsultShow,
    sameDayStarts,
    sameDayStartRate,
    tpClosedCents,
    tpClosedCount,
    notices,
  };
}

const SOONERCARE_APPT_PATTERN =
  /\b(sooner\s*care|soonercare|medicaid|sooner)\b/i;

export type ProviderNpConsultParams = {
  fromYmd: string;
  toYmd: string;
  appointments: AppointmentRecord[];
  procedures: ProcedureRecord[];
  appointmentTypes?: AppointmentTypeRecord[];
  appointmentTypeDocs?: NpConsultTypeDoc[];
  cdt?: CdtLookup;
  /** Primary SoonerCare / OHCA patients. Used when appointments carry IsNewPatient. */
  soonercarePatientIds?: ReadonlySet<number>;
  payments?: PaymentRecord[];
};

function appointmentSoonercareHaystack(
  appt: AppointmentRecord,
  typeCatalog: Map<number, AppointmentTypeRecord>,
): string {
  const typeId = appointmentTypeId(appt);
  const typeName =
    typeId != null ? (typeCatalog.get(typeId)?.name ?? "") : "";
  const parts = [typeName];
  for (const [, value] of Object.entries(appt)) {
    if (typeof value === "string") parts.push(value);
  }
  return parts.join(" ").toLowerCase();
}

function isSoonercareConsultAppointment(
  appt: AppointmentRecord,
  typeCatalog: Map<number, AppointmentTypeRecord>,
): boolean {
  return SOONERCARE_APPT_PATTERN.test(
    appointmentSoonercareHaystack(appt, typeCatalog),
  );
}

function resolveProviderConsultContext(params: ProviderNpConsultParams): {
  cdt: CdtLookup;
  consultTypeSet: Set<number>;
  consultProcedureDays: Set<string>;
  typeCatalog: Map<number, AppointmentTypeRecord>;
  hasConsultFilter: boolean;
} {
  const cdt = params.cdt ?? emptyCdtLookup;
  const consultProcedureDays = buildConsultProcedureDays(params.procedures, cdt);
  const { ids: npConsultTypeIds } = resolveNpConsultTypeIds({
    appointmentTypeDocs: params.appointmentTypeDocs ?? [],
  });
  const consultTypeSet = new Set(npConsultTypeIds);
  const typeCatalog = new Map<number, AppointmentTypeRecord>();
  for (const t of params.appointmentTypes ?? []) {
    typeCatalog.set(t.id, t);
  }
  const hasConsultFilter =
    consultTypeSet.size > 0 || consultProcedureDays.size > 0;
  return {
    cdt,
    consultTypeSet,
    consultProcedureDays,
    typeCatalog,
    hasConsultFilter,
  };
}

function buildCompleteProcsByDay(
  procedures: ProcedureRecord[],
): Map<string, ProcedureRecord[]> {
  const completeProcsByDay = new Map<string, ProcedureRecord[]>();
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
  return completeProcsByDay;
}

export function paymentsByPatientDay(
  payments: readonly PaymentRecord[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const payment of payments) {
    if (payment.deleted_at) continue;
    if (typeof payment.patient_id !== "number" || !payment.paid_at) continue;
    const cents = moneyToCents(payment.payment_amount);
    if (cents <= 0) continue;
    const key = patientDayKey(payment.patient_id, payment.paid_at.slice(0, 10));
    totals.set(key, (totals.get(key) ?? 0) + cents);
  }
  return totals;
}

export function isSameDayStartPayment(cents: number): boolean {
  return cents > SAME_DAY_START_MIN_CENTS;
}

function dayHasNpClose(dayProcs: ProcedureRecord[], cdt: CdtLookup): boolean {
  const sold = dayProcs.some((p) => cdt.isAoxSoldCode(p.code));
  const firstTx = dayProcs.some(
    (p) => !cdt.isConsultCode(p.code) && !cdt.isAoxSoldCode(p.code),
  );
  return sold || firstTx;
}

function buildConsultShowByProvider(
  params: ProviderNpConsultParams,
  ctx: ReturnType<typeof resolveProviderConsultContext>,
): Map<number, Set<string>> {
  const { cdt, consultTypeSet, consultProcedureDays } = ctx;
  const consultShowByProvider = new Map<number, Set<string>>();
  const consultApptKeysInRange = new Set<string>();

  for (const appt of params.appointments) {
    if (!inYmdRange(appt.start_time, params.fromYmd, params.toYmd)) continue;
    if (!isConsultAppointment(appt, consultTypeSet, consultProcedureDays)) {
      continue;
    }
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

  if (consultTypeSet.size === 0) {
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
  }

  return consultShowByProvider;
}

function parsePatientDayKey(key: string): { patientId: number; ymd: string } | null {
  const sep = key.indexOf(":");
  if (sep <= 0) return null;
  const patientId = Number(key.slice(0, sep));
  const ymd = key.slice(sep + 1);
  if (!Number.isFinite(patientId) || !ymd) return null;
  return { patientId, ymd };
}

function hasDeferredNpClose(
  patientId: number,
  consultYmd: string,
  fromYmd: string,
  toYmd: string,
  completeProcsByDay: Map<string, ProcedureRecord[]>,
  cdt: CdtLookup,
): boolean {
  for (const [key, dayProcs] of completeProcsByDay) {
    const parsed = parsePatientDayKey(key);
    if (!parsed || parsed.patientId !== patientId) continue;
    if (parsed.ymd <= consultYmd) continue;
    if (!inYmdRange(parsed.ymd, fromYmd, toYmd)) continue;
    if (dayHasNpClose(dayProcs, cdt)) return true;
  }
  return false;
}

/** SoonerCare new-patient shows attributed to the appointment provider. */
export function perProviderScNpSeen(
  params: ProviderNpConsultParams,
): Map<number, number> {
  const ctx = resolveProviderConsultContext(params);
  const counts = new Map<number, number>();
  if (appointmentHasNewPatientFlag(params.appointments)) {
    for (const appt of params.appointments) {
      if (!inYmdRange(appt.start_time, params.fromYmd, params.toYmd)) continue;
      if (appt.is_new_patient !== true) continue;
      if (mapConversionAttendance(appt) !== "show") continue;
      const patientId = appt.patient_id;
      const onSoonerCare =
        params.soonercarePatientIds != null
          ? typeof patientId === "number" &&
            params.soonercarePatientIds.has(patientId)
          : isSoonercareConsultAppointment(appt, ctx.typeCatalog);
      if (!onSoonerCare) continue;
      const pid = appt.provider_id;
      if (pid == null) continue;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
    return counts;
  }
  if (!ctx.hasConsultFilter) return counts;

  for (const appt of params.appointments) {
    if (!inYmdRange(appt.start_time, params.fromYmd, params.toYmd)) continue;
    if (
      !isConsultAppointment(
        appt,
        ctx.consultTypeSet,
        ctx.consultProcedureDays,
      )
    ) {
      continue;
    }
    if (mapConversionAttendance(appt) !== "show") continue;
    if (!isSoonercareConsultAppointment(appt, ctx.typeCatalog)) continue;
    const pid = appt.provider_id;
    if (pid == null) continue;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  return counts;
}

function buildNewPatientShowByProvider(
  params: ProviderNpConsultParams,
): Map<number, Set<string>> {
  const shows = new Map<number, Set<string>>();
  for (const appt of params.appointments) {
    if (!inYmdRange(appt.start_time, params.fromYmd, params.toYmd)) continue;
    if (appt.is_new_patient !== true) continue;
    if (mapConversionAttendance(appt) !== "show") continue;
    const pid = appt.provider_id;
    if (pid == null || typeof appt.patient_id !== "number" || !appt.start_time) {
      continue;
    }
    const key = patientDayKey(appt.patient_id, appt.start_time.slice(0, 10));
    let set = shows.get(pid);
    if (!set) {
      set = new Set();
      shows.set(pid, set);
    }
    set.add(key);
  }
  return shows;
}

/** Same-day NP starts grouped by source provider id. */
export function perProviderSameDayNp(
  params: ProviderNpConsultParams,
): Map<number, number> {
  const ctx = resolveProviderConsultContext(params);
  const paymentCentsByDay = paymentsByPatientDay(params.payments ?? []);
  const showKeys = appointmentHasNewPatientFlag(params.appointments)
    ? buildNewPatientShowByProvider(params)
    : ctx.hasConsultFilter
      ? buildConsultShowByProvider(params, ctx)
      : new Map<number, Set<string>>();

  const counts = new Map<number, number>();
  for (const [pid, keys] of showKeys) {
    let total = 0;
    for (const key of keys) {
      if (isSameDayStartPayment(paymentCentsByDay.get(key) ?? 0)) total += 1;
    }
    if (total > 0) counts.set(pid, total);
  }
  return counts;
}

/** NP consult shows that closed on a later day (sold or first tx), by consult provider. */
export function perProviderDeferredNpClose(
  params: ProviderNpConsultParams,
): Map<number, number> {
  const ctx = resolveProviderConsultContext(params);
  if (!ctx.hasConsultFilter) return new Map();

  const completeProcsByDay = buildCompleteProcsByDay(params.procedures);
  const consultShowByProvider = buildConsultShowByProvider(params, ctx);

  const counts = new Map<number, number>();
  for (const [pid, keys] of consultShowByProvider) {
    let total = 0;
    for (const key of keys) {
      const parsed = parsePatientDayKey(key);
      if (!parsed) continue;
      const dayProcs = completeProcsByDay.get(key) ?? [];
      if (dayHasNpClose(dayProcs, ctx.cdt)) continue;
      if (
        hasDeferredNpClose(
          parsed.patientId,
          parsed.ymd,
          params.fromYmd,
          params.toYmd,
          completeProcsByDay,
          ctx.cdt,
        )
      ) {
        total += 1;
      }
    }
    if (total > 0) counts.set(pid, total);
  }
  return counts;
}
