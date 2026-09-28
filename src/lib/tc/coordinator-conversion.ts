import type { CdtLookup } from "@/lib/cdt/categories";
import {
  summarizeConversion,
  type ConversionSummary,
} from "@/lib/warehouse/conversion";
import type {
  AppointmentRecord,
  AppointmentTypeRecord,
  ProcedureRecord,
  TreatmentPlanRecord,
} from "@/lib/warehouse/types";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";
import {
  coordinatorPatientIds,
  filterPlansForCoordinator,
} from "@/lib/tc/plan-attribution";

export function buildCoordinatorConversion(params: {
  fromYmd: string;
  toYmd: string;
  coordinator: TcCoordinator;
  appointments: AppointmentRecord[];
  appointmentTypes: AppointmentTypeRecord[];
  procedures: ProcedureRecord[];
  plans: TreatmentPlanRecord[];
  cdt?: CdtLookup;
}): ConversionSummary {
  const coordPlans = filterPlansForCoordinator(params.plans, params.coordinator);
  const patientIds = coordinatorPatientIds(params.plans, params.coordinator);
  const appointments =
    patientIds.size > 0
      ? params.appointments.filter(
          (a) =>
            typeof a.patient_id === "number" && patientIds.has(a.patient_id),
        )
      : [];

  return summarizeConversion({
    fromYmd: params.fromYmd,
    toYmd: params.toYmd,
    appointments,
    appointmentTypes: params.appointmentTypes,
    procedures: params.procedures,
    plans: coordPlans,
    cdt: params.cdt,
  });
}
