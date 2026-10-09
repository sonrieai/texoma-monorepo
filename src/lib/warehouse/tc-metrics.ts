/**
 * Treatment Coordinator aggregates — treatment plans, follow-up, rebooks.
 * PHI-safe counts and dollars only.
 */

import {
  emptyCdtLookup,
  type CdtLookup,
  type ProcedureVolumeBucket,
} from "@/lib/cdt/categories";
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
import type { ConversionSummary } from "@/lib/warehouse/conversion";
import {
  appointmentHasNewPatientFlag,
  buildConsultProcedureDays,
  inYmdRange,
  isConsultAppointment,
  isTreatmentPlanClosed,
  mapConversionAttendance,
} from "@/lib/warehouse/conversion";
import {
  isProcedureComplete,
  procedurePatientId,
  procedureYmd,
} from "@/lib/warehouse/procedure-status";
import {
  resolveNpConsultTypeIds,
  type NpConsultTypeDoc,
} from "@/lib/warehouse/kpi-reference";
import {
  aggregateFinancingVendorMix,
  financingVendorDonutSlices,
  type FinancingVendorMix,
} from "@/lib/warehouse/payment-mix";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";
import {
  coordinatorPatientIds,
  filterPlansForCoordinator,
  planPatientId,
} from "@/lib/tc/plan-attribution";
import {
  declineReasonFromPlanFields,
  isDeclinedTreatmentPlanStatus,
  type DeclineReasonRow,
} from "@/lib/tc/decline-reasons";

const SOONERCARE_PATTERN =
  /\b(sooner\s*care|soonercare|medicaid|sooner)\b/i;

export type TcDeclineReason = DeclineReasonRow;

export type TcFollowRecapture = {
  day1: number;
  day7: number;
  day30: number;
};

export type TcMetrics = {
  available: boolean;
  tpPresentedCount: number;
  tpPresentedCents: number;
  tpAcceptedCount: number;
  tpAcceptedCents: number;
  scheduledCount: number;
  implantAcceptPct: number | null;
  dentureAcceptPct: number | null;
  followRecapture: TcFollowRecapture;
  declineReasons: TcDeclineReason[];
  declineTotal: number;
  scNpSeen: number;
  cancelRebookRate: number | null;
  noShowRebookRate: number | null;
  npSuccessRate: number | null;
  financingVendorMix: FinancingVendorMix;
  financingDonutSlices: { label: string; value: number }[];
  /** Patient-linked funnel: presented ⊇ showed ⊇ closed (unique patients). */
  conversionFunnel: TcFunnelStage[];
  notices: string[];
};

export type TcFunnelStage = { label: string; value: number };

/**
 * Nested patient funnel for TC conversion chart.
 * Stage 2 = presented patients who consult-showed; stage 3 = those who fully closed.
 */
export function buildPatientConversionFunnel(params: {
  presentedPatients: Set<number>;
  consultShowPatients: Set<number>;
  closedPatients: Set<number>;
}): TcFunnelStage[] {
  const { presentedPatients, consultShowPatients, closedPatients } = params;

  if (presentedPatients.size > 0) {
    let showed = 0;
    let closed = 0;
    for (const pid of presentedPatients) {
      if (consultShowPatients.has(pid)) showed += 1;
      if (consultShowPatients.has(pid) && closedPatients.has(pid)) {
        closed += 1;
      }
    }
    return [
      { label: "Plans presented", value: presentedPatients.size },
      { label: "Showed", value: showed },
      { label: "Closed", value: closed },
    ];
  }

  if (consultShowPatients.size > 0) {
    let closed = 0;
    for (const pid of consultShowPatients) {
      if (closedPatients.has(pid)) closed += 1;
    }
    return [
      { label: "Plans presented", value: consultShowPatients.size },
      { label: "Showed", value: consultShowPatients.size },
      { label: "Closed", value: closed },
    ];
  }

  return [
    { label: "Plans presented", value: 0 },
    { label: "Showed", value: 0 },
    { label: "Closed", value: 0 },
  ];
}

export function emptyTcMetrics(): TcMetrics {
  const financingVendorMix = aggregateFinancingVendorMix([]);
  return {
    available: false,
    tpPresentedCount: 0,
    tpPresentedCents: 0,
    tpAcceptedCount: 0,
    tpAcceptedCents: 0,
    scheduledCount: 0,
    implantAcceptPct: null,
    dentureAcceptPct: null,
    followRecapture: { day1: 0, day7: 0, day30: 0 },
    declineReasons: [],
    declineTotal: 0,
    scNpSeen: 0,
    cancelRebookRate: null,
    noShowRebookRate: null,
    npSuccessRate: null,
    financingVendorMix,
    financingDonutSlices: [],
    conversionFunnel: buildPatientConversionFunnel({
      presentedPatients: new Set(),
      consultShowPatients: new Set(),
      closedPatients: new Set(),
    }),
    notices: [],
  };
}

