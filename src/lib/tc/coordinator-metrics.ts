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
import {
  summarizeTcMetrics,
  type TcMetrics,
} from "@/lib/warehouse/tc-metrics";
import { buildCoordinatorConversion } from "@/lib/tc/coordinator-conversion";
import {
  discoverTcCoordinators,
  type TcCoordinator,
} from "@/lib/tc/discover-coordinators";

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
  cdt?: CdtLookup;
  coordinators?: TcCoordinator[];
}): TcCoordinatorRow[] {
  const roster =
    params.coordinators ??
    discoverTcCoordinators({
      plans: params.plans,
      appointments: params.appointments,
      appointmentTypes: params.appointmentTypes,
      providers: params.providers,
    });

  return roster.map((coordinator) => {
    const conversion = buildCoordinatorConversion({
      fromYmd: params.fromYmd,
      toYmd: params.toYmd,
      coordinator,
      appointments: params.appointments,
      appointmentTypes: params.appointmentTypes,
      procedures: params.procedures,
      plans: params.plans,
      cdt: params.cdt,
    });
    const metrics = summarizeTcMetrics({
      fromYmd: params.fromYmd,
      toYmd: params.toYmd,
      appointments: params.appointments,
      appointmentTypes: params.appointmentTypes,
      plans: params.plans,
      procedures: params.procedures,
      payments: params.payments,
      conversion,
      cdt: params.cdt,
      coordinator,
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
