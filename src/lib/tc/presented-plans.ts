/**
 * Treatment plans presented are completed D7777 procedures.
 * Each one is attributed to Ashlie or Brie — the only treatment coordinators —
 * when a same-visit coordinator marker exists; otherwise it stays unattributed.
 */

import { coordinatorSlug } from "@/lib/tc/coordinators";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";
import { inYmdRange } from "@/lib/warehouse/conversion";
import {
  isProcedureComplete,
  procedurePatientId,
  procedureYmd,
} from "@/lib/warehouse/procedure-status";
import {
  moneyToCents,
  type ProcedureRecord,
  type ProviderRecord,
  type TreatmentPlanRecord,
} from "@/lib/warehouse/types";

export const TREATMENT_PLAN_PRESENTED_CODE = "D7777";

export const NAMED_TREATMENT_COORDINATORS = [
  { name: "Ashlie", procedureCode: "N9210" },
  { name: "Brie", procedureCode: "N9410" },
] as const;

export type TreatmentCoordinatorName =
  (typeof NAMED_TREATMENT_COORDINATORS)[number]["name"];

/** A treatment-planned (not completed) N9210 / N9410 row. */
export type PlannedCoordinatorMarker = {
  patientId: number;
  ymd: string;
  code: string;
};

export type PresentedPlan = {
  patientId: number | null;
  ymd: string;
  coordinatorName: TreatmentCoordinatorName | null;
  cents: number;
};

function codeKey(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

export function isTreatmentPlanPresentedCode(
  code: string | null | undefined,
): boolean {
  return codeKey(code) === TREATMENT_PLAN_PRESENTED_CODE;
}

export function coordinatorNameFromProcedureCode(
  code: string | null | undefined,
): TreatmentCoordinatorName | null {
  const key = codeKey(code);
  for (const row of NAMED_TREATMENT_COORDINATORS) {
    if (key === row.procedureCode.toUpperCase()) return row.name;
  }
  return null;
}

export function coordinatorNameFromProviderName(
  name: string | null | undefined,
): TreatmentCoordinatorName | null {
  const tokens = (name ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (tokens.some((token) => token === "ashlie" || token.startsWith("ashlie"))) {
    return "Ashlie";
  }
  if (tokens.some((token) => token === "brie")) return "Brie";
  return null;
}

function appointmentIdOf(proc: ProcedureRecord): number | null {
  const raw = proc.appointment_id;
  return typeof raw === "number" && raw > 0 ? raw : null;
}

/** Ashlie and Brie, with Open Dental provider ids when the roster includes them. */
export function namedTreatmentCoordinators(
  providers: ProviderRecord[] = [],
): TcCoordinator[] {
  return NAMED_TREATMENT_COORDINATORS.map((row) => ({
    slug: coordinatorSlug(row.name),
    name: row.name,
    attributionIds: providers
      .filter((provider) => coordinatorNameFromProviderName(provider.name) === row.name)
      .map((provider) => provider.id),
    planCount: 0,
    appointmentCount: 0,
  }));
}

/**
 * Completed D7777 rows in range.
 * Coordinator comes from a same-visit N9210 (Ashlie) / N9410 (Brie) procedure,
 * the same patient-day marker, a treatment-planned marker that patient-day,
 * or the D7777 provider name.
 */
export function collectPresentedPlans(params: {
  procedures: ProcedureRecord[];
  providers?: ProviderRecord[];
  plannedMarkers?: readonly PlannedCoordinatorMarker[];
  /** D7777 carries no fee; dollars come from the largest plan saved that patient-day. */
  plans?: TreatmentPlanRecord[];
  fromYmd: string;
  toYmd: string;
}): PresentedPlan[] {
  const providerNames = new Map<number, string>();
  for (const provider of params.providers ?? []) {
    if (provider.name) providerNames.set(provider.id, provider.name);
  }

  const planCentsByPatientDay = new Map<string, number>();
  for (const plan of params.plans ?? []) {
    const patientId = typeof plan.patient_id === "number" ? plan.patient_id : null;
    if (patientId == null || !plan.plan_date) continue;
    let cents = 0;
    for (const proc of plan.procedures ?? []) cents += moneyToCents(proc.fee);
    const key = `${patientId}:${plan.plan_date}`;
    if (cents > (planCentsByPatientDay.get(key) ?? 0)) planCentsByPatientDay.set(key, cents);
  }

  const byAppointment = new Map<number, TreatmentCoordinatorName>();
  const byPatientDay = new Map<string, TreatmentCoordinatorName>();

  for (const proc of params.procedures) {
    const coordinator = coordinatorNameFromProcedureCode(proc.code);
    if (!coordinator) continue;
    const appointmentId = appointmentIdOf(proc);
    if (appointmentId != null && !byAppointment.has(appointmentId)) {
      byAppointment.set(appointmentId, coordinator);
    }
    const patientId = procedurePatientId(proc);
    const ymd = procedureYmd(proc);
    if (patientId != null && ymd && !byPatientDay.has(`${patientId}:${ymd}`)) {
      byPatientDay.set(`${patientId}:${ymd}`, coordinator);
    }
  }

  const plannedByPatientDay = new Map<string, TreatmentCoordinatorName>();
  for (const marker of params.plannedMarkers ?? []) {
    const coordinator = coordinatorNameFromProcedureCode(marker.code);
    const key = `${marker.patientId}:${marker.ymd}`;
    if (coordinator && !plannedByPatientDay.has(key)) {
      plannedByPatientDay.set(key, coordinator);
    }
  }

  const presented: PresentedPlan[] = [];
  for (const proc of params.procedures) {
    if (!isTreatmentPlanPresentedCode(proc.code) || !isProcedureComplete(proc.status)) {
      continue;
    }
    const ymd = procedureYmd(proc);
    if (!ymd || !inYmdRange(ymd, params.fromYmd, params.toYmd)) continue;

    const patientId = procedurePatientId(proc);
    const appointmentId = appointmentIdOf(proc);
    const providerName =
      proc.provider_id != null ? providerNames.get(proc.provider_id) : undefined;
    const coordinatorName =
      (appointmentId != null ? byAppointment.get(appointmentId) : undefined) ??
      (patientId != null ? byPatientDay.get(`${patientId}:${ymd}`) : undefined) ??
      (patientId != null ? plannedByPatientDay.get(`${patientId}:${ymd}`) : undefined) ??
      coordinatorNameFromProviderName(providerName) ??
      null;

    const feeCents = moneyToCents(proc.fee);
    presented.push({
      patientId,
      ymd,
      coordinatorName,
      cents:
        feeCents > 0 || patientId == null
          ? feeCents
          : planCentsByPatientDay.get(`${patientId}:${ymd}`) ?? 0,
    });
  }

  return presented;
}