function sumPlanFees(plan: TreatmentPlanRecord): number {
  let cents = 0;
  for (const proc of plan.procedures ?? []) {
    cents += moneyToCents(proc.fee);
  }
  return cents;
}

function planClosedYmd(plan: TreatmentPlanRecord): string | null {
  const procs = plan.procedures ?? [];
  let max: string | null = null;
  for (const proc of procs) {
    if (!isProcedureComplete(proc.status)) continue;
    const raw = proc.start_date || proc.end_date || proc.updated_at;
    const ymd = raw ? raw.slice(0, 10) : null;
    if (ymd && (!max || ymd > max)) max = ymd;
  }
  if (max) return max;
  if (plan.updated_at) return plan.updated_at.slice(0, 10);
  return null;
}

function planActivityYmd(plan: TreatmentPlanRecord): string | null {
  return plan.updated_at?.slice(0, 10) ?? planClosedYmd(plan);
}

function isPresentablePlan(plan: TreatmentPlanRecord): boolean {
  if (plan.status === "not_applicable") return false;
  const procs = plan.procedures ?? [];
  if (procs.length === 0 && plan.status !== "proposed") return false;
  return sumPlanFees(plan) > 0;
}

type PlanCaseType = "implant" | "denture" | "other";

function planCaseType(plan: TreatmentPlanRecord, cdt: CdtLookup): PlanCaseType {
  let implantCents = 0;
  let dentureCents = 0;
  for (const proc of plan.procedures ?? []) {
    const cents = moneyToCents(proc.fee);
    const bucket: ProcedureVolumeBucket | null = cdt.volumeBucket(proc.code);
    if (bucket === "implants" || bucket === "aox") implantCents += cents;
    else if (bucket === "dentures" || bucket === "partials") {
      dentureCents += cents;
    }
  }
  if (implantCents > dentureCents && implantCents > 0) return "implant";
  if (dentureCents > implantCents && dentureCents > 0) return "denture";
  return "other";
}

