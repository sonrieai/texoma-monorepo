import type { CdtLookup } from "@/lib/cdt/categories";
import type {
  NexAppointment,
  NexAppointmentType,
  NexPayment,
  NexProcedure,
  NexProvider,
  NexTreatmentPlan,
} from "@/lib/nexhealth/client";
import type { ConversionSummary } from "@/lib/nexhealth/conversion";
import {
  summarizeTcMetrics,
  type TcMetrics,
} from "@/lib/nexhealth/tc-metrics";
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
  appointments: NexAppointment[];
  appointmentTypes: NexAppointmentType[];
  plans: NexTreatmentPlan[];
  procedures: NexProcedure[];
  payments: NexPayment[];
  providers: NexProvider[];
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
