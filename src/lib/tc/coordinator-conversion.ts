import type { CdtLookup } from "@/lib/cdt/categories";
import {
  summarizeConversion,
  type ConversionSummary,
} from "@/lib/warehouse/conversion";
import type { NpConsultTypeDoc } from "@/lib/warehouse/kpi-reference";
import type {
  AppointmentRecord,
  AppointmentTypeRecord,
  PaymentRecord,
  ProcedureRecord,
  TreatmentPlanRecord,
} from "@/lib/warehouse/types";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";
import {
  coordinatorPatientIds,
  planPatientId,
} from "@/lib/tc/plan-attribution";
import {
  collectPresentedPlans,
  type PresentedPlan,
} from "@/lib/tc/presented-plans";

/** Patients this coordinator owns: attributed plans plus her presented D7777 visits. */
export function coordinatorScopePatientIds(params: {
  coordinator: TcCoordinator;
  plans: TreatmentPlanRecord[];
  presented: PresentedPlan[];
}): Set<number> {
  const ids = coordinatorPatientIds(params.plans, params.coordinator);
  const name = params.coordinator.name.trim().toLowerCase();
  for (const event of params.presented) {
    if (event.patientId != null && event.coordinatorName?.toLowerCase() === name) {
      ids.add(event.patientId);
    }
  }
  return ids;
}

function hasPatient(ids: Set<number>, patientId: unknown): boolean {
  return typeof patientId === "number" && ids.has(patientId);
}

/**
 * Conversion limited to the coordinator's patients. Every input is filtered to
 * those patients so practice-wide fallbacks cannot leak into her numbers.
 */
export function buildCoordinatorConversion(params: {
  fromYmd: string;
  toYmd: string;
  coordinator: TcCoordinator;
  appointments: AppointmentRecord[];
  appointmentTypes: AppointmentTypeRecord[];
  appointmentTypeDocs?: NpConsultTypeDoc[];
  procedures: ProcedureRecord[];
  plans: TreatmentPlanRecord[];
  payments?: PaymentRecord[];
  patients?: Array<{ patientId: number; dateFirstVisit: string | null }>;
  cdt?: CdtLookup;
}): ConversionSummary {
  const presented = collectPresentedPlans({
    procedures: params.procedures,
    fromYmd: params.fromYmd,
    toYmd: params.toYmd,
  });
  const ids = coordinatorScopePatientIds({
    coordinator: params.coordinator,
    plans: params.plans,
    presented,
  });

  return summarizeConversion({
    fromYmd: params.fromYmd,
    toYmd: params.toYmd,
    appointments: params.appointments.filter((a) => hasPatient(ids, a.patient_id)),
    appointmentTypes: params.appointmentTypes,
    appointmentTypeDocs: params.appointmentTypeDocs,
    procedures: params.procedures.filter((p) => hasPatient(ids, p.patient_id)),
    plans: params.plans.filter((plan) => hasPatient(ids, planPatientId(plan))),
    payments: params.payments?.filter((p) => hasPatient(ids, p.patient_id)),
    cdt: params.cdt,
    firstVisits: params.patients
      ?.filter((p) => ids.has(p.patientId))
      .map((p) => p.dateFirstVisit),
  });
}
