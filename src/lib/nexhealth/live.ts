import { cache } from "react";
import type { AppointmentTypeMixRow } from "@/lib/nexhealth/appointment-mix";
import type { ConversionSummary } from "@/lib/nexhealth/conversion";
import type { ArSummary } from "@/lib/nexhealth/ar";
import type { InsuranceMetrics } from "@/lib/nexhealth/insurance-metrics";
import type { NexAppointment } from "@/lib/nexhealth/client";
import type {
  CategoryProductionRow,
  DentureWarrantyMix,
  MonthlyProductionSeries,
  ProcedureMixRow,
  ProcedureVolume,
  ProviderProduction,
  TreatmentByMonthRow,
} from "@/lib/nexhealth/production";
import type { PaymentMix, FinancingVendorMix } from "@/lib/nexhealth/payment-mix";
import type { TcMetrics } from "@/lib/nexhealth/tc-metrics";
import type { TcCoordinatorRow } from "@/lib/tc/coordinator-metrics";

export type LiveProviderRow = {
  id: string;
  nexId: number;
  name: string;
  appointmentCount: number;
  showCount: number;
  noShowCount: number;
  cancelledCount: number;
  unknownCount: number;
  upcomingCount: number;
  /** NP consult shows (when type IDs configured). */
  npConsultShow: number;
  /** Consult show + same-day sold / first Tx Complete for this provider. */
  sameDayNp: number;
  /** Visit mix for this provider only (PHI-safe counts). */
  appointmentTypes: AppointmentTypeMixRow[];
  /** Ledger / procedure production for this provider. */
  production: ProviderProduction;
};

export type ProcedureCategory = {
  procCatId: number;
  name: string;
  hidden: boolean;
};

export type LiveProduction = {
  available: boolean;
  grossProductionCents: number;
  /** Gross production for SoonerCare patients or SC chart codes (not payment mix). */
  scProductionCents: number;
  collectionsCents: number;
  adjustmentsCents: number;
  netProductionCents: number;
  procedureCount: number;
  chargeCount: number;
  paymentCount: number;
  adjustmentCount: number;
  procedureMix: ProcedureMixRow[];
  productionByCategory: CategoryProductionRow[];
  /** Open Dental categories synced from NexHealth (ProcCat). */
  procedureCategories: ProcedureCategory[];
  procedureVolume: ProcedureVolume;
  collectionRatio: number | null;
  uncategorizedProductionCents: number;
  unmappedCodes: ProcedureMixRow[];
  paymentMix: PaymentMix;
  financingVendorMix: FinancingVendorMix;
  monthlyProduction: MonthlyProductionSeries[];
  treatmentByMonth: TreatmentByMonthRow[];
  dentureWarranty: DentureWarrantyMix;
  partialWarranty: DentureWarrantyMix;
  monthlyCollections: { label: string; monthKey: string; cents: number }[];
};

export type LiveOverview = {
  source: "warehouse";
  locationId: number;
  subdomain: string;
  locationName: string | null;
  range: { start: string; end: string };
  notices: string[];
  providers: LiveProviderRow[];
  appointments: {
    total: number;
    show: number;
    noShow: number;
    cancelled: number;
    unknown: number;
    upcoming: number;
    past: number;
  };
  showRate: number;
  /** Practice-wide visit mix by appointment type. */
  appointmentTypes: AppointmentTypeMixRow[];
  production: LiveProduction;
  conversion: ConversionSummary;
  tcMetrics: TcMetrics;
  tcCoordinators: TcCoordinatorRow[];
  accountsReceivable: ArSummary;
  insurance: InsuranceMetrics;
  lastSyncedAt: string | null;
  warehouseEmpty: boolean;
};

/** Dashboard overview — Mongo warehouse only (NexHealth is sync-only). */
export const loadLiveOverview = cache(
  async (start?: string, end?: string): Promise<LiveOverview> => {
    const { loadWarehouseOverview } = await import(
      "@/lib/mongo/warehouse-overview"
    );
    return loadWarehouseOverview(start, end);
  },
);

export async function loadLiveProviders(): Promise<
  { id: string; name: string }[]
> {
  const overview = await loadLiveOverview();
  return overview.providers.map((p) => ({ id: p.id, name: p.name }));
}

export type { NexAppointment };
export type { AppointmentTypeMixRow };
