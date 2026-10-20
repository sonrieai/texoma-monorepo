import type { CdtLookup } from "@/lib/cdt/categories";
import type {
  AppointmentRecord,
  AppointmentTypeRecord,
  PaymentRecord,
  ProcedureRecord,
  ProviderRecord,
  TreatmentPlanRecord,
} from "@/lib/warehouse/types";
import type { ConversionSummary } from "@/lib/warehouse/conversion";
import type { NpConsultTypeDoc } from "@/lib/warehouse/kpi-reference";
import {
  summarizeTcMetrics,
  type TcMetrics,
} from "@/lib/warehouse/tc-metrics";
import { buildCoordinatorConversion } from "@/lib/tc/coordinator-conversion";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";
import { namedTreatmentCoordinators } from "@/lib/tc/presented-plans";

export type TcCoordinatorRow = {
  slug: string;
  name: string;
  coordinator: TcCoordinator;
  metrics: TcMetrics;
  conversion: ConversionSummary;
};

export function buildTcCoordinatorRows(params: {
  fromYmd: string;
  toYmd: string;
  appointments: AppointmentRecord[];
  appointmentTypes: AppointmentTypeRecord[];
  plans: TreatmentPlanRecord[];
  procedures: ProcedureRecord[];
  payments: PaymentRecord[];
  providers: ProviderRecord[];
  appointmentTypeDocs?: NpConsultTypeDoc[];
  patients?: Array<{ patientId: number; dateFirstVisit: string | null }>;
  soonercarePatientIds?: ReadonlySet<number>;
  cdt?: CdtLookup;
  coordinators?: TcCoordinator[];
}): TcCoordinatorRow[] {
  const roster = params.coordinators ?? namedTreatmentCoordinators(params.providers);

  return roster.map((coordinator) => {
    const conversion = buildCoordinatorConversion({
      fromYmd: params.fromYmd,
      toYmd: params.toYmd,
      coordinator,
      appointments: params.appointments,
      appointmentTypes: params.appointmentTypes,
      appointmentTypeDocs: params.appointmentTypeDocs,
      procedures: params.procedures,
      plans: params.plans,
      payments: params.payments,
      patients: params.patients,
      cdt: params.cdt,
    });
    const metrics = summarizeTcMetrics({
      fromYmd: params.fromYmd,
      toYmd: params.toYmd,
      appointments: params.appointments,
      appointmentTypes: params.appointmentTypes,
      appointmentTypeDocs: params.appointmentTypeDocs,
      soonercarePatientIds: params.soonercarePatientIds,
      plans: params.plans,
      procedures: params.procedures,
      payments: params.payments,
      conversion,
      cdt: params.cdt,
      coordinator,
      providers: params.providers,
    });
    return {
      slug: coordinator.slug,
      name: coordinator.name,
      coordinator,
      metrics,
      conversion,
    };
  });
}