function declineReasonFromPlan(plan: TreatmentPlanRecord): string {
  return declineReasonFromPlanFields(plan as Record<string, unknown>);
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = new Date(`${fromYmd}T12:00:00Z`).getTime();
  const to = new Date(`${toYmd}T12:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
}

function apptSoonercareHaystack(
  appt: AppointmentRecord,
  typeCatalog: Map<number, AppointmentTypeRecord>,
): string {
  const typeId = appointmentTypeId(appt);
  const typeName =
    typeId != null ? (typeCatalog.get(typeId)?.name ?? "") : "";
  const parts = [typeName];
  for (const [key, value] of Object.entries(appt)) {
    if (typeof value === "string") parts.push(value);
  }
  return parts.join(" ").toLowerCase();
}

function hasLaterBooking(
  appointments: AppointmentRecord[],
  patientId: number,
  afterYmd: string,
): boolean {
  for (const appt of appointments) {
    if (appt.patient_id !== patientId || !appt.start_time) continue;
    const ymd = appt.start_time.slice(0, 10);
    if (ymd <= afterYmd) continue;
    const status = mapConversionAttendance(appt);
    if (status === "cancelled") continue;
    return true;
  }
  return false;
}

function acceptRate(presented: number, accepted: number): number | null {
  if (presented <= 0) return null;
  return accepted / presented;
}

export function summarizeTcMetrics(params: {
  fromYmd: string;
  toYmd: string;
  appointments: AppointmentRecord[];
  appointmentTypes: AppointmentTypeRecord[];
  appointmentTypeDocs?: NpConsultTypeDoc[];
  plans: TreatmentPlanRecord[];
  procedures: ProcedureRecord[];
  payments: PaymentRecord[];
  conversion: ConversionSummary;
  cdt?: CdtLookup;
  coordinator?: TcCoordinator;
  soonercarePatientIds?: ReadonlySet<number>;
}): TcMetrics {
  const notices: string[] = [];
  const coordinator = params.coordinator;
  const plans = coordinator
    ? filterPlansForCoordinator(params.plans, coordinator)
    : params.plans;
  const patientIds = coordinator
    ? coordinatorPatientIds(params.plans, coordinator)
    : null;
  const appointments =
    coordinator && patientIds
      ? params.appointments.filter(
          (a) =>
            typeof a.patient_id === "number" && patientIds.has(a.patient_id),
        )
      : params.appointments;
  const payments =
    coordinator && patientIds
      ? params.payments.filter((p) => {
          const raw = p as Record<string, unknown>;
          const pid = raw.patient_id;
          return typeof pid === "number" && patientIds.has(pid);
        })
      : params.payments;

  if (coordinator && plans.length === 0) {
    notices.push(
      `${coordinator.name}: no attributed treatment plans in this period — confirm OD sends presenter / coordinator on treatment plans in warehouse data.`,
    );
  }

  const cdt = params.cdt ?? emptyCdtLookup;
  const consultProcedureDays = buildConsultProcedureDays(params.procedures, cdt);
  const { ids: npConsultTypeIds } = resolveNpConsultTypeIds({
    appointmentTypeDocs: params.appointmentTypeDocs ?? [],
  });
  const consultTypeSet = new Set(npConsultTypeIds);
  const typeCatalog = new Map<number, AppointmentTypeRecord>();
  for (const t of params.appointmentTypes) typeCatalog.set(t.id, t);

  let tpPresentedCount = 0;
  let tpPresentedCents = 0;
  let tpAcceptedCount = 0;
  let tpAcceptedCents = 0;
  let scheduledCount = 0;

  let implantPresented = 0;
  let implantAccepted = 0;
  let denturePresented = 0;
  let dentureAccepted = 0;

  const followRecapture: TcFollowRecapture = { day1: 0, day7: 0, day30: 0 };
  const declineMap = new Map<string, number>();

  const consultShowYmdByPatient = new Map<number, string>();
  const consultShowPatients = new Set<number>();
  const presentedPatients = new Set<number>();
  const closedPatients = new Set<number>();
  let scNpSeen = 0;

  for (const appt of appointments) {
    if (!inYmdRange(appt.start_time, params.fromYmd, params.toYmd)) continue;
    if (
      isConsultAppointment(appt, consultTypeSet, consultProcedureDays) &&
      mapConversionAttendance(appt) === "show" &&
      typeof appt.patient_id === "number" &&
      appt.start_time
    ) {
      const ymd = appt.start_time.slice(0, 10);
      const prev = consultShowYmdByPatient.get(appt.patient_id);
      if (!prev || ymd < prev) {
        consultShowYmdByPatient.set(appt.patient_id, ymd);
      }
      consultShowPatients.add(appt.patient_id);
      if (
        !appointmentHasNewPatientFlag(appointments) &&
        SOONERCARE_PATTERN.test(apptSoonercareHaystack(appt, typeCatalog))
      ) {
        scNpSeen += 1;
      }
    }
    if (
      appointmentHasNewPatientFlag(appointments) &&
      appt.is_new_patient === true &&
      mapConversionAttendance(appt) === "show" &&
      typeof appt.patient_id === "number" &&
      params.soonercarePatientIds?.has(appt.patient_id)
    ) {
      scNpSeen += 1;
    }
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
      consultShowPatients.add(patientId);
      const prev = consultShowYmdByPatient.get(patientId);
      if (!prev || ymd < prev) {
        consultShowYmdByPatient.set(patientId, ymd);
      }
    }
  }

  for (const plan of plans) {
    if (!isPresentablePlan(plan)) continue;
    const activityYmd = planActivityYmd(plan);
    const closed = isTreatmentPlanClosed(plan);
    const closedYmd = closed ? planClosedYmd(plan) : null;
    const presentedInRange = inYmdRange(activityYmd, params.fromYmd, params.toYmd);
    const closedInRange =
      closed && closedYmd != null && inYmdRange(closedYmd, params.fromYmd, params.toYmd);

    if (presentedInRange) {
      tpPresentedCount += 1;
      tpPresentedCents += sumPlanFees(plan);
      const patientId = planPatientId(plan);
      if (patientId != null) presentedPatients.add(patientId);
      const caseType = planCaseType(plan, cdt);
      if (caseType === "implant") implantPresented += 1;
      else if (caseType === "denture") denturePresented += 1;
    }

    if (closedInRange) {
      tpAcceptedCount += 1;
      tpAcceptedCents += sumPlanFees(plan);
      const caseType = planCaseType(plan, cdt);
      if (caseType === "implant") implantAccepted += 1;
      else if (caseType === "denture") dentureAccepted += 1;

      const patientId = planPatientId(plan);
      const closeYmd = closedYmd!;
      if (patientId != null) {
        closedPatients.add(patientId);
        const consultYmd = consultShowYmdByPatient.get(patientId);
        if (consultYmd) {
          const days = daysBetweenYmd(consultYmd, closeYmd);
          if (days >= 0 && days <= 1) followRecapture.day1 += 1;
          else if (days >= 2 && days <= 7) followRecapture.day7 += 1;
          else if (days >= 8 && days <= 30) followRecapture.day30 += 1;
        }
      }
    } else if (
      plan.status === "accepted" &&
      presentedInRange &&
      !closed
    ) {
      scheduledCount += 1;
    }

    if (
      isDeclinedTreatmentPlanStatus(plan.status) &&
      inYmdRange(activityYmd, params.fromYmd, params.toYmd)
    ) {
      const reason = declineReasonFromPlan(plan);
      declineMap.set(reason, (declineMap.get(reason) ?? 0) + 1);
    }
  }

  if (!coordinator && tpPresentedCount === 0 && params.conversion.npConsultShow > 0) {
    tpPresentedCount = params.conversion.npConsultShow;
    notices.push(
      "TX plans presented uses NP consult shows until treatment-plan presentation dates sync.",
    );
  }

  const conversionFunnel = buildPatientConversionFunnel({
    presentedPatients,
    consultShowPatients,
    closedPatients,
  });

  if (
    presentedPatients.size === 0 &&
    consultShowPatients.size > 0 &&
    tpPresentedCount > 0
  ) {
    notices.push(
      "Conversion funnel uses consult shows as presented until treatment-plan patient ids sync.",
    );
  }

  if (!coordinator && scheduledCount === 0 && tpAcceptedCount > params.conversion.sameDayStarts) {
    scheduledCount = Math.max(
      params.conversion.sameDayStarts,
      tpAcceptedCount - params.conversion.sameDayStarts,
    );
  }

  if (!coordinator && tpAcceptedCount === 0 && params.conversion.tpClosedCount > 0) {
    tpAcceptedCount = params.conversion.tpClosedCount;
    tpAcceptedCents = params.conversion.tpClosedCents;
  }

  if (!coordinator && tpPresentedCents === 0 && tpAcceptedCents > 0) {
    tpPresentedCents = tpAcceptedCents;
  }

  let cancelledInRange = 0;
  let cancelledRebooked = 0;
  let noShowInRange = 0;
  let noShowRebooked = 0;

  for (const appt of appointments) {
    if (!inYmdRange(appt.start_time, params.fromYmd, params.toYmd)) continue;
    const status = mapConversionAttendance(appt);
    const ymd = appt.start_time?.slice(0, 10);
    const pid = appt.patient_id;
    if (!ymd || typeof pid !== "number") continue;

    if (status === "cancelled") {
      cancelledInRange += 1;
      if (hasLaterBooking(appointments, pid, ymd)) {
        cancelledRebooked += 1;
      }
    } else if (status === "no_show") {
      noShowInRange += 1;
      if (hasLaterBooking(appointments, pid, ymd)) {
        noShowRebooked += 1;
      }
    }
  }

  const declineReasons = [...declineMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const declineTotal = declineReasons.reduce((sum, row) => sum + row.count, 0);
  if (declineTotal === 0) {
    notices.push(
      "Decline reasons use rejected treatment plans (Open Dental) and lost GHL pipeline stages when CRM is connected.",
    );
  }

  const paymentsInRange = payments.filter((p) => {
    const ymd = p.paid_at?.slice(0, 10) ?? p.updated_at?.slice(0, 10) ?? null;
    return inYmdRange(ymd, params.fromYmd, params.toYmd);
  });
  const financingVendorMix = aggregateFinancingVendorMix(paymentsInRange);
  const financingDonutSlices = financingVendorDonutSlices(financingVendorMix);

  const npSuccessRate =
    params.conversion.npConsultShow > 0 && !coordinator
      ? safeRate(tpAcceptedCount, params.conversion.npConsultShow)
      : coordinator && patientIds && patientIds.size > 0
        ? safeRate(tpAcceptedCount, appointments.filter((a) => {
            if (!inYmdRange(a.start_time, params.fromYmd, params.toYmd)) {
              return false;
            }
            return (
              isConsultAppointment(a, consultTypeSet, consultProcedureDays) &&
              mapConversionAttendance(a) === "show"
            );
          }).length)
        : null;

  return {
    available:
      tpPresentedCount > 0 ||
      tpAcceptedCount > 0 ||
      params.conversion.available,
    tpPresentedCount,
    tpPresentedCents,
    tpAcceptedCount,
    tpAcceptedCents,
    scheduledCount,
    implantAcceptPct: acceptRate(implantPresented, implantAccepted),
    dentureAcceptPct: acceptRate(denturePresented, dentureAccepted),
    followRecapture,
    declineReasons,
    declineTotal,
    scNpSeen,
    cancelRebookRate: safeRate(cancelledRebooked, cancelledInRange),
    noShowRebookRate: safeRate(noShowRebooked, noShowInRange),
    npSuccessRate,
    financingVendorMix,
    financingDonutSlices,
    conversionFunnel,
    notices,
  };
}
